import type { DeskState } from "./types";

export const FUEL_OPTIONS = ["92号汽油", "95号汽油", "98号汽油", "柴油"] as const;

/** 首次打开（无本地存储）时的演示数据，便于直接看到草稿与冲突 */
export function seedState(now: Date): DeskState {
  const day = 24 * 60 * 60 * 1000;
  const later = new Date(now.getTime() + day).toISOString();
  const yesterday = new Date(now.getTime() - day).toISOString();
  return {
    drafts: [
      {
        fuel: "95号汽油",
        base: { price: 8.12, effectiveAt: later, note: "挂牌价例行上调" },
        author: "站长",
        createdAt: yesterday,
        updatedAt: yesterday,
        suggestions: []
      }
    ],
    history: [
      {
        id: "seed-publish-1",
        fuel: "92号汽油",
        values: { price: 7.62, effectiveAt: yesterday, note: "正常调价" },
        publishedBy: "值班经理",
        publishedAt: yesterday,
        mergedSuggestions: 0
      }
    ]
  };
}
