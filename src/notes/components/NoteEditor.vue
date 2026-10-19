<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, nextTick } from "vue";
import TagChip from "./TagChip.vue";
import { MAX_TAGS_PER_NOTE, MAX_TAG_LEN, type Note } from "../lib/types.ts";
import type { EditorHandle } from "../lib/editor.ts";

/**
 * 便签编辑弹窗 —— 所见即所得，没有分栏预览。
 *
 * 编辑区就是渲染结果：标题直接是大字号，**粗体** 直接是粗的，
 * 语法标记（#、** 等）平时隐藏，光标落到那一行才显出来方便改。
 *
 * 外壳用原生 <dialog> + showModal()：焦点陷阱、背景 inert、Esc
 * 都交给浏览器，无障碍表现比自己实现更正确。
 */

const props = defineProps<{
  note: Note | null;
  /** 全库已有的标签，用来做补全建议 */
  knownTags?: string[];
}>();

const emit = defineEmits<{
  save: [id: string, text: string];
  close: [];
  remove: [id: string];
  pin: [id: string];
  addTag: [id: string, tag: string];
  removeTag: [id: string, tag: string];
}>();

const dialog = ref<HTMLDialogElement | null>(null);
const host = ref<HTMLDivElement | null>(null);
const draft = ref("");
const askDiscard = ref(false);

let editor: EditorHandle | null = null;
const loading = ref(false);

/**
 * CodeMirror 按需加载。
 *
 * 编辑器有 600 KB 左右，但首屏只需要渲染卡片（用的是轻量的 markdown-it）。
 * 打开弹窗才拉编辑器，首屏就不用为它买单。
 */
let editorModule: typeof import("../lib/editor.ts") | null = null;

async function loadEditorModule() {
  if (!editorModule) {
    editorModule = await import("../lib/editor.ts");
  }
  return editorModule;
}

const dirty = computed(() => !!props.note && draft.value !== props.note.text);

const counts = computed(() => {
  const t = draft.value;
  return { chars: [...t].length, lines: t ? t.split("\n").length : 0 };
});

/* ---------- 生命周期 ---------- */

async function mountEditor(text: string, noteId: string) {
  loading.value = true;
  let mod: typeof import("../lib/editor.ts");
  try {
    mod = await loadEditorModule();
  } finally {
    loading.value = false;
  }

  // 加载期间弹窗可能已经关了，或者换了另一条便签
  if (!host.value || props.note?.id !== noteId) return;

  editor?.destroy();
  editor = mod.createNoteEditor({
    parent: host.value,
    doc: text,
    placeholder: "写点什么…  # 标题　**粗体**　- [ ] 待办　`代码`",
    onChange: (t) => (draft.value = t),
    onSave: commit,
  });
  editor.focusEnd();
}

watch(
  () => props.note,
  async (note) => {
    const el = dialog.value;
    if (!el) return;

    if (note) {
      draft.value = note.text;
      askDiscard.value = false;
      if (!el.open) el.showModal();
      await nextTick();
      void mountEditor(note.text, note.id);
    } else {
      editor?.destroy();
      editor = null;
      if (el.open) el.close();
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  editor?.destroy();
  if (dialog.value?.open) dialog.value.close();
});

/* ---------- 保存 / 放弃 ---------- */

function commit() {
  if (!props.note) return;
  emit("save", props.note.id, draft.value);
  emit("close");
}

function tryClose() {
  if (dirty.value) {
    askDiscard.value = true;
    return;
  }
  emit("close");
}

function discard() {
  askDiscard.value = false;
  emit("close");
}

/** Esc 触发 dialog 的 cancel；拦下来走确认流程 */
function onCancel(e: Event) {
  e.preventDefault();
  tryClose();
}

/** 点内容区之外（遮罩）关闭 */
function onDialogClick(e: MouseEvent) {
  if (e.target === dialog.value) tryClose();
}

function onRemove() {
  if (!props.note) return;
  emit("remove", props.note.id);
  emit("close");
}

/* ---------- 标签 ---------- */

const tagInput = ref("");
const tagFull = computed(() => (props.note?.tags.length ?? 0) >= MAX_TAGS_PER_NOTE);

/** 已有标签里去掉本条已用的，再按输入前缀过滤 */
const suggestions = computed(() => {
  const note = props.note;
  if (!note || tagFull.value) return [];
  const used = new Set(note.tags.map((t) => t.toLowerCase()));
  const q = tagInput.value.trim().toLowerCase();
  return (props.knownTags ?? [])
    .filter((t) => !used.has(t.toLowerCase()))
    .filter((t) => !q || t.toLowerCase().includes(q))
    .slice(0, 8);
});

function submitTag(raw?: string) {
  const note = props.note;
  if (!note) return;
  const value = raw ?? tagInput.value;
  if (!value.trim()) return;
  emit("addTag", note.id, value);
  tagInput.value = "";
}

function onTagKeydown(e: KeyboardEvent) {
  // 逗号也当分隔符，方便一次敲好几个
  if (e.key === "Enter" || e.key === "," || e.key === "，") {
    e.preventDefault();
    submitTag();
  } else if (e.key === "Backspace" && !tagInput.value && props.note?.tags.length) {
    // 输入框空着按退格，删掉最后一个标签
    e.preventDefault();
    emit("removeTag", props.note.id, props.note.tags[props.note.tags.length - 1]);
  }
}
</script>

<template>
  <dialog ref="dialog" class="editor" @cancel="onCancel" @click="onDialogClick">
    <div v-if="note" class="editor-panel">
      <header class="editor-head">
        <button
          class="note-btn"
          type="button"
          :class="{ 'is-on': note.pinned }"
          :title="note.pinned ? '取消置顶' : '置顶'"
          @click="emit('pin', note.id)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 17v5M9 3h6l-1 8 3 3H7l3-3-1-8Z" />
          </svg>
        </button>

        <div class="editor-head-spacer"></div>

        <button class="note-btn is-danger" type="button" title="删除这条便签" @click="onRemove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
          </svg>
        </button>

        <button class="note-btn" type="button" title="关闭" aria-label="关闭" @click="tryClose">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <!-- 编辑区即渲染结果，没有第二栏 -->
      <div class="editor-surface-wrap">
        <div ref="host" class="editor-surface"></div>
        <p v-if="loading" class="editor-loading">正在载入编辑器…</p>
      </div>

      <!-- 标签区 -->
      <div class="editor-tags">
        <svg class="editor-tags-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.6 13.4 12 22l-9-9 8.6-8.6a2 2 0 0 1 1.4-.6h5a2 2 0 0 1 2 2v5a2 2 0 0 1-.4 1.2Z" />
          <circle cx="16.5" cy="7.5" r="1.2" fill="currentColor" />
        </svg>

        <TagChip
          v-for="t in note.tags"
          :key="t"
          :tag="t"
          size="sm"
          removable
          @remove="emit('removeTag', note.id, $event)"
        />

        <div v-if="!tagFull" class="tag-input-wrap">
          <input
            v-model="tagInput"
            class="tag-input"
            type="text"
            :maxlength="MAX_TAG_LEN"
            :placeholder="note.tags.length ? '加标签' : '加标签，回车确认'"
            @keydown="onTagKeydown"
          />
          <div v-if="suggestions.length" class="tag-suggest">
            <button
              v-for="s in suggestions"
              :key="s"
              class="tag-suggest-item"
              type="button"
              @click="submitTag(s)"
            >
              {{ s }}
            </button>
          </div>
        </div>
        <span v-else class="editor-tags-full">最多 {{ MAX_TAGS_PER_NOTE }} 个标签</span>
      </div>

      <footer class="editor-foot">
        <template v-if="askDiscard">
          <span class="editor-warn">有未保存的改动</span>
          <div class="editor-foot-spacer"></div>
          <button class="btn btn-sm" type="button" @click="askDiscard = false">继续编辑</button>
          <button class="btn btn-sm btn-danger" type="button" @click="discard">放弃改动</button>
          <button class="btn btn-sm btn-primary" type="button" @click="commit">保存</button>
        </template>

        <template v-else>
          <span class="editor-meta">{{ counts.lines }} 行 · {{ counts.chars }} 字</span>
          <span v-if="dirty" class="editor-dot" title="有未保存的改动"></span>
          <div class="editor-foot-spacer"></div>
          <span class="editor-hint">Ctrl/Cmd + Enter 保存 · Esc 关闭</span>
          <button class="btn btn-sm" type="button" @click="tryClose">取消</button>
          <button class="btn btn-sm btn-primary" type="button" @click="commit">保存</button>
        </template>
      </footer>
    </div>
  </dialog>
</template>
