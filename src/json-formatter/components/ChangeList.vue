<script setup lang="ts">
import { computed } from "vue";
import { formatPath, previewValue, type Change } from "../lib/diff";

const props = defineProps<{
  changes: Change[];
  leftName: string;
  rightName: string;
}>();

const KIND_LABEL: Record<Change["kind"], string> = {
  add: "新增",
  del: "删除",
  mod: "修改",
  move: "移动",
};

/** 变更太多时列表本身会变得没法看，截断并提示 */
const LIMIT = 500;
const visible = computed(() => props.changes.slice(0, LIMIT));
const hiddenCount = computed(() => Math.max(0, props.changes.length - LIMIT));
</script>

<template>
  <div class="change-list">
    <div v-if="!changes.length" class="change-empty">两侧数据一致，没有结构差异。</div>

    <table v-else class="change-table">
      <thead>
        <tr>
          <th class="col-kind">类型</th>
          <th class="col-path">路径</th>
          <th class="col-val">{{ leftName }}</th>
          <th class="col-val">{{ rightName }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(c, i) in visible" :key="i" :class="`row-${c.kind}`">
          <td class="col-kind">
            <span class="kind-tag" :class="`kind-${c.kind}`">{{ KIND_LABEL[c.kind] }}</span>
          </td>
          <td class="col-path">
            <code>{{ formatPath(c.path) }}</code>
          </td>
          <td class="col-val">
            <code v-if="c.kind !== 'add'" class="val-old">{{ previewValue(c.oldValue) }}</code>
            <span v-else class="val-none">—</span>
          </td>
          <td class="col-val">
            <code v-if="c.kind === 'move'" class="val-move">
              移到下标 {{ c.toIndex }}
            </code>
            <code v-else-if="c.kind !== 'del'" class="val-new">
              {{ previewValue(c.newValue) }}
            </code>
            <span v-else class="val-none">—</span>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="hiddenCount" class="change-more">
      还有 {{ hiddenCount }} 处变更未列出，可切到「两列」视图逐行查看。
    </div>
  </div>
</template>
