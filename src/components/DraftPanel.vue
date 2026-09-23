<script setup lang="ts">
import type { Draft, DraftField } from "../data/types";
import { canPublish, fieldLabel, formatFieldValue, pendingFieldCount, suggestionResolved } from "../rules/draftRules";

defineProps<{ drafts: Draft[] }>();
const emit = defineEmits<{
  resolve: [fuel: string, suggestionId: string, field: DraftField, choice: "draft" | "suggestion"];
  publish: [fuel: string];
  discard: [fuel: string];
}>();

const fieldsOf = (changes: Record<string, unknown>) => Object.keys(changes) as DraftField[];
</script>

<template>
  <section class="list-panel">
    <div class="toolbar">
      <h2>油品草稿（按油品一份）</h2>
      <span class="hint">同一油品再次保存只会生成字段级变更建议，不会覆盖草稿</span>
    </div>

    <div v-if="drafts.length === 0" class="empty">暂无草稿，请在左侧提交调价批次</div>

    <div class="record-grid">
      <article v-for="draft in drafts" :key="draft.fuel" class="record">
        <div class="record-head">
          <p class="record-title">{{ draft.fuel }}</p>
          <span class="status" :class="{ blocked: !canPublish(draft) }">
            {{ canPublish(draft) ? "可发布" : `待确认 ${pendingFieldCount(draft)} 项` }}
          </span>
        </div>

        <div class="details">
          <span>目标价: {{ formatFieldValue("price", draft.base.price) }}</span>
          <span>生效时刻: {{ formatFieldValue("effectiveAt", draft.base.effectiveAt) }}</span>
          <span>修订说明: {{ draft.base.note }}</span>
          <span>起草人: {{ draft.author }}</span>
        </div>

        <div v-for="suggestion in draft.suggestions" :key="suggestion.id" class="conflict">
          <p class="conflict-head">
            变更建议 · {{ suggestion.author }} · {{ new Date(suggestion.createdAt).toLocaleString("zh-CN") }}
            <span class="status" :class="{ blocked: !suggestionResolved(suggestion) }">
              {{ suggestionResolved(suggestion) ? "已逐项确认" : "待逐项确认" }}
            </span>
          </p>
          <div v-for="field in fieldsOf(suggestion.changes)" :key="field" class="conflict-row">
            <span class="conflict-field">{{ fieldLabel(field) }}</span>
            <label class="choice" :class="{ picked: suggestion.resolutions[field] === 'draft' }">
              <input
                type="radio"
                :name="`${suggestion.id}-${field}`"
                :checked="suggestion.resolutions[field] === 'draft'"
                @change="emit('resolve', draft.fuel, suggestion.id, field, 'draft')"
              />
              草稿 {{ formatFieldValue(field, draft.base[field]) }}
            </label>
            <label class="choice" :class="{ picked: suggestion.resolutions[field] === 'suggestion' }">
              <input
                type="radio"
                :name="`${suggestion.id}-${field}`"
                :checked="suggestion.resolutions[field] === 'suggestion'"
                @change="emit('resolve', draft.fuel, suggestion.id, field, 'suggestion')"
              />
              建议 {{ formatFieldValue(field, suggestion.changes[field] ?? "") }}
            </label>
          </div>
        </div>

        <div class="actions">
          <button
            type="button"
            :disabled="!canPublish(draft)"
            :title="canPublish(draft) ? '发布并清除草稿' : '仍有字段未逐项确认'"
            @click="emit('publish', draft.fuel)"
          >
            发布
          </button>
          <button type="button" class="danger" @click="emit('discard', draft.fuel)">撤回草稿</button>
        </div>
      </article>
    </div>
  </section>
</template>
