<script setup lang="ts">
import { computed } from "vue";

/**
 * 首页卡片。工具和相关链接共用，只差跳转方式：
 * 工具是站内相对链接，链接开新窗口并带一个外链角标。
 */

const props = defineProps<{
  name: string;
  desc: string;
  href: string;
  tags: string[];
  /** SVG 内容，viewBox 统一 0 0 24 24 */
  icon: string;
  /** 站外链接 */
  external?: boolean;
  /** 占位：还没做好，不可点 */
  soon?: boolean;
}>();

// soon 的卡片不该是链接 —— 让它可聚焦却点不动是更糟的体验
const tag = computed(() => (props.soon ? "div" : "a"));
</script>

<template>
  <component
    :is="tag"
    class="card"
    :class="{ 'card-soon': soon }"
    :href="soon ? undefined : href"
    :target="external ? '_blank' : undefined"
    :rel="external ? 'noopener noreferrer' : undefined"
  >
    <div class="card-top">
      <span class="card-icon" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          v-html="icon"
        />
      </span>
      <h3>{{ name }}</h3>

      <!-- 外链角标：告诉用户这会离开本站 -->
      <svg
        v-if="external"
        class="card-ext"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M7 17 17 7M17 7H9M17 7v8" />
      </svg>
    </div>

    <p>{{ desc }}</p>

    <div class="card-tags">
      <span v-for="t in tags" :key="t" class="tag">{{ t }}</span>
    </div>
  </component>
</template>
