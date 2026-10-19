<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { EditorView } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { editorExtensions } from "../lib/cm";

const props = defineProps<{
  modelValue: string;
  wrap: boolean;
  placeholder?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const host = ref<HTMLDivElement>();
let view: EditorView | null = null;
const wrapComp = new Compartment();

/** 区分「用户在编辑器里敲的」和「外部改的 modelValue」，避免回写成环 */
let applyingExternal = false;

onMounted(() => {
  if (!host.value) return;

  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        wrapComp.of(props.wrap ? EditorView.lineWrapping : []),
        ...editorExtensions({
          wrap: false, // 换行交给 compartment 动态控制
          onChange: (text) => {
            if (!applyingExternal) emit("update:modelValue", text);
          },
        }),
      ],
    }),
  });
});

onBeforeUnmount(() => {
  view?.destroy();
  view = null;
});

watch(
  () => props.modelValue,
  (next) => {
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === next) return;

    applyingExternal = true;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: next },
      // 外部替换内容（切标签、格式化）时把光标收到开头，
      // 否则残留的旧选区会落在意想不到的位置
      selection: { anchor: 0 },
    });
    applyingExternal = false;
  }
);

watch(
  () => props.wrap,
  (on) => {
    view?.dispatch({
      effects: wrapComp.reconfigure(on ? EditorView.lineWrapping : []),
    });
  }
);

/** 供父组件跳转到某个字符位置 */
function focusOffset(offset: number): void {
  if (!view) return;
  const pos = Math.min(offset, view.state.doc.length);
  view.focus();
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: "center" }),
  });
}

function focus(): void {
  view?.focus();
}

defineExpose({ focusOffset, focus });
</script>

<template>
  <div ref="host" class="cm-host" :data-placeholder="placeholder"></div>
</template>

<style scoped>
.cm-host {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.cm-host :deep(.cm-editor) {
  height: 100%;
}
</style>
