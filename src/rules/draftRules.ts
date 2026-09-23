import type {
  BatchEntry,
  DeskState,
  Draft,
  DraftField,
  DraftValues,
  FieldChoice,
  PublishRecord,
  Suggestion
} from "../data/types";
import { DRAFT_FIELDS, FIELD_LABELS } from "../data/types";

export interface BatchIssue {
  index: number;
  fuel: string;
  message: string;
}

export type BatchResult =
  | { ok: true; state: DeskState }
  | { ok: false; issues: BatchIssue[] };

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 生效时刻必须可解析且晚于当前时刻，否则视为非法时刻 */
export function isValidMoment(value: string, now: Date): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time > now.getTime();
}

function isValidPrice(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 99;
}

/** 单条记录校验，返回字段级错误信息 */
export function validateEntry(entry: BatchEntry, now: Date): string[] {
  const errors: string[] = [];
  if (!entry.fuel.trim()) errors.push("未选择油品");
  if (!entry.author.trim()) errors.push("未填写编辑人");
  if (!isValidPrice(Number(entry.price))) errors.push("目标价需为 0~99 之间的数字");
  if (!isValidMoment(entry.effectiveAt, now)) errors.push("生效时刻非法：需为晚于当前时间的有效时刻");
  if (!entry.note.trim()) errors.push("未填写修订说明");
  return errors;
}

function sameValue(field: DraftField, a: string | number, b: string | number): boolean {
  if (field === "price") return Number(a) === Number(b);
  return String(a).trim() === String(b).trim();
}

/** 计算建议相对草稿的字段级差异，只保留发生变化的字段 */
export function diffChanges(base: DraftValues, entry: BatchEntry): Suggestion["changes"] {
  const changes: Suggestion["changes"] = {};
  for (const field of DRAFT_FIELDS) {
    if (!sameValue(field, base[field], entry[field])) {
      changes[field] = entry[field];
    }
  }
  return changes;
}

/**
 * 整批校验：任一记录非法、批内油品重复、或对已有草稿毫无字段差异，
 * 都判定整批失败，调用方不得落库（整批撤回）。
 */
export function validateBatch(entries: BatchEntry[], drafts: Draft[], now: Date): BatchIssue[] {
  const issues: BatchIssue[] = [];
  const seen = new Map<string, number>();

  entries.forEach((entry, index) => {
    for (const message of validateEntry(entry, now)) {
      issues.push({ index, fuel: entry.fuel, message });
    }

    const fuel = entry.fuel.trim();
    if (fuel) {
      if (seen.has(fuel)) {
        issues.push({ index, fuel, message: `与第 ${(seen.get(fuel) ?? 0) + 1} 条记录油品重复` });
      } else {
        seen.set(fuel, index);
      }
    }

    const existing = drafts.find((draft) => draft.fuel === fuel);
    if (existing && Object.keys(diffChanges(existing.base, entry)).length === 0) {
      issues.push({ index, fuel, message: "与现有草稿完全一致，没有可提交的字段级变更" });
    }
  });

  return issues;
}

/**
 * 应用整批：无草稿的油品新建草稿；已有草稿的油品转为字段级变更建议，
 * 绝不覆盖原草稿。调用前必须先通过 validateBatch。
 */
export function applyBatch(state: DeskState, entries: BatchEntry[], nowIso: string): DeskState {
  const drafts = state.drafts.map((draft) => ({ ...draft, suggestions: [...draft.suggestions] }));

  for (const entry of entries) {
    const existing = drafts.find((draft) => draft.fuel === entry.fuel.trim());
    const values: DraftValues = {
      price: Number(entry.price),
      effectiveAt: entry.effectiveAt,
      note: entry.note.trim()
    };
    if (existing) {
      existing.suggestions.push({
        id: uid(),
        author: entry.author.trim(),
        createdAt: nowIso,
        changes: diffChanges(existing.base, entry),
        resolutions: {}
      });
      existing.updatedAt = nowIso;
    } else {
      drafts.push({
        fuel: entry.fuel.trim(),
        base: values,
        author: entry.author.trim(),
        createdAt: nowIso,
        updatedAt: nowIso,
        suggestions: []
      });
    }
  }

  return { ...state, drafts };
}

/** 提交整批：先校验，全部通过才应用，任一失败则整批撤回 */
export function commitBatch(state: DeskState, entries: BatchEntry[], now: Date): BatchResult {
  if (entries.length === 0) {
    return { ok: false, issues: [{ index: -1, fuel: "", message: "批次为空，请先加入记录" }] };
  }
  const issues = validateBatch(entries, state.drafts, now);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, state: applyBatch(state, entries, now.toISOString()) };
}

/** 建议是否已逐字段裁决完成 */
export function suggestionResolved(suggestion: Suggestion): boolean {
  return Object.keys(suggestion.changes).every((field) => field in suggestion.resolutions);
}

/** 所有建议都逐字段裁决完成后才允许发布 */
export function canPublish(draft: Draft): boolean {
  return draft.suggestions.every(suggestionResolved);
}

export function pendingFieldCount(draft: Draft): number {
  return draft.suggestions.reduce(
    (total, s) => total + Object.keys(s.changes).filter((f) => !(f in s.resolutions)).length,
    0
  );
}

/** 记录某条建议中某一字段的裁决选择 */
export function resolveField(
  state: DeskState,
  fuel: string,
  suggestionId: string,
  field: DraftField,
  choice: FieldChoice
): DeskState {
  const drafts = state.drafts.map((draft) => {
    if (draft.fuel !== fuel) return draft;
    return {
      ...draft,
      suggestions: draft.suggestions.map((s) =>
        s.id === suggestionId ? { ...s, resolutions: { ...s.resolutions, [field]: choice } } : s
      )
    };
  });
  return { ...state, drafts };
}

/** 按裁决结果合并出最终发布值 */
export function mergedValues(draft: Draft): DraftValues {
  const values: DraftValues = { ...draft.base };
  for (const suggestion of draft.suggestions) {
    for (const field of DRAFT_FIELDS) {
      if (suggestion.resolutions[field] === "suggestion" && field in suggestion.changes) {
        (values[field] as string | number) = suggestion.changes[field] as string | number;
      }
    }
  }
  return values;
}

export type PublishResult =
  | { ok: true; state: DeskState; record: PublishRecord }
  | { ok: false; message: string };

/** 发布：生成发布记录并清除该油品草稿；未逐项确认时拒绝发布 */
export function publishDraft(state: DeskState, fuel: string, publishedBy: string, now: Date): PublishResult {
  const draft = state.drafts.find((d) => d.fuel === fuel);
  if (!draft) return { ok: false, message: `未找到 ${fuel} 的草稿` };
  if (!canPublish(draft)) {
    return { ok: false, message: `${fuel} 还有 ${pendingFieldCount(draft)} 个字段未确认，不能发布` };
  }
  const record: PublishRecord = {
    id: uid(),
    fuel,
    values: mergedValues(draft),
    publishedBy: publishedBy.trim() || draft.author,
    publishedAt: now.toISOString(),
    mergedSuggestions: draft.suggestions.length
  };
  return {
    ok: true,
    record,
    state: {
      drafts: state.drafts.filter((d) => d.fuel !== fuel),
      history: [record, ...state.history]
    }
  };
}

/** 撤回某油品的草稿及其全部建议 */
export function discardDraft(state: DeskState, fuel: string): DeskState {
  return { ...state, drafts: state.drafts.filter((d) => d.fuel !== fuel) };
}

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field as DraftField] ?? field;
}

export function formatFieldValue(field: DraftField, value: string | number): string {
  if (field === "price") return `${Number(value).toFixed(2)} 元/升`;
  if (field === "effectiveAt") {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? new Date(time).toLocaleString("zh-CN") : String(value);
  }
  return String(value);
}
