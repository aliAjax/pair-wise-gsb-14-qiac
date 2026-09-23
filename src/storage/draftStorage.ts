import type { DeskState } from "../data/types";
import { seedState } from "../data/seed";

const STORAGE_KEY = "dfwlfront-9-desk";

function isDeskState(value: unknown): value is DeskState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as DeskState;
  return (
    Array.isArray(state.drafts) &&
    Array.isArray(state.history) &&
    state.drafts.every((d) => typeof d?.fuel === "string" && Array.isArray(d?.suggestions)) &&
    state.history.every((r) => typeof r?.fuel === "string" && typeof r?.publishedAt === "string")
  );
}

/** 读取本地状态；无存档或存档损坏时回退到种子数据 */
export function loadDesk(): DeskState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState(new Date());
    const parsed: unknown = JSON.parse(raw);
    return isDeskState(parsed) ? parsed : seedState(new Date());
  } catch {
    return seedState(new Date());
  }
}

/** 写入本地状态，失败时抛错，由调用方负责回滚内存状态 */
export function saveDesk(state: DeskState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
