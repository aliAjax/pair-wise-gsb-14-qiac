<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import type { BatchEntry } from "../data/types";
import type { BatchIssue } from "../rules/draftRules";
import { FUEL_OPTIONS } from "../data/seed";
import { formatFieldValue } from "../rules/draftRules";

const emit = defineEmits<{ commit: [entries: BatchEntry[]] }>();
const props = defineProps<{ issues: BatchIssue[] }>();

const blank = () => ({ author: "", fuel: "", price: "", effectiveAt: "", note: "" });
const form = reactive(blank());
const staged = ref<BatchEntry[]>([]);

const minMoment = computed(() => {
  const now = new Date(Date.now() + 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
});

function stage() {
  staged.value.push({
    author: form.author.trim(),
    fuel: form.fuel,
    price: Number(form.price),
    effectiveAt: form.effectiveAt ? new Date(form.effectiveAt).toISOString() : "",
    note: form.note.trim()
  });
  Object.assign(form, blank());
}

function unstage(index: number) {
  staged.value.splice(index, 1);
}

function commit() {
  emit("commit", [...staged.value]);
}

/** 提交成功后由父组件调用，清空已入批的记录 */
function clearStaged() {
  staged.value = [];
}

defineExpose({ clearStaged });
</script>

<template>
  <form class="panel" @submit.prevent="stage">
    <h2>调价批次</h2>
    <div class="form-grid">
      <label>
        编辑人
        <input v-model="form.author" placeholder="填写编辑人姓名" required />
      </label>
      <label>
        油品
        <select v-model="form.fuel" required>
          <option value="">请选择</option>
          <option v-for="option in FUEL_OPTIONS" :key="option">{{ option }}</option>
        </select>
      </label>
      <label>
        目标价(元/升)
        <input v-model="form.price" type="number" step="0.01" min="0.01" max="99" placeholder="如 7.85" required />
      </label>
      <label>
        生效时刻
        <input v-model="form.effectiveAt" type="datetime-local" :min="minMoment" required />
      </label>
      <label>
        修订说明
        <textarea v-model="form.note" placeholder="说明本次调价原因" required />
      </label>
      <button type="submit" class="secondary">加入批次</button>
    </div>

    <div v-if="staged.length" class="batch-list">
      <h3>待提交（{{ staged.length }} 条）</h3>
      <article v-for="(entry, index) in staged" :key="index" class="batch-item">
        <div>
          <strong>{{ entry.fuel }}</strong>
          <span>{{ formatFieldValue("price", entry.price) }} · {{ formatFieldValue("effectiveAt", entry.effectiveAt) }}</span>
          <span>{{ entry.author }}：{{ entry.note }}</span>
        </div>
        <button type="button" class="danger" @click="unstage(index)">移出</button>
      </article>
      <button type="button" @click="commit">提交批次（{{ staged.length }} 条整批校验）</button>
    </div>

    <div v-if="props.issues.length" class="issues">
      <h3>整批已撤回，请修正后重新提交</h3>
      <ul>
        <li v-for="(issue, i) in props.issues" :key="i">
          第 {{ issue.index + 1 }} 条{{ issue.fuel ? `（${issue.fuel}）` : "" }}：{{ issue.message }}
        </li>
      </ul>
    </div>
  </form>
</template>
