<script setup lang="ts">
import { computed } from "vue";
import { highlightJson, highlightWithMark, innerRange } from "../lib/highlight";
import { isGap, type DisplayRow } from "../lib/diff";

const props = defineProps<{
  rows: DisplayRow[];
  leftName: string;
  rightName: string;
}>();

/** 一次性塞进 DOM 的上限。配合 content-visibility 已经够用 */
const MAX_RENDER = 5000;

const shown = computed(() => props.rows.slice(0, MAX_RENDER));
const overflow = computed(() => Math.max(0, props.rows.length - MAX_RENDER));

interface Cell {
  html: string;
  line: number | null;
  cls: string;
}

interface RenderRow {
  gap?: number;
  left?: Cell;
  right?: Cell;
}

const rendered = computed<RenderRow[]>(() =>
  shown.value.map((row) => {
    if (isGap(row)) return { gap: row.count };

    const { l, r, kind, lineL, lineR } = row;

    // 修改行额外算出字符级差异区间
    let lHtml: string;
    let rHtml: string;
    if (kind === "mod" && l !== null && r !== null) {
      const range = innerRange(l, r);
      if (range) {
        lHtml = highlightWithMark(l, range.start, range.endA);
        rHtml = highlightWithMark(r, range.start, range.endB);
      } else {
        lHtml = highlightJson(l);
        rHtml = highlightJson(r);
      }
    } else {
      lHtml = l === null ? "" : highlightJson(l);
      rHtml = r === null ? "" : highlightJson(r);
    }

    const sideCls = (has: boolean, side: "l" | "r") => {
      if (!has) return "is-empty";
      if (kind === "eq") return "";
      if (kind === "mod") return side === "l" ? "is-del" : "is-add";
      return kind === "del" ? "is-del" : "is-add";
    };

    return {
      left: { html: lHtml, line: lineL, cls: sideCls(l !== null, "l") },
      right: { html: rHtml, line: lineR, cls: sideCls(r !== null, "r") },
    };
  })
);
</script>

<template>
  <div class="paired-diff">
    <div class="diff-header">
      <div class="diff-header-cell">{{ leftName }}</div>
      <div class="diff-header-cell">{{ rightName }}</div>
    </div>

    <div class="diff-body">
      <template v-for="(row, i) in rendered" :key="i">
        <div v-if="row.gap" class="diff-gap">⋯ 相同的 {{ row.gap }} 行已折叠</div>

        <div v-else class="diff-row">
          <div class="diff-side" :class="row.left!.cls">
            <span class="diff-ln">{{ row.left!.line ?? "" }}</span>
            <span class="diff-code" v-html="row.left!.html"></span>
          </div>
          <div class="diff-side" :class="row.right!.cls">
            <span class="diff-ln">{{ row.right!.line ?? "" }}</span>
            <span class="diff-code" v-html="row.right!.html"></span>
          </div>
        </div>
      </template>
    </div>

    <div v-if="overflow" class="diff-overflow">
      还有 {{ overflow }} 行未渲染。勾选上方「仅差异」只看差异部分，
      或切到「变更清单」——清单不受行数限制，始终是完整的。
    </div>
  </div>
</template>
