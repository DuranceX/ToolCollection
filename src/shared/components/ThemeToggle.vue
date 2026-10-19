<script setup lang="ts">
import { useTheme } from "../theme.ts";

const { theme, label, toggle } = useTheme();
</script>

<template>
  <button
    class="btn btn-icon btn-ghost"
    type="button"
    :title="`当前${label}，点击切换`"
    :aria-label="`当前${label}，点击切换主题`"
    @click="toggle"
  >
    <!-- 亮色时显示太阳 -->
    <svg
      v-if="theme === 'light'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    >
      <circle cx="12" cy="12" r="4.2" />
      <path
        d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"
      />
    </svg>

    <!-- 暗色时显示月亮 -->
    <svg
      v-else
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a7 7 0 0 0 11.1 11.1Z" />
    </svg>
  </button>
</template>
