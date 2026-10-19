<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import ThemeToggle from "../shared/components/ThemeToggle.vue";
import NoteCard from "./components/NoteCard.vue";
import NoteEditor from "./components/NoteEditor.vue";
import TagChip from "./components/TagChip.vue";
import { formatBytes } from "../shared/format.ts";
import {
  notes,
  query,
  activeTag,
  allTags,
  visibleNotes,
  stats,
  editingId,
  editingNote,
  saveState,
  saveError,
  addNote,
  updateNote,
  removeNote,
  stopEditing,
  togglePin,
  addTag,
  removeTag,
  exportJson,
  importJson,
  initNotes,
} from "./composables/useNotes.ts";

initNotes();

const fileInput = ref<HTMLInputElement | null>(null);
const importMode = ref<"merge" | "replace">("merge");

/* ---------- toast ---------- */
const toastMsg = ref("");
const toastOn = ref(false);
let toastTimer: number | undefined;

function toast(msg: string) {
  toastMsg.value = msg;
  toastOn.value = true;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastOn.value = false), 2200);
}

/* ---------- 新增 ---------- */

function onAddClick() {
  addNote();
}

/* ---------- 标签 ---------- */

/** 点标签：已在筛选就取消，否则切到它 */
function onTagClick(tag: string) {
  activeTag.value =
    activeTag.value?.toLowerCase() === tag.toLowerCase() ? null : tag;
}

const knownTags = computed(() => allTags.value.map((t) => t.name));

function onAddTag(id: string, raw: string) {
  const res = addTag(id, raw);
  if (res === "duplicate") toast("这个标签已经加过了");
  else if (res === "full") toast("一条便签最多 8 个标签");
}

/* ---------- 导入 ---------- */

function pickFile(mode: "merge" | "replace") {
  importMode.value = mode;
  fileInput.value?.click();
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ""; // 允许重复选同一个文件
  if (!file) return;

  if (file.size > 8 * 1024 * 1024) {
    toast("文件超过 8MB，看起来不像便签数据");
    return;
  }

  try {
    const text = await file.text();
    const res = importJson(text, importMode.value);
    toast(res.message);
  } catch {
    toast("读取文件失败");
  }
}

/* ---------- 状态提示 ---------- */

const saveLabel = computed(() => {
  if (saveState.value === "error") return saveError.value;
  if (saveState.value === "saving") return "保存中…";
  if (saveState.value === "saved") return "已保存到本浏览器";
  return "";
});

const sizeLabel = computed(() => formatBytes(stats.value.bytes));

/* ---------- 快捷键 ---------- */

function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  const typing =
    target?.tagName === "TEXTAREA" ||
    target?.tagName === "INPUT" ||
    target?.isContentEditable;

  // 弹窗打开时不抢快捷键，交给弹窗自己处理
  if (editingId.value) return;

  if (e.altKey && (e.key === "n" || e.key === "N")) {
    e.preventDefault();
    onAddClick();
  } else if ((e.metaKey || e.ctrlKey) && e.key === "f" && !typing) {
    e.preventDefault();
    document.getElementById("noteSearch")?.focus();
  }
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));
</script>

<template>
  <header class="topbar">
    <div class="topbar-inner app-topbar">
      <a class="brand" href="../../index.html">
        <span class="brand-mark" aria-hidden="true">TC</span>
        <span class="brand-name">Tool Collection</span>
      </a>
      <span class="topbar-sep" aria-hidden="true">/</span>
      <span class="topbar-title">便签集</span>
      <div class="topbar-spacer"></div>
      <ThemeToggle />
    </div>
  </header>

  <div class="toolbar">
    <button class="btn btn-primary" type="button" title="新建便签 (Alt+N)" @click="onAddClick">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      新建便签
    </button>

    <span class="toolbar-div" aria-hidden="true"></span>

    <div class="search-wrap">
      <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-4.2-4.2" />
      </svg>
      <input
        id="noteSearch"
        v-model="query"
        class="control search-input"
        type="search"
        placeholder="搜索便签内容 (Ctrl+F)"
      />
      <button
        v-if="query"
        class="search-clear"
        type="button"
        aria-label="清除搜索"
        @click="query = ''"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>

    <div class="toolbar-spacer"></div>

    <div class="toolbar-group">
      <span class="note-stats">
        {{ query || activeTag ? `${stats.matched} / ${stats.total}` : `${stats.total} 条` }}
        <span v-if="stats.pinned" class="dim">&nbsp;· 置顶 {{ stats.pinned }}</span>
        <span class="dim">&nbsp;· {{ sizeLabel }}</span>
      </span>

      <button class="btn" type="button" title="导出为 JSON 文件备份" @click="exportJson">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />
        </svg>
        导出
      </button>

      <button class="btn" type="button" title="从 JSON 文件导入并合并" @click="pickFile('merge')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 16V4M7 8l5-4 5 4M4 20h16" />
        </svg>
        导入
      </button>

      <input
        ref="fileInput"
        type="file"
        accept="application/json,.json"
        class="sr-only"
        @change="onFileChange"
      />
    </div>
  </div>

  <!-- 存储位置说明：localStorage 的局限要说在明处 -->
  <div class="notice" :class="{ 'is-error': saveState === 'error' }">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
    <span v-if="saveState === 'error'">{{ saveError }}</span>
    <span v-else>
      便签存在<strong>当前浏览器</strong>里，换设备或换浏览器看不到，清理站点数据会丢失。
      重要内容记得用「导出」备份一份。
    </span>
    <span class="notice-spacer"></span>
    <span v-if="saveLabel && saveState !== 'error'" class="save-state" :class="`is-${saveState}`">
      {{ saveLabel }}
    </span>
  </div>

  <!-- 标签筛选栏：有标签才出现 -->
  <div v-if="allTags.length" class="tagbar">
    <button
      class="tagbar-all"
      :class="{ 'is-active': !activeTag }"
      type="button"
      @click="activeTag = null"
    >
      全部
      <span class="tag-count">{{ stats.total }}</span>
    </button>

    <TagChip
      v-for="t in allTags"
      :key="t.name"
      :tag="t.name"
      :count="t.count"
      clickable
      :active="activeTag?.toLowerCase() === t.name.toLowerCase()"
      @click="onTagClick"
    />
  </div>

  <!-- 画板 -->
  <main class="board">
    <!-- 新建按钮在最前，新便签也插到最前，位置一致 -->
    <button
      v-if="!query"
      class="note-add"
      type="button"
      title="新建便签 (Alt+N)"
      @click="onAddClick"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <path d="M12 6v12M6 12h12" />
      </svg>
      <span>新建便签</span>
    </button>

    <NoteCard
      v-for="note in visibleNotes"
      :key="note.id"
      :note="note"
      :active-tag="activeTag"
      @open="editingId = $event"
      @remove="removeNote"
      @pin="togglePin"
      @tag="onTagClick"
    />

    <div v-if="!notes.length" class="board-empty">
      <p>还没有便签。点上面的「新建便签」开始写。</p>
      <p class="dim">支持 Markdown：<code># 标题</code>、<code>**粗体**</code>、<code>- [ ] 待办</code>、<code>`代码`</code></p>
    </div>

    <div v-else-if="!visibleNotes.length" class="board-empty">
      <p v-if="query && activeTag">「{{ activeTag }}」里没有匹配「{{ query }}」的便签。</p>
      <p v-else-if="query">没有匹配「{{ query }}」的便签。</p>
      <p v-else>「{{ activeTag }}」下还没有便签。</p>
    </div>
  </main>

  <NoteEditor
    :note="editingNote"
    :known-tags="knownTags"
    @save="updateNote"
    @close="stopEditing"
    @remove="removeNote"
    @pin="togglePin"
    @add-tag="onAddTag"
    @remove-tag="removeTag"
  />

  <div class="toast" :class="{ show: toastOn }" role="status" aria-live="polite">
    {{ toastMsg }}
  </div>
</template>
