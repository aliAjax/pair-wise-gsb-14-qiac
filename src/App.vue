<script setup lang="ts">
// 页面层：只负责渲染与交互，数据、规则、存储分别来自 data / rules / storage。
import { computed, ref } from "vue";
import { FIELD_DEFS, FIELD_LABELS, FUELS } from "./data/catalog";
import type { BatchRow, Choice, ConflictEntry, DraftEntry, FieldKey, WorkbenchState } from "./data/types";
import {
  applyBatch,
  canPublish,
  discardDraft,
  discardProposal,
  isResolved,
  publish,
  resolveField,
  validateBatch
} from "./rules/workbench";
import { loadState, saveState } from "./storage/localStore";

const state = ref<WorkbenchState>(loadState());
const banner = ref<{ type: "ok" | "err"; text: string } | null>(null);

const filters = ["全部油品", ...FUELS];
const filter = ref(filters[0]);

function blankRow(editor = ""): BatchRow {
  return { fuel: "", price: "", effectiveAt: "", note: "", editor };
}

const rows = ref<BatchRow[]>([blankRow()]);

function addRow() {
  const last = rows.value[rows.value.length - 1];
  rows.value.push(blankRow(last ? last.editor : ""));
}

function removeRow(index: number) {
  rows.value.splice(index, 1);
  if (rows.value.length === 0) rows.value.push(blankRow());
}

/** 统一提交入口：先写存储，成功才替换内存状态；失败则整批撤回 */
function commit(next: WorkbenchState, okText: string): boolean {
  try {
    saveState(next);
  } catch {
    banner.value = { type: "err", text: "提交失败：本地存储写入异常，已整批撤回" };
    return false;
  }
  state.value = next;
  banner.value = { type: "ok", text: okText };
  return true;
}

function submitBatch() {
  const errors = validateBatch(rows.value);
  if (errors.length > 0) {
    banner.value = { type: "err", text: `批次已整批撤回：${errors.join("；")}` };
    return;
  }
  const report = applyBatch(state.value, rows.value, new Date().toISOString());
  const parts: string[] = [];
  if (report.created.length > 0) parts.push(`新建草稿：${report.created.join("、")}`);
  if (report.suggested.length > 0) parts.push(`登记字段级建议：${report.suggested.join("、")}`);
  if (report.skipped.length > 0) parts.push(`内容一致已忽略：${report.skipped.join("、")}`);
  if (commit(report.state, parts.join("；") || "批次已保存")) {
    rows.value = [blankRow(rows.value[0]?.editor ?? "")];
  }
}

function onResolve(fuel: string, field: FieldKey, choice: Choice) {
  commit(resolveField(state.value, fuel, field, choice), `已记录「${fuel}」${FIELD_LABELS[field]}的选择`);
}

function onPublish(fuel: string) {
  const result = publish(state.value, fuel, new Date().toISOString(), crypto.randomUUID());
  if ("error" in result) {
    banner.value = { type: "err", text: result.error };
    return;
  }
  commit(result.state, `已发布「${fuel}」，草稿已清除并保留发布记录`);
}

function onDiscardDraft(fuel: string) {
  commit(discardDraft(state.value, fuel), `已撤回「${fuel}」的草稿`);
}

function onDiscardProposal(fuel: string) {
  commit(discardProposal(state.value, fuel), `已撤回「${fuel}」的变更建议，保留原草稿`);
}

function byFuel(item: { fuel: string }) {
  return filter.value === filters[0] || item.fuel === filter.value;
}

const draftList = computed(() => Object.values(state.value.drafts).filter(byFuel));
const conflictList = computed(() => Object.values(state.value.conflicts).filter(byFuel));
const historyList = computed(() => state.value.history.filter(byFuel));

const metrics = computed(() => {
  const conflicts = Object.values(state.value.conflicts);
  return [
    Object.keys(state.value.drafts).length,
    conflicts.filter((conflict) => !isResolved(conflict)).length,
    state.value.history.length
  ];
});

function resolvedCount(conflict: ConflictEntry): number {
  return conflict.fields.filter((field) => conflict.resolutions[field] !== undefined).length;
}

function fmtTime(value: string): string {
  return value.replace("T", " ");
}

function fmtField(field: FieldKey, entry: DraftEntry): string {
  if (field === "price") return `¥${entry.price.toFixed(2)}`;
  if (field === "effectiveAt") return fmtTime(entry.effectiveAt);
  return entry.note;
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">石油行业前端最小闭环</p>
          <h1>油品价格维护 · 多编辑人离线草稿台</h1>
          <p class="subtitle">
            按油品保存目标价、生效时刻与修订说明；同一油品已有草稿时，后保存者只能提交字段级变更建议，
            冲突逐项确认后才能发布，发布后保留记录并清除草稿。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">TypeScript</span>
          <span class="tag">localStorage</span>
        </div>
      </header>

      <section class="metrics">
        <article class="metric">
          <span>待发布草稿</span>
          <strong>{{ metrics[0] }}</strong>
        </article>
        <article class="metric">
          <span>待确认冲突</span>
          <strong>{{ metrics[1] }}</strong>
        </article>
        <article class="metric">
          <span>发布记录</span>
          <strong>{{ metrics[2] }}</strong>
        </article>
      </section>

      <p v-if="banner" class="banner" :class="banner.type">{{ banner.text }}</p>

      <section class="workspace">
        <form class="panel" @submit.prevent="submitBatch">
          <h2>批量保存草稿</h2>
          <div class="form-grid">
            <div v-for="(row, index) in rows" :key="index" class="batch-row">
              <div class="batch-row-head">
                <span>第 {{ index + 1 }} 行</span>
                <button
                  v-if="rows.length > 1"
                  type="button"
                  class="danger small"
                  @click="removeRow(index)"
                >移除</button>
              </div>
              <label>
                油品
                <select v-model="row.fuel">
                  <option value="">请选择</option>
                  <option v-for="fuel in FUELS" :key="fuel">{{ fuel }}</option>
                </select>
              </label>
              <label>
                目标价（元/升）
                <input v-model="row.price" type="number" step="0.01" min="0" placeholder="如 7.62" />
              </label>
              <label>
                生效时刻
                <input v-model="row.effectiveAt" type="datetime-local" />
              </label>
              <label>
                编辑人
                <input v-model="row.editor" placeholder="填写编辑人姓名" />
              </label>
              <label>
                修订说明
                <textarea v-model="row.note" placeholder="填写本次调价原因" />
              </label>
            </div>
            <div class="actions">
              <button type="button" class="secondary" @click="addRow">添加一行</button>
              <button type="submit">保存批次</button>
            </div>
            <p class="hint">重复油品、非法时刻或存储失败将整批撤回，不会部分生效。</p>
          </div>
        </form>

        <section class="list-panel">
          <div class="toolbar">
            <h2>草稿台</h2>
            <select v-model="filter">
              <option v-for="item in filters" :key="item">{{ item }}</option>
            </select>
          </div>

          <div class="record-grid">
            <div v-if="draftList.length === 0" class="empty">暂无草稿</div>
            <article v-for="draft in draftList" :key="draft.fuel" class="record">
              <div class="record-head">
                <p class="record-title">{{ draft.fuel }} / ¥{{ draft.price.toFixed(2) }}</p>
                <span class="status" :class="{ warn: !!state.conflicts[draft.fuel] }">
                  {{ state.conflicts[draft.fuel]
                    ? (isResolved(state.conflicts[draft.fuel]) ? "冲突已确认" : "冲突待确认")
                    : "可发布" }}
                </span>
              </div>
              <div class="details">
                <span>生效时刻: {{ fmtTime(draft.effectiveAt) }}</span>
                <span>编辑人: {{ draft.editor }}</span>
                <span>保存于: {{ fmtTime(draft.updatedAt.slice(0, 16)) }}</span>
              </div>
              <p class="note">{{ draft.note }}</p>
              <div class="actions">
                <button
                  type="button"
                  :disabled="!canPublish(state, draft.fuel)"
                  @click="onPublish(draft.fuel)"
                >发布</button>
                <button class="danger" type="button" @click="onDiscardDraft(draft.fuel)">撤回草稿</button>
              </div>
              <p v-if="!canPublish(state, draft.fuel)" class="hint">存在未逐项确认的冲突，确认前不得发布。</p>
            </article>
          </div>

          <template v-if="conflictList.length > 0">
            <h2 class="section-title">冲突逐项确认</h2>
            <div class="record-grid">
              <article v-for="conflict in conflictList" :key="conflict.fuel" class="record conflict">
                <div class="record-head">
                  <p class="record-title">{{ conflict.fuel }}</p>
                  <span class="status warn">
                    已确认 {{ resolvedCount(conflict) }}/{{ conflict.fields.length }} 项
                  </span>
                </div>
                <p class="hint">
                  原草稿由「{{ conflict.base.editor }}」保存；「{{ conflict.proposal.editor }}」提交了字段级建议，原草稿未被覆盖。
                </p>
                <table class="conflict-table">
                  <thead>
                    <tr>
                      <th>字段</th>
                      <th>原草稿值</th>
                      <th>建议值</th>
                      <th>选择</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="field in conflict.fields" :key="field">
                      <td>{{ FIELD_LABELS[field] }}</td>
                      <td>{{ fmtField(field, conflict.base) }}</td>
                      <td>{{ fmtField(field, conflict.proposal) }}</td>
                      <td class="choices">
                        <label>
                          <input
                            type="radio"
                            :name="`${conflict.fuel}-${field}`"
                            :checked="conflict.resolutions[field] === 'base'"
                            @change="onResolve(conflict.fuel, field, 'base')"
                          />
                          保留草稿
                        </label>
                        <label>
                          <input
                            type="radio"
                            :name="`${conflict.fuel}-${field}`"
                            :checked="conflict.resolutions[field] === 'proposal'"
                            @change="onResolve(conflict.fuel, field, 'proposal')"
                          />
                          采用建议
                        </label>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div class="actions">
                  <button class="secondary" type="button" @click="onDiscardProposal(conflict.fuel)">撤回建议</button>
                </div>
              </article>
            </div>
          </template>

          <h2 class="section-title">发布历史</h2>
          <div class="record-grid">
            <div v-if="historyList.length === 0" class="empty">暂无发布记录</div>
            <article v-for="record in historyList" :key="record.id" class="record">
              <div class="record-head">
                <p class="record-title">{{ record.fuel }} / ¥{{ record.price.toFixed(2) }}</p>
                <span class="status">{{ record.merged ? "冲突合并" : "直接发布" }}</span>
              </div>
              <div class="details">
                <span>生效时刻: {{ fmtTime(record.effectiveAt) }}</span>
                <span>编辑人: {{ record.editor }}</span>
                <span>发布于: {{ fmtTime(record.publishedAt.slice(0, 16)) }}</span>
              </div>
              <p class="note">{{ record.note }}</p>
            </article>
          </div>
        </section>
      </section>
    </div>
  </main>
</template>
