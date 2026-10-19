<script setup lang="ts">
import { ref, computed } from "vue";
import ChangeList from "./ChangeList.vue";
import PairedDiff from "./PairedDiff.vue";
import { tabs, tabById, leftId, rightId, indent, diffOnly } from "../composables/useTabs";
import { parseJson, indentOf } from "../lib/json";
import { computeDiff, collapseEqual } from "../lib/diff";

type Panel = "list" | "paired";
const panel = ref<Panel>("paired");

const left = computed(() => tabById(leftId.value));
const right = computed(() => tabById(rightId.value));

const leftParsed = computed(() => (left.value ? parseJson(left.value.content) : null));
const rightParsed = computed(() => (right.value ? parseJson(right.value.content) : null));

/** 不满足对比前提时的说明文案 */
const blocker = computed(() => {
  if (tabs.value.length < 2) {
    return "对比需要至少两个标签。点击标签栏右侧的 + 新建一个，把另一份 JSON 粘进去。";
  }
  if (!left.value || !right.value) return "请在上方选择要对比的两个标签。";
  if (left.value.id === right.value.id) return "左右选择了同一个标签，换一个再看。";
  if (leftParsed.value?.empty) return `「${left.value.name}」是空的。`;
  if (rightParsed.value?.empty) return `「${right.value.name}」是空的。`;
  if (!leftParsed.value?.ok) {
    return `「${left.value.name}」不是合法 JSON，无法做结构化对比。先在编辑模式修好它。`;
  }
  if (!rightParsed.value?.ok) {
    return `「${right.value.name}」不是合法 JSON，无法做结构化对比。先在编辑模式修好它。`;
  }
  return null;
});

const result = computed(() => {
  if (blocker.value) return null;
  const ind = indentOf(indent.value);
  return computeDiff(
    leftParsed.value!.value,
    rightParsed.value!.value,
    typeof ind === "number" ? " ".repeat(ind) : ind
  );
});

const displayRows = computed(() => {
  if (!result.value) return [];
  return diffOnly.value ? collapseEqual(result.value.rows) : result.value.rows;
});

const leftName = computed(() => left.value?.name ?? "左");
const rightName = computed(() => right.value?.name ?? "右");
</script>

<template>
  <div class="view compare-view">
    <div v-if="blocker" class="pane-empty">{{ blocker }}</div>

    <template v-else-if="result">
      <div class="diff-summary">
        <span class="badge" :class="result.identical ? 'badge-ok' : 'badge-warn'">
          {{ result.identical ? "两侧一致" : "存在差异" }}
        </span>

        <template v-if="!result.identical">
          <span class="diff-stat mod">修改 {{ result.stats.mod }}</span>
          <span class="diff-stat add">新增 {{ result.stats.add }}</span>
          <span class="diff-stat del">删除 {{ result.stats.del }}</span>
          <span v-if="result.stats.move" class="diff-stat move">
            移动 {{ result.stats.move }}
          </span>
        </template>

        <button
          v-if="result.truncated"
          class="badge badge-warn badge-btn"
          type="button"
          title="两列视图行数过多已截断；变更清单不受影响，仍是完整的。点击查看"
          @click="panel = 'list'"
        >
          两列已截断 · 看清单
        </button>

        <div class="diff-summary-spacer"></div>

        <div class="mode-switch">
          <button
            class="mode-btn"
            :class="{ 'is-active': panel === 'paired' }"
            type="button"
            @click="panel = 'paired'"
          >
            两列
          </button>
          <button
            class="mode-btn"
            :class="{ 'is-active': panel === 'list' }"
            type="button"
            @click="panel = 'list'"
          >
            变更清单
            <span v-if="result.changes.length" class="mode-count">
              {{ result.changes.length }}
            </span>
          </button>
        </div>
      </div>

      <div class="compare-body">
        <PairedDiff
          v-if="panel === 'paired'"
          :rows="displayRows"
          :left-name="leftName"
          :right-name="rightName"
        />
        <ChangeList
          v-else
          :changes="result.changes"
          :left-name="leftName"
          :right-name="rightName"
        />
      </div>
    </template>
  </div>
</template>
