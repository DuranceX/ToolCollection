<script setup lang="ts">
import { ref, nextTick, computed, onMounted, onUnmounted } from "vue";
import {
  tabs,
  activeId,
  addTab,
  closeTab,
  renameTab,
  canAddTab,
  maxTabs,
} from "../composables/useTabs";
import { diagnoseText } from "../lib/cm";

const emit = defineEmits<{ toast: [msg: string] }>();

/** 正在重命名的标签 id */
const editingId = ref<string | null>(null);
const draft = ref("");

/**
 * 重命名输入框。用函数 ref 而不是 ref="inputEl"：
 * 模板里它在 v-for 内部，字符串 ref 会被 Vue 收集成数组，
 * 拿不到元素本身（.select() 会报 not a function）。
 */
const inputEl = ref<HTMLInputElement | null>(null);
function bindInput(el: unknown) {
  inputEl.value = (el as HTMLInputElement | null) ?? null;
}

/** 每个标签的状态圆点：空 / 合法 / 有错 */
const status = computed(() => {
  const map = new Map<string, "empty" | "ok" | "err">();
  for (const tab of tabs.value) {
    if (!tab.content.trim()) map.set(tab.id, "empty");
    else {
      const errs = diagnoseText(tab.content).filter((d) => d.severity === "error");
      map.set(tab.id, errs.length ? "err" : "ok");
    }
  }
  return map;
});

async function startRename(id: string) {
  const tab = tabs.value.find((t) => t.id === id);
  if (!tab) return;
  editingId.value = id;
  draft.value = tab.name;
  await nextTick();
  inputEl.value?.select();
}

function commitRename() {
  if (!editingId.value) return;
  renameTab(editingId.value, draft.value);
  editingId.value = null;
}

function cancelRename() {
  editingId.value = null;
}

function onAdd() {
  if (!canAddTab.value) {
    emit("toast", `最多 ${maxTabs} 个标签`);
    return;
  }
  addTab("");
}

/** F2 做成全局：在编辑器里也能直接改当前标签名 */
function onGlobalKey(e: KeyboardEvent) {
  if (e.key !== "F2" || editingId.value) return;
  e.preventDefault();
  if (activeId.value) void startRename(activeId.value);
}

onMounted(() => document.addEventListener("keydown", onGlobalKey));
onUnmounted(() => document.removeEventListener("keydown", onGlobalKey));
</script>

<template>
  <div class="tabbar" role="tablist" aria-label="JSON 文档标签">
    <div class="tabbar-scroll">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="tab"
        :class="{ 'is-active': tab.id === activeId }"
        role="tab"
        :aria-selected="tab.id === activeId"
        :tabindex="0"
        :title="editingId === tab.id ? undefined : '双击重命名'"
        @click="activeId = tab.id"
        @dblclick="startRename(tab.id)"
        @keydown.enter="activeId = tab.id"
      >
        <span class="tab-dot" :class="`is-${status.get(tab.id)}`"></span>

        <input
          v-if="editingId === tab.id"
          :ref="bindInput"
          v-model="draft"
          class="tab-rename"
          type="text"
          maxlength="28"
          @click.stop
          @blur="commitRename"
          @keydown.enter.prevent="commitRename"
          @keydown.esc.prevent="cancelRename"
        />
        <span v-else class="tab-name">{{ tab.name }}</span>

        <button
          class="tab-close"
          type="button"
          :aria-label="`关闭 ${tab.name}`"
          @click.stop="closeTab(tab.id)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>

    <button
      class="btn btn-icon btn-ghost tab-add"
      type="button"
      title="新建标签 (Alt+T)"
      aria-label="新建标签"
      @click="onAdd"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  </div>
</template>
