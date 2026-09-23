// 存储层：localStorage 读写。整体状态单 key 原子写入，保证批量保存要么全成要么全败。
import { seedHistory } from "../data/catalog";
import type { WorkbenchState } from "../data/types";

const STORAGE_KEY = "dfwlfront-9-workbench-v1";

function emptyState(): WorkbenchState {
  return { drafts: {}, conflicts: {}, history: seedHistory() };
}

function isState(value: unknown): value is WorkbenchState {
  if (!value || typeof value !== "object") return false;
  const state = value as WorkbenchState;
  return (
    !!state.drafts &&
    typeof state.drafts === "object" &&
    !!state.conflicts &&
    typeof state.conflicts === "object" &&
    Array.isArray(state.history)
  );
}

/** 读取工作台状态；无存档或存档损坏时回退到种子数据 */
export function loadState(): WorkbenchState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyState();
  try {
    const parsed: unknown = JSON.parse(raw);
    return isState(parsed) ? parsed : emptyState();
  } catch {
    return emptyState();
  }
}

/** 原子写入整个工作台；写入失败（如配额超限）会抛错，由调用方整批撤回 */
export function saveState(state: WorkbenchState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
