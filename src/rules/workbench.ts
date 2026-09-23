// 规则层：校验、冲突 diff、合并、发布、撤回。全部为纯函数，不触碰存储与页面。
import { FUELS, FIELD_DEFS } from "../data/catalog";
import type {
  BatchRow,
  Choice,
  ConflictEntry,
  DraftEntry,
  FieldKey,
  PublishRecord,
  WorkbenchState
} from "../data/types";

export interface BatchReport {
  state: WorkbenchState;
  created: string[]; // 新建草稿的油品
  suggested: string[]; // 转为字段级建议的油品
  skipped: string[]; // 与现有草稿完全一致、被忽略的油品
}

/** 校验整批输入；返回错误列表，非空即整批撤回，不得应用任何一行 */
export function validateBatch(rows: BatchRow[]): string[] {
  const errors: string[] = [];
  if (rows.length === 0) {
    return ["批次为空：请至少添加一行"];
  }
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const at = `第 ${index + 1} 行`;
    const fuel = row.fuel.trim();
    if (!fuel) {
      errors.push(`${at}：未选择油品`);
    } else if (!(FUELS as readonly string[]).includes(fuel)) {
      errors.push(`${at}：未知油品「${fuel}」`);
    } else if (seen.has(fuel)) {
      errors.push(`${at}：油品「${fuel}」在批次内重复`);
    } else {
      seen.add(fuel);
    }
    const price = Number(row.price);
    if (!Number.isFinite(price) || price <= 0) {
      errors.push(`${at}：目标价「${row.price}」不是合法正数`);
    }
    if (!isValidTime(row.effectiveAt)) {
      errors.push(`${at}：生效时刻「${row.effectiveAt || "空"}」非法`);
    }
    if (!row.editor.trim()) {
      errors.push(`${at}：未填写编辑人`);
    }
  });
  return errors;
}

function isValidTime(value: string): boolean {
  if (!value.trim()) return false;
  return Number.isFinite(Date.parse(value));
}

function toEntry(row: BatchRow, now: string): DraftEntry {
  return {
    fuel: row.fuel.trim(),
    price: Number(row.price),
    effectiveAt: row.effectiveAt.trim(),
    note: row.note.trim() || "无修订说明",
    editor: row.editor.trim(),
    updatedAt: now
  };
}

/** 双方不一致的字段 */
export function diffFields(a: DraftEntry, b: DraftEntry): FieldKey[] {
  return FIELD_DEFS.filter((def) => a[def.key] !== b[def.key]).map((def) => def.key);
}

/**
 * 应用整批保存（调用前须通过 validateBatch）：
 * 无草稿的油品新建草稿；已有草稿的油品只登记字段级建议，绝不覆盖原草稿。
 */
export function applyBatch(state: WorkbenchState, rows: BatchRow[], now: string): BatchReport {
  const drafts = { ...state.drafts };
  const conflicts = { ...state.conflicts };
  const created: string[] = [];
  const suggested: string[] = [];
  const skipped: string[] = [];

  for (const row of rows) {
    const entry = toEntry(row, now);
    const base = drafts[entry.fuel];
    if (!base) {
      drafts[entry.fuel] = entry;
      created.push(entry.fuel);
      continue;
    }
    const fields = diffFields(base, entry);
    if (fields.length === 0) {
      skipped.push(entry.fuel);
      continue;
    }
    // 原草稿保持不变；新建议替换旧建议，逐项确认随之重置
    conflicts[entry.fuel] = {
      fuel: entry.fuel,
      base,
      proposal: entry,
      fields,
      resolutions: {}
    };
    suggested.push(entry.fuel);
  }

  return { state: { ...state, drafts, conflicts }, created, suggested, skipped };
}

/** 登记某冲突某字段的选择 */
export function resolveField(
  state: WorkbenchState,
  fuel: string,
  field: FieldKey,
  choice: Choice
): WorkbenchState {
  const conflict = state.conflicts[fuel];
  if (!conflict || !conflict.fields.includes(field)) return state;
  return {
    ...state,
    conflicts: {
      ...state.conflicts,
      [fuel]: { ...conflict, resolutions: { ...conflict.resolutions, [field]: choice } }
    }
  };
}

/** 冲突是否已逐项确认完毕 */
export function isResolved(conflict: ConflictEntry): boolean {
  return conflict.fields.every((field) => conflict.resolutions[field] !== undefined);
}

/** 按逐项选择合并出最终草稿 */
export function mergeConflict(conflict: ConflictEntry): DraftEntry {
  const merged = { ...conflict.base };
  for (const field of conflict.fields) {
    if (conflict.resolutions[field] === "proposal") {
      merged[field] = conflict.proposal[field] as never;
    }
  }
  return merged;
}

/** 是否可发布：有草稿，且不存在未逐项确认的冲突 */
export function canPublish(state: WorkbenchState, fuel: string): boolean {
  if (!state.drafts[fuel]) return false;
  const conflict = state.conflicts[fuel];
  return !conflict || isResolved(conflict);
}

/**
 * 发布某油品：生成发布记录并清除对应草稿与冲突。
 * 冲突未逐项确认时拒绝发布。
 */
export function publish(
  state: WorkbenchState,
  fuel: string,
  now: string,
  id: string
): { state: WorkbenchState; record: PublishRecord } | { error: string } {
  const draft = state.drafts[fuel];
  if (!draft) return { error: `油品「${fuel}」没有可发布的草稿` };
  const conflict = state.conflicts[fuel];
  if (conflict && !isResolved(conflict)) {
    return { error: `油品「${fuel}」存在未逐项确认的冲突，不得发布` };
  }
  const entry = conflict ? mergeConflict(conflict) : draft;
  const record: PublishRecord = {
    id,
    fuel,
    price: entry.price,
    effectiveAt: entry.effectiveAt,
    note: entry.note,
    editor: conflict ? `${entry.editor} / ${conflict.proposal.editor}` : entry.editor,
    merged: Boolean(conflict),
    publishedAt: now
  };
  const drafts = { ...state.drafts };
  const conflicts = { ...state.conflicts };
  delete drafts[fuel];
  delete conflicts[fuel];
  return { state: { drafts, conflicts, history: [record, ...state.history] }, record };
}

/** 撤回某油品的草稿（连同其冲突建议） */
export function discardDraft(state: WorkbenchState, fuel: string): WorkbenchState {
  const drafts = { ...state.drafts };
  const conflicts = { ...state.conflicts };
  delete drafts[fuel];
  delete conflicts[fuel];
  return { ...state, drafts, conflicts };
}

/** 仅撤回后保存者的建议，保留原草稿 */
export function discardProposal(state: WorkbenchState, fuel: string): WorkbenchState {
  const conflicts = { ...state.conflicts };
  delete conflicts[fuel];
  return { ...state, conflicts };
}
