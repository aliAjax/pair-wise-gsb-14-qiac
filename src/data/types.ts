// 数据层：类型定义。草稿、冲突、发布历史均按油品（fuel）对应。

/** 参与冲突合并的字段 */
export type FieldKey = "price" | "effectiveAt" | "note";

/** 字段级选择：保留原草稿 / 采用新建议 */
export type Choice = "base" | "proposal";

/** 某油品的一份离线草稿（同一油品同一时刻只允许一份） */
export interface DraftEntry {
  fuel: string;
  price: number; // 目标价（元/升）
  effectiveAt: string; // 生效时刻（datetime-local 串）
  note: string; // 修订说明
  editor: string; // 编辑人
  updatedAt: string; // 草稿保存时刻 ISO
}

/** 后保存者对同一油品提交的字段级变更建议 */
export interface ConflictEntry {
  fuel: string;
  base: DraftEntry; // 原草稿（不可被覆盖）
  proposal: DraftEntry; // 建议值
  fields: FieldKey[]; // 双方不一致的字段
  resolutions: Partial<Record<FieldKey, Choice>>; // 逐字段确认结果
}

/** 发布记录：发布后保留，草稿随之清除 */
export interface PublishRecord {
  id: string;
  fuel: string;
  price: number;
  effectiveAt: string;
  note: string;
  editor: string;
  merged: boolean; // 是否经过冲突合并
  publishedAt: string;
}

/** 工作台整体状态，三个集合都按油品对应 */
export interface WorkbenchState {
  drafts: Record<string, DraftEntry>;
  conflicts: Record<string, ConflictEntry>;
  history: PublishRecord[];
}

/** 批量提交里的一行原始输入（保存前未校验） */
export interface BatchRow {
  fuel: string;
  price: string;
  effectiveAt: string;
  note: string;
  editor: string;
}
