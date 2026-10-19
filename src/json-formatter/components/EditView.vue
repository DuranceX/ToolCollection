<script setup lang="ts">
import { ref, computed } from "vue";
import JsonEditor from "./JsonEditor.vue";
import JsonViewer from "./JsonViewer.vue";
import { activeTab, indent, wrap, split, setContent } from "../composables/useTabs";
import { diagnoseText, diagnosticPosition } from "../lib/cm";
import {
  parseJson,
  format,
  describe,
  byteLength,
  formatBytes,
  countLines,
} from "../lib/json";

const editorRef = ref<InstanceType<typeof JsonEditor>>();
const viewerRef = ref<InstanceType<typeof JsonViewer>>();

const text = computed({
  get: () => activeTab.value?.content ?? "",
  set: (v: string) => activeTab.value && setContent(activeTab.value.id, v),
});

const parsed = computed(() => parseJson(text.value));

const diagnostics = computed(() => diagnoseText(text.value));
const errors = computed(() => diagnostics.value.filter((d) => d.severity === "error"));
const warnings = computed(() => diagnostics.value.filter((d) => d.severity === "warning"));

/** 结果区内容：解析成功才格式化，失败时保持上一次可用的输出为空 */
const output = computed(() =>
  parsed.value.ok ? format(parsed.value.value, indent.value) : ""
);

const inputMeta = computed(() => {
  const t = text.value;
  if (!t) return "";
  return `${countLines(t)} 行 · ${formatBytes(byteLength(t))}`;
});

const outputMeta = computed(() => {
  const o = output.value;
  if (!o) return "";
  return `${countLines(o)} 行 · ${formatBytes(byteLength(o))}`;
});

const firstError = computed(() => {
  const e = errors.value[0];
  if (!e) return null;
  const pos = diagnosticPosition(text.value, e);
  return { ...pos, message: e.message, from: e.from };
});

function jumpToError() {
  if (firstError.value) editorRef.value?.focusOffset(firstError.value.from);
}

/* ---------- 分隔条拖动 ---------- */

function onSplitterDown(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement;
  const container = el.parentElement;
  if (!container) return;

  el.classList.add("is-dragging");
  el.setPointerCapture(e.pointerId);
  e.preventDefault();

  const move = (ev: PointerEvent) => {
    const rect = container.getBoundingClientRect();
    const pct = ((ev.clientX - rect.left) / rect.width) * 100;
    split.value = Math.min(80, Math.max(20, pct));
  };

  const up = (ev: PointerEvent) => {
    el.classList.remove("is-dragging");
    el.releasePointerCapture(ev.pointerId);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
  };

  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
}

function onSplitterKey(e: KeyboardEvent) {
  const step = e.shiftKey ? 5 : 2;
  if (e.key === "ArrowLeft") split.value = Math.max(20, split.value - step);
  else if (e.key === "ArrowRight") split.value = Math.min(80, split.value + step);
  else return;
  e.preventDefault();
}

defineExpose({
  focus: () => editorRef.value?.focus(),
  foldAll: () => viewerRef.value?.foldAll(),
  unfoldAll: () => viewerRef.value?.unfoldAll(),
});
</script>

<template>
  <div class="view edit-view" :style="{ '--split': `${split}%` }">
    <section class="panel panel-input" aria-label="JSON 输入">
      <div class="panel-head">
        <span class="panel-title">输入</span>
        <span class="panel-meta">{{ inputMeta }}</span>
      </div>

      <JsonEditor ref="editorRef" v-model="text" :wrap="wrap" />

      <div class="panel-foot">
        <span
          class="badge"
          :class="
            parsed.empty ? '' : errors.length ? 'badge-err' : 'badge-ok'
          "
        >
          {{ parsed.empty ? "等待输入" : errors.length ? "JSON 无效" : "JSON 有效" }}
        </span>

        <span
          v-if="firstError"
          class="status-msg is-err"
          role="button"
          tabindex="0"
          title="点击跳转到出错位置"
          @click="jumpToError"
          @keydown.enter="jumpToError"
        >
          {{ firstError.message }}
        </span>

        <template v-else-if="parsed.ok">
          <span class="status-msg">{{ describe(parsed.value) }}</span>
          <span v-if="warnings.length" class="badge badge-warn">
            {{ warnings.length }} 个重复键
          </span>
        </template>
      </div>
    </section>

    <div
      class="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label="拖动调整左右宽度"
      tabindex="0"
      @pointerdown="onSplitterDown"
      @keydown="onSplitterKey"
    ></div>

    <section class="panel panel-output" aria-label="格式化结果">
      <div class="panel-head">
        <span class="panel-title">结果</span>
        <span class="panel-meta">{{ outputMeta }}</span>
        <div class="panel-head-spacer"></div>
        <slot name="output-actions" />
      </div>

      <JsonViewer v-if="output" ref="viewerRef" :code="output" :wrap="wrap" />
      <div v-else class="pane-empty">
        <template v-if="parsed.empty">
          左侧粘贴 JSON，会自动校验并在这里显示格式化结果。<br />
          Ctrl / Cmd + Enter 格式化，Alt + T 新建标签。
        </template>
        <template v-else>
          修正左侧的语法错误后，这里会显示格式化结果。
        </template>
      </div>
    </section>
  </div>
</template>

