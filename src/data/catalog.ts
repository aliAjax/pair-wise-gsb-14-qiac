// 数据层：静态目录与种子数据。
import type { FieldKey, PublishRecord } from "./types";

export const FUELS = ["92号汽油", "95号汽油", "98号汽油", "柴油"] as const;

export const FIELD_DEFS: ReadonlyArray<{ key: FieldKey; label: string }> = [
  { key: "price", label: "目标价" },
  { key: "effectiveAt", label: "生效时刻" },
  { key: "note", label: "修订说明" }
];

export const FIELD_LABELS: Record<FieldKey, string> = {
  price: "目标价",
  effectiveAt: "生效时刻",
  note: "修订说明"
};

/** 首次打开时的发布历史种子（沿用原页面的两条记录） */
export function seedHistory(): PublishRecord[] {
  return [
    {
      id: "seed-1",
      fuel: "92号汽油",
      price: 7.62,
      effectiveAt: "2026-06-30T00:00",
      note: "正常调价",
      editor: "站长",
      merged: false,
      publishedAt: new Date(Date.now() - 86400000).toISOString()
    },
    {
      id: "seed-2",
      fuel: "柴油",
      price: 7.18,
      effectiveAt: "2026-06-30T00:00",
      note: "等待复核",
      editor: "值班经理",
      merged: false,
      publishedAt: new Date(Date.now() - 2 * 86400000).toISOString()
    }
  ];
}
