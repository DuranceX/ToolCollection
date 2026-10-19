<script setup lang="ts">
import { computed, ref } from "vue";
import TagChip from "./TagChip.vue";
import { renderMarkdown } from "../lib/markdown.ts";
import type { Note } from "../lib/types.ts";

/**
 * 便签卡片。只负责展示 —— 固定高度、内容超出截断，
 * 点击交给父组件打开编辑弹窗，卡片本身不可直接编辑。
 */

const props = defineProps<{
  note: Note;
  /** 正在筛选的标签，卡片上对应的那枚要高亮 */
  activeTag?: string | null;
}>();

const emit = defineEmits<{
  open: [id: string];
  remove: [id: string];
  pin: [id: string];
  tag: [tag: string];
}>();

const confirmDelete = ref(false);

const html = computed(() => renderMarkdown(props.note.text));

/** 卡片窄，最多摆 3 枚，其余用 +N 收起 */
const MAX_CHIPS = 3;
const shownTags = computed(() => props.note.tags.slice(0, MAX_CHIPS));
const extraTags = computed(() => Math.max(0, props.note.tags.length - MAX_CHIPS));

const timeLabel = computed(() => {
  const d = new Date(props.note.updatedAt);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d.toDateString() === now.toDateString()) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
});

const fullTime = computed(() => new Date(props.note.updatedAt).toLocaleString());

const isActiveTag = (t: string) =>
  !!props.activeTag && t.toLowerCase() === props.activeTag.toLowerCase();
</script>

<template>
  <article class="note" :class="{ 'is-pinned': note.pinned }">
    <!-- 正文区整块可点，点开弹窗编辑 -->
    <div
      class="note-body md"
      role="button"
      tabindex="0"
      :aria-label="`编辑便签：${note.text.slice(0, 30) || '空便签'}`"
      title="点击编辑"
      @click="emit('open', note.id)"
      @keydown.enter.prevent="emit('open', note.id)"
      @keydown.space.prevent="emit('open', note.id)"
    >
      <div v-if="note.text.trim()" v-html="html"></div>
      <span v-else class="note-empty-text">空便签，点击编辑</span>
    </div>

    <div v-if="note.tags.length" class="note-tags">
      <TagChip
        v-for="t in shownTags"
        :key="t"
        :tag="t"
        size="sm"
        clickable
        :active="isActiveTag(t)"
        @click="emit('tag', $event)"
      />
      <span v-if="extraTags" class="note-tags-more" :title="note.tags.join('、')">
        +{{ extraTags }}
      </span>
    </div>

    <div class="note-bar">
      <span class="note-time" :title="fullTime">{{ timeLabel }}</span>

      <button
        class="note-btn"
        type="button"
        :class="{ 'is-on': note.pinned }"
        :title="note.pinned ? '取消置顶' : '置顶'"
        @click.stop="emit('pin', note.id)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 17v5M9 3h6l-1 8 3 3H7l3-3-1-8Z" />
        </svg>
      </button>

      <button
        class="note-btn is-danger"
        type="button"
        :title="confirmDelete ? '再点一次确认删除' : '删除'"
        @click.stop="confirmDelete ? emit('remove', note.id) : (confirmDelete = true)"
        @blur="confirmDelete = false"
      >
        <svg v-if="!confirmDelete" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
        </svg>
        <span v-else class="confirm-text">确认？</span>
      </button>
    </div>
  </article>
</template>
