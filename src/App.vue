<script setup lang="ts">
import { computed, ref } from "vue";
import type { BatchEntry, DeskState, DraftField, FieldChoice } from "./data/types";
import { commitBatch, discardDraft, pendingFieldCount, publishDraft, resolveField } from "./rules/draftRules";
import type { BatchIssue } from "./rules/draftRules";
import { loadDesk, saveDesk } from "./storage/draftStorage";
import BatchPanel from "./components/BatchPanel.vue";
import DraftPanel from "./components/DraftPanel.vue";
import HistoryPanel from "./components/HistoryPanel.vue";

const state = ref<DeskState>(loadDesk());
const issues = ref<BatchIssue[]>([]);
const notice = ref("");
const batchPanel = ref<InstanceType<typeof BatchPanel> | null>(null);

const metrics = computed(() => [
  state.value.drafts.length,
  state.value.drafts.reduce((total, draft) => total + pendingFieldCount(draft), 0),
  state.value.history.length
]);

/** 事务式落库：写入失败则回滚内存状态，保证整批撤回 */
function transact(next: DeskState, okMessage: string): boolean {
  const previous = state.value;
  try {
    saveDesk(next);
    state.value = next;
    notice.value = okMessage;
    return true;
  } catch {
    state.value = previous;
    notice.value = "提交失败，已整批撤回，请重试";
    return false;
  }
}

function onCommit(entries: BatchEntry[]) {
  const result = commitBatch(state.value, entries, new Date());
  if (!result.ok) {
    issues.value = result.issues;
    notice.value = "";
    return;
  }
  if (transact(result.state, `批次已入库：新增/更新 ${entries.length} 条`)) {
    issues.value = [];
    batchPanel.value?.clearStaged();
  }
}

function onResolve(fuel: string, suggestionId: string, field: DraftField, choice: FieldChoice) {
  transact(resolveField(state.value, fuel, suggestionId, field, choice), "");
}

function onPublish(fuel: string) {
  const result = publishDraft(state.value, fuel, "当班负责人", new Date());
  if (!result.ok) {
    notice.value = result.message;
    return;
  }
  transact(result.state, `${fuel} 已发布，草稿已清除`);
}

function onDiscard(fuel: string) {
  transact(discardDraft(state.value, fuel), `${fuel} 草稿已撤回`);
}
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">石油行业 · 多编辑人离线草稿台</p>
          <h1>油品价格维护</h1>
          <p class="subtitle">
            按油品保存目标价、生效时刻与修订说明；同一油品已有草稿时，后保存者只能提交字段级变更建议，
            冲突逐字段确认后方可发布，发布后保留记录并清除草稿。
          </p>
        </div>
      </header>

      <section class="metrics">
        <article class="metric"><span>草稿油品数</span><strong>{{ metrics[0] }}</strong></article>
        <article class="metric"><span>待确认字段</span><strong>{{ metrics[1] }}</strong></article>
        <article class="metric"><span>已发布记录</span><strong>{{ metrics[2] }}</strong></article>
      </section>

      <p v-if="notice" class="notice">{{ notice }}</p>

      <section class="workspace">
        <BatchPanel ref="batchPanel" :issues="issues" @commit="onCommit" />
        <DraftPanel
          :drafts="state.drafts"
          @resolve="onResolve"
          @publish="onPublish"
          @discard="onDiscard"
        />
      </section>

      <HistoryPanel :history="state.history" />
    </div>
  </main>
</template>
