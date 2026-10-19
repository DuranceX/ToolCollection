import { ref, computed, watch } from "vue";
import type { IndentMode } from "../lib/json";

/**
 * 标签页 + 工具设置的状态与持久化。
 * 模块级单例，App 和各子组件共享。
 */

export interface Tab {
  id: string;
  name: string;
  content: string;
}

export type Mode = "edit" | "compare";

const STORE_KEY = "tc-json-formatter";
const MAX_TABS = 12;

const SAMPLE_LEFT = {
  name: "tool-collection",
  version: "1.0.0",
  private: true,
  tags: ["json", "diff"],
  engines: { node: ">=18" },
  stats: { files: 7, sizeKb: 46.5, deps: null },
};

const SAMPLE_RIGHT = {
  name: "tool-collection",
  version: "2.1.0",
  private: true,
  tags: ["json", "diff", "vue"],
  engines: { node: ">=20" },
  stats: { files: 12, sizeKb: 88.2, deps: null },
  license: "MIT",
};

function uid(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

interface Persisted {
  v: 1;
  tabs: Tab[];
  activeId: string;
  mode: Mode;
  indent: IndentMode;
  wrap: boolean;
  diffOnly: boolean;
  leftId: string | null;
  rightId: string | null;
  split: number;
}

/* ---------- 状态 ---------- */

export const tabs = ref<Tab[]>([]);
export const activeId = ref<string>("");
export const mode = ref<Mode>("edit");
export const indent = ref<IndentMode>("2");
export const wrap = ref(false);
export const diffOnly = ref(false);
export const leftId = ref<string | null>(null);
export const rightId = ref<string | null>(null);
export const split = ref(50);

export const activeTab = computed(() => tabs.value.find((t) => t.id === activeId.value));

export function tabById(id: string | null): Tab | undefined {
  return id ? tabs.value.find((t) => t.id === id) : undefined;
}

/* ---------- 操作 ---------- */

function nextName(): string {
  const used = new Set(tabs.value.map((t) => t.name));
  let n = 1;
  while (used.has(`JSON ${n}`)) n++;
  return `JSON ${n}`;
}

export function addTab(content = "", name?: string): Tab | null {
  if (tabs.value.length >= MAX_TABS) return null;
  const tab: Tab = { id: uid(), name: name ?? nextName(), content };
  tabs.value.push(tab);
  activeId.value = tab.id;
  ensureComparePair();
  return tab;
}

export function closeTab(id: string): void {
  const idx = tabs.value.findIndex((t) => t.id === id);
  if (idx < 0) return;

  // 最后一个标签不删除，只清空内容
  if (tabs.value.length === 1) {
    tabs.value[0].content = "";
    return;
  }

  tabs.value.splice(idx, 1);
  if (activeId.value === id) {
    activeId.value = tabs.value[Math.min(idx, tabs.value.length - 1)].id;
  }
  if (leftId.value === id) leftId.value = null;
  if (rightId.value === id) rightId.value = null;
  ensureComparePair();
}

export function renameTab(id: string, name: string): void {
  const tab = tabById(id);
  if (!tab) return;
  const clean = name.trim().slice(0, 28);
  if (clean) tab.name = clean;
}

export function setContent(id: string, content: string): void {
  const tab = tabById(id);
  if (tab) tab.content = content;
}

export const canAddTab = computed(() => tabs.value.length < MAX_TABS);
export const maxTabs = MAX_TABS;

/** 保证对比模式左右各有一个有效且不同的选择 */
export function ensureComparePair(): void {
  if (tabs.value.length < 2) {
    leftId.value = tabs.value[0]?.id ?? null;
    rightId.value = null;
    return;
  }
  if (!tabById(leftId.value)) {
    leftId.value = activeId.value || tabs.value[0].id;
  }
  if (!tabById(rightId.value) || rightId.value === leftId.value) {
    rightId.value = tabs.value.find((t) => t.id !== leftId.value)?.id ?? null;
  }
}

export function swapCompare(): void {
  const t = leftId.value;
  leftId.value = rightId.value;
  rightId.value = t;
}

/* ---------- 持久化 ---------- */

function save(): void {
  const data: Persisted = {
    v: 1,
    tabs: tabs.value.map((t) => ({ id: t.id, name: t.name, content: t.content })),
    activeId: activeId.value,
    mode: mode.value,
    indent: indent.value,
    wrap: wrap.value,
    diffOnly: diffOnly.value,
    leftId: leftId.value,
    rightId: rightId.value,
    split: split.value,
  };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    // 内容过大超出配额时静默放弃，不影响正在进行的编辑
  }
}

function load(): boolean {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORE_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;

  try {
    const data = JSON.parse(raw) as Partial<Persisted>;
    if (!Array.isArray(data.tabs) || data.tabs.length === 0) return false;

    tabs.value = data.tabs.slice(0, MAX_TABS).map((t) => ({
      id: typeof t.id === "string" ? t.id : uid(),
      name: typeof t.name === "string" ? t.name : "JSON",
      content: typeof t.content === "string" ? t.content : "",
    }));
    activeId.value = tabById(data.activeId ?? null)?.id ?? tabs.value[0].id;
    mode.value = data.mode === "compare" ? "compare" : "edit";
    indent.value =
      data.indent === "4" || data.indent === "tab" ? data.indent : "2";
    wrap.value = !!data.wrap;
    diffOnly.value = !!data.diffOnly;
    leftId.value = data.leftId ?? null;
    rightId.value = data.rightId ?? null;
    split.value =
      typeof data.split === "number" && data.split >= 20 && data.split <= 80
        ? data.split
        : 50;
    return true;
  } catch {
    return false;
  }
}

let started = false;

/** 入口调用一次：恢复状态，并开始自动保存 */
export function initTabs(): void {
  if (started) return;
  started = true;

  if (!load()) {
    // 首次进来给两个标签，对比功能开箱可用
    tabs.value = [
      { id: uid(), name: "JSON 1", content: JSON.stringify(SAMPLE_LEFT, null, 2) },
      { id: uid(), name: "JSON 2", content: JSON.stringify(SAMPLE_RIGHT, null, 2) },
    ];
    activeId.value = tabs.value[0].id;
  }
  ensureComparePair();

  let timer: number | undefined;
  watch(
    [tabs, activeId, mode, indent, wrap, diffOnly, leftId, rightId, split],
    () => {
      clearTimeout(timer);
      timer = window.setTimeout(save, 350);
    },
    { deep: true }
  );
}

export const SAMPLE = SAMPLE_LEFT;
