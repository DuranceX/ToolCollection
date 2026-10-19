import { ref, computed, onMounted, onUnmounted } from "vue";

/**
 * 明暗主题，只有两个状态。
 *
 * 打开页面时跟随系统；用户手动切过之后就记住他的选择，不再被系统改动带走。
 * 也就是说 localStorage 里没有值 = 跟随系统，有值 = 用户已经定了。
 *
 * 首次应用由各页面 HTML 里的内联脚本完成（避免刷新闪白），
 * 这里负责运行时切换，以及给需要知道当前主题的地方提供响应式来源。
 */

export type Theme = "light" | "dark";

const STORAGE_KEY = "tc-theme";

/** 读用户显式选过的主题；从未选过返回 null */
function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* 隐私模式下 localStorage 会抛 */
  }
  return null;
}

const media = window.matchMedia("(prefers-color-scheme: dark)");

// 模块级单例，多个组件共享同一份状态
const stored = ref<Theme | null>(readStored());
const systemDark = ref(media.matches);

/** 用户没选过就用系统的 */
const theme = computed<Theme>(
  () => stored.value ?? (systemDark.value ? "dark" : "light")
);

function apply() {
  document.documentElement.setAttribute("data-theme", theme.value);
}

export function setTheme(next: Theme) {
  stored.value = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* 忽略：至少当前这次会话是对的 */
  }
  apply();
}

/** 明暗互切 */
function toggle() {
  setTheme(theme.value === "dark" ? "light" : "dark");
}

export function useTheme() {
  const onSystemChange = (e: MediaQueryListEvent) => {
    systemDark.value = e.matches;
    // 用户还没表态时才跟着系统走
    if (stored.value === null) apply();
  };

  onMounted(() => {
    apply();
    media.addEventListener("change", onSystemChange);
  });

  onUnmounted(() => {
    media.removeEventListener("change", onSystemChange);
  });

  return {
    theme,
    label: computed(() => (theme.value === "dark" ? "暗色" : "亮色")),
    setTheme,
    toggle,
  };
}
