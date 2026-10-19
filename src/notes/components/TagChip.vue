<script setup lang="ts">
import { computed } from "vue";
import { TAG_HUES } from "../lib/types.ts";
import { hueOf } from "../composables/useNotes.ts";

/**
 * 标签胶囊。颜色从全局分配表取（hueOf），同名标签在任何位置都是同一个颜色。
 *
 * 具体色值走 hsl()，只换 hue，饱和度和亮度固定，
 * 这样八种颜色的视觉权重一致，不会有一个特别跳。
 */

const props = defineProps<{
  tag: string;
  /** 可点击（筛选） */
  clickable?: boolean;
  /** 显示删除按钮 */
  removable?: boolean;
  /** 高亮（正在筛选这个标签） */
  active?: boolean;
  /** 右侧计数 */
  count?: number;
  size?: "sm" | "md";
}>();

const emit = defineEmits<{
  click: [tag: string];
  remove: [tag: string];
}>();

const hue = computed(() => TAG_HUES[hueOf(props.tag)].h);
</script>

<template>
  <component
    :is="clickable ? 'button' : 'span'"
    class="tag"
    :class="[`tag-${size ?? 'md'}`, { 'is-active': active, 'is-clickable': clickable }]"
    :style="{ '--tag-h': hue }"
    :type="clickable ? 'button' : undefined"
    :title="clickable ? (active ? `取消筛选「${tag}」` : `只看「${tag}」`) : tag"
    @click="clickable && emit('click', tag)"
  >
    <span class="tag-name">{{ tag }}</span>
    <span v-if="count !== undefined" class="tag-count">{{ count }}</span>
    <button
      v-if="removable"
      class="tag-x"
      type="button"
      :title="`移除标签「${tag}」`"
      :aria-label="`移除标签 ${tag}`"
      @click.stop="emit('remove', tag)"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  </component>
</template>
