<script setup lang="ts">
import { computed, ref } from "vue";
import type { PublishRecord } from "../data/types";
import { FUEL_OPTIONS } from "../data/seed";
import { formatFieldValue } from "../rules/draftRules";

const props = defineProps<{ history: PublishRecord[] }>();

const filter = ref("全部油品");
const filters = ["全部油品", ...FUEL_OPTIONS];

const rows = computed(() =>
  filter.value === "全部油品" ? props.history : props.history.filter((r) => r.fuel === filter.value)
);
</script>

<template>
  <section class="list-panel">
    <div class="toolbar">
      <h2>发布历史</h2>
      <select v-model="filter">
        <option v-for="item in filters" :key="item">{{ item }}</option>
      </select>
    </div>

    <div v-if="rows.length === 0" class="empty">暂无发布记录</div>

    <div class="record-grid">
      <article v-for="record in rows" :key="record.id" class="record">
        <div class="record-head">
          <p class="record-title">{{ record.fuel }}</p>
          <span class="status">已发布</span>
        </div>
        <div class="details">
          <span>目标价: {{ formatFieldValue("price", record.values.price) }}</span>
          <span>生效时刻: {{ formatFieldValue("effectiveAt", record.values.effectiveAt) }}</span>
          <span>修订说明: {{ record.values.note }}</span>
          <span>发布人: {{ record.publishedBy }}</span>
          <span>发布时间: {{ new Date(record.publishedAt).toLocaleString("zh-CN") }}</span>
          <span>合并建议: {{ record.mergedSuggestions }} 条</span>
        </div>
      </article>
    </div>
  </section>
</template>
