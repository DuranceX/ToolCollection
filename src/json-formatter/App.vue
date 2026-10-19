<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import ThemeToggle from "../shared/components/ThemeToggle.vue";
import BrandMark from "../shared/components/BrandMark.vue";
import TabBar from "./components/TabBar.vue";
import EditView from "./components/EditView.vue";
import CompareView from "./components/CompareView.vue";
import {
  tabs,
  activeTab,
  mode,
  indent,
  wrap,
  diffOnly,
  leftId,
  rightId,
  addTab,
  setContent,
  initTabs,
  swapCompare,
  SAMPLE,
} from "./composables/useTabs";
import { parseJson, format, minify, sortKeysDeep, indentOf } from "./lib/json";
import { computeDiff, formatPath, previewValue } from "./lib/diff";
import { tabById } from "./composables/useTabs";

initTabs();

const editViewRef = ref<InstanceType<typeof EditView>>();

/* ---------- toast ---------- */
const toastMsg = ref("");
const toastOn = ref(false);
let toastTimer: number | undefined;

function toast(msg: string) {
  toastMsg.value = msg;
  toastOn.value = true;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastOn.value = false), 1900);
}

/* ---------- 动作 ---------- */

/** 需要合法 JSON 的操作走这里，统一提示 */
function withParsed(label: string, fn: (value: unknown) => void) {
  const tab = activeTab.value;
  if (!tab) return;
  const res = parseJson(tab.content);
  if (!res.ok) {
    toast(res.empty ? "内容为空" : `${label}失败：JSON 无效`);
    return;
  }
  fn(res.value);
}

function apply(text: string) {
  const tab = activeTab.value;
  if (tab) setContent(tab.id, text);
}

function doFormat() {
  withParsed("格式化", (v) => {
    apply(format(v, indent.value));
    toast("已格式化");
  });
}

function doMinify() {
  withParsed("压缩", (v) => {
    apply(minify(v));
    toast("已压缩");
  });
}

function doSort() {
  withParsed("排序", (v) => {
    apply(format(sortKeysDeep(v), indent.value));
    toast("已按键名排序");
  });
}

function doEscape() {
  const tab = activeTab.value;
  if (!tab?.content) return toast("内容为空");
  apply(JSON.stringify(tab.content));
  toast("已转义为字符串字面量");
}

function doUnescape() {
  const tab = activeTab.value;
  if (!tab?.content) return toast("内容为空");
  try {
    const v = JSON.parse(tab.content.trim());
    if (typeof v !== "string") return toast("去转义需要一个用引号包住的 JSON 字符串");
    apply(v);
    toast("已去转义");
  } catch {
    toast("去转义失败：不是合法的 JSON 字符串");
  }
}

function doSample() {
  apply(JSON.stringify(SAMPLE, null, 2));
  toast("已填充示例");
}

function doClear() {
  const tab = activeTab.value;
  if (!tab?.content) return;
  apply("");
  editViewRef.value?.focus();
}

/* ---------- 复制 ---------- */

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast("已复制");
  } catch {
    // 非 https 或权限被拒时退回老方法
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      toast("已复制");
    } catch {
      toast("复制失败，请手动选择文本");
    }
    document.body.removeChild(ta);
  }
}

/** 对比模式下复制成可读的变更报告 */
function compareReport(): string | null {
  const l = tabById(leftId.value);
  const r = tabById(rightId.value);
  if (!l || !r || l.id === r.id) return null;

  const lp = parseJson(l.content);
  const rp = parseJson(r.content);
  if (!lp.ok || !rp.ok) return null;

  const ind = indentOf(indent.value);
  const d = computeDiff(lp.value, rp.value, typeof ind === "number" ? " ".repeat(ind) : ind);

  const lines = [`--- ${l.name}`, `+++ ${r.name}`, ""];
  if (!d.changes.length) {
    lines.push("(两侧一致)");
    return lines.join("\n");
  }

  const LABEL = { add: "新增", del: "删除", mod: "修改", move: "移动" } as const;
  for (const c of d.changes) {
    const path = formatPath(c.path);
    if (c.kind === "move") lines.push(`移动  ${path} → 下标 ${c.toIndex}`);
    else if (c.kind === "add") lines.push(`新增  ${path} = ${previewValue(c.newValue, 200)}`);
    else if (c.kind === "del") lines.push(`删除  ${path} = ${previewValue(c.oldValue, 200)}`);
    else {
      lines.push(
        `${LABEL[c.kind]}  ${path}: ${previewValue(c.oldValue, 200)} → ${previewValue(c.newValue, 200)}`
      );
    }
  }
  return lines.join("\n");
}

function doCopy() {
  if (mode.value === "compare") {
    const report = compareReport();
    if (!report) return toast("当前没有可复制的对比结果");
    void copyText(report);
    return;
  }

  const tab = activeTab.value;
  if (!tab?.content) return toast("内容为空");
  const res = parseJson(tab.content);
  void copyText(res.ok ? format(res.value, indent.value) : tab.content);
}

/* ---------- 快捷键 ---------- */

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    doFormat();
  } else if (e.altKey && (e.key === "t" || e.key === "T")) {
    e.preventDefault();
    addTab("");
  }
}

onMounted(() => document.addEventListener("keydown", onKeydown));
onUnmounted(() => document.removeEventListener("keydown", onKeydown));

const canCompare = computed(() => tabs.value.length >= 2);
</script>

<template>
  <header class="topbar">
    <div class="topbar-inner app-topbar">
      <a class="brand" href="../../index.html">
        <BrandMark />
        <span class="brand-name">Tool Collection</span>
      </a>
      <span class="topbar-sep" aria-hidden="true">/</span>
      <span class="topbar-title">JSON 格式化 / 对比</span>
      <div class="topbar-spacer"></div>
      <ThemeToggle />
    </div>
  </header>

  <TabBar @toast="toast" />

  <div class="toolbar">
    <div class="mode-switch" role="tablist" aria-label="视图模式">
      <button
        class="mode-btn"
        :class="{ 'is-active': mode === 'edit' }"
        type="button"
        role="tab"
        :aria-selected="mode === 'edit'"
        @click="mode = 'edit'"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M4 5h16M4 12h16M4 19h10" />
        </svg>
        编辑
      </button>
      <button
        class="mode-btn"
        :class="{ 'is-active': mode === 'compare' }"
        type="button"
        role="tab"
        :aria-selected="mode === 'compare'"
        :disabled="!canCompare"
        :title="canCompare ? '' : '需要至少两个标签'"
        @click="mode = 'compare'"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
          <rect x="3" y="4" width="7.5" height="16" rx="1.5" />
          <rect x="13.5" y="4" width="7.5" height="16" rx="1.5" />
        </svg>
        对比
      </button>
    </div>

    <span class="toolbar-div" aria-hidden="true"></span>

    <!-- 编辑模式 -->
    <div v-if="mode === 'edit'" class="toolbar-group">
      <button class="btn btn-primary" type="button" title="格式化 (Ctrl/Cmd + Enter)" @click="doFormat">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M4 6h16M8 12h12M8 18h8" />
        </svg>
        格式化
      </button>
      <button class="btn" type="button" title="压缩成一行" @click="doMinify">压缩</button>
      <button class="btn" type="button" title="按键名递归排序后格式化" @click="doSort">排序键</button>
      <button class="btn" type="button" title="把当前内容转成一个 JSON 字符串字面量" @click="doEscape">转义</button>
      <button class="btn" type="button" title="把 JSON 字符串字面量还原成原始文本" @click="doUnescape">去转义</button>
    </div>

    <!-- 对比模式 -->
    <div v-else class="toolbar-group">
      <label class="field-label" for="selLeft">左</label>
      <select id="selLeft" v-model="leftId" class="control">
        <option v-for="t in tabs" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
      <button class="btn btn-icon" type="button" title="交换左右" aria-label="交换左右" @click="swapCompare">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 8h13l-3-3M17 16H4l3 3" />
        </svg>
      </button>
      <label class="field-label" for="selRight">右</label>
      <select id="selRight" v-model="rightId" class="control">
        <option v-for="t in tabs" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
      <label class="switch" title="只显示有差异的行及其上下文">
        <input v-model="diffOnly" type="checkbox" />
        仅差异
      </label>
    </div>

    <div class="toolbar-spacer"></div>

    <div class="toolbar-group">
      <label class="field-label" for="selIndent">缩进</label>
      <select id="selIndent" v-model="indent" class="control" title="缩进方式">
        <option value="2">2 空格</option>
        <option value="4">4 空格</option>
        <option value="tab">Tab</option>
      </select>
      <button class="btn" type="button" :title="mode === 'compare' ? '复制变更报告' : '复制格式化结果'" @click="doCopy">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M15 5.5A2 2 0 0 0 13 4H6a2 2 0 0 0-2 2v7a2 2 0 0 0 1.5 1.9" />
        </svg>
        复制
      </button>
      <template v-if="mode === 'edit'">
        <button class="btn" type="button" title="填充一段示例 JSON" @click="doSample">示例</button>
        <button class="btn" type="button" title="清空当前标签内容" @click="doClear">清空</button>
      </template>
    </div>
  </div>

  <EditView v-show="mode === 'edit'" ref="editViewRef">
    <template #output-actions>
      <button class="btn btn-sm btn-ghost" type="button" title="全部折叠" @click="editViewRef?.foldAll()">
        折叠
      </button>
      <button class="btn btn-sm btn-ghost" type="button" title="全部展开" @click="editViewRef?.unfoldAll()">
        展开
      </button>
      <label class="switch" title="自动换行">
        <input v-model="wrap" type="checkbox" />
        换行
      </label>
    </template>
  </EditView>

  <CompareView v-if="mode === 'compare'" />

  <div class="toast" :class="{ show: toastOn }" role="status" aria-live="polite">
    {{ toastMsg }}
  </div>
</template>
