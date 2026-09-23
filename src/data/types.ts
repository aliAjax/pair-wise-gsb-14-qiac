/** 可编辑的业务字段，草稿与变更建议都围绕这三个字段展开 */
export type DraftField = "price" | "effectiveAt" | "note";

export const DRAFT_FIELDS: readonly DraftField[] = ["price", "effectiveAt", "note"];

export const FIELD_LABELS: Record<DraftField, string> = {
  price: "目标价(元/升)",
  effectiveAt: "生效时刻",
  note: "修订说明"
};

/** 一次调价的三要素：目标价、生效时刻、修订说明 */
export interface DraftValues {
  price: number;
  effectiveAt: string;
  note: string;
}

/** 批次中的一条待提交记录 */
export interface BatchEntry extends DraftValues {
  fuel: string;
  author: string;
}

export type FieldChoice = "draft" | "suggestion";

/** 后保存者提交的字段级变更建议（只记录与草稿不同的字段） */
export interface Suggestion {
  id: string;
  author: string;
  createdAt: string;
  changes: Partial<Record<DraftField, string | number>>;
  /** 逐字段裁决结果，全部字段都有选择后才算裁决完成 */
  resolutions: Partial<Record<DraftField, FieldChoice>>;
}

/** 某一油品的离线草稿，同一油品同一时刻只允许存在一份 */
export interface Draft {
  fuel: string;
  base: DraftValues;
  author: string;
  createdAt: string;
  updatedAt: string;
  suggestions: Suggestion[];
}

/** 发布记录，发布后草稿清除、记录保留 */
export interface PublishRecord {
  id: string;
  fuel: string;
  values: DraftValues;
  publishedBy: string;
  publishedAt: string;
  mergedSuggestions: number;
}

/** 整个草稿台的可持久化状态 */
export interface DeskState {
  drafts: Draft[];
  history: PublishRecord[];
}
