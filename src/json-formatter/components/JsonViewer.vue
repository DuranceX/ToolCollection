<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { EditorView } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { foldAll, unfoldAll } from "@codemirror/language";
import { viewerExtensions } from "../lib/cm";

const props = defineProps<{
  code: string;
  wrap: boolean;
}>();

const host = ref<HTMLDivElement>();
let view: EditorView | null = null;
const wrapComp = new Compartment();

onMounted(() => {
  if (!host.value) return;
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.code,
      extensions: [
        wrapComp.of(props.wrap ? EditorView.lineWrapping : []),
        ...viewerExtensions({ wrap: false }),
      ],
    }),
  });
});

onBeforeUnmount(() => {
  view?.destroy();
  view = null;
});

watch(
  () => props.code,
  (next) => {
    if (!view || view.state.doc.toString() === next) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: next },
    });
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

defineExpose({
  foldAll: () => view && foldAll(view),
  unfoldAll: () => view && unfoldAll(view),
});
</script>

<template>
  <div ref="host" class="cm-host"></div>
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
