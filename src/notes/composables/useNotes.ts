import { ref, computed, watch } from "vue";
import {
  normalizeTag,
  normalizeTags,
  pickHue,
  tagKey,
  tagHueIndex,
  MAX_TAGS_PER_NOTE,
  type Note,
  type TagColorMap,
} from "../lib/types.ts";
import * as store from "../lib/storage.ts";

/** 便签状态。模块级单例，组件间共享。 */

export const notes = ref<Note[]>([]);
/** 标签配色分配表，随数据一起持久化 */
export const tagColors = ref<TagColorMap>({});
export const query = ref("");
/** 当前筛选的标签，null 表示不筛 */
export const activeTag = ref<string | null>(null);
export const saveState = ref<store.SaveState>("idle");
export const saveError = ref("");

/** 正在编辑的便签 id，null 表示弹窗关闭 */
export const editingId = ref<string | null>(null);

/** 弹窗要显示的便签对象；id 失效（比如被删了）时为 null */
export const editingNote = computed(
  () => notes.value.find((n) => n.id === editingId.value) ?? null
);

function uid(): string {
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 只把置顶的浮到前面，其余保持数组本身的顺序。
 *
 * 不按 updatedAt 排序：那样每编辑一条它就会跳到最前，
 * 便签墙的位置会一直变，找东西全靠重新扫一遍。
 * 位置稳定比「最近编辑优先」重要。
 */
const sorted = computed(() => {
  const pinned: Note[] = [];
  const rest: Note[] = [];
  for (const n of notes.value) (n.pinned ? pinned : rest).push(n);
  return [...pinned, ...rest];
});

export const visibleNotes = computed(() => {
  const q = query.value.trim().toLowerCase();
  const tag = activeTag.value?.toLowerCase() ?? null;

  return sorted.value.filter((n) => {
    if (tag && !n.tags.some((t) => t.toLowerCase() === tag)) return false;
    if (!q) return true;
    // 搜索同时匹配正文和标签
    return (
      n.text.toLowerCase().includes(q) ||
      n.tags.some((t) => t.toLowerCase().includes(q))
    );
  });
});

/** 全部标签及用量，按用量倒序、同用量按名字排 */
export const allTags = computed(() => {
  const map = new Map<string, { name: string; count: number }>();
  for (const n of notes.value) {
    for (const t of n.tags) {
      const key = t.toLowerCase();
      const hit = map.get(key);
      if (hit) hit.count++;
      else map.set(key, { name: t, count: 1 });
    }
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh")
  );
});

export const stats = computed(() => ({
  total: notes.value.length,
  pinned: notes.value.filter((n) => n.pinned).length,
  matched: visibleNotes.value.length,
  tags: allTags.value.length,
  bytes: store.usedBytes(notes.value, tagColors.value),
}));

/* ---------- 标签配色 ---------- */

/** 取标签的配色下标；没有分配记录就按哈希回落 */
export function hueOf(tag: string): number {
  const key = tagKey(tag);
  const hit = tagColors.value[key];
  return hit === undefined ? tagHueIndex(tag) : hit;
}

/** 确保标签有配色；没有就分配一个用得最少的 */
function ensureHue(tag: string): void {
  const key = tagKey(tag);
  if (!key || tagColors.value[key] !== undefined) return;
  tagColors.value[key] = pickHue(Object.values(tagColors.value));
}

/** 给所有在用的标签补齐配色（导入、旧数据、首次加载都要走一遍） */
function backfillHues(): void {
  for (const n of notes.value) {
    for (const t of n.tags) ensureHue(t);
  }
}

/** 丢掉已经没有便签在用的配色，避免表无限膨胀 */
function pruneHues(): void {
  const alive = new Set<string>();
  for (const n of notes.value) {
    for (const t of n.tags) alive.add(tagKey(t));
  }
  for (const key of Object.keys(tagColors.value)) {
    if (!alive.has(key)) delete tagColors.value[key];
  }
}

/** 筛选中的标签如果被删光了，自动取消筛选，否则会卡在空列表 */
watch(allTags, (list) => {
  if (!activeTag.value) return;
  const key = activeTag.value.toLowerCase();
  if (!list.some((t) => t.name.toLowerCase() === key)) activeTag.value = null;
});

/* ---------- 操作 ---------- */

export function addNote(): Note {
  const now = Date.now();
  const note: Note = {
    id: uid(),
    text: "",
    // 在某个标签的筛选视图里新建，就自动带上这个标签
    tags: activeTag.value ? [activeTag.value] : [],
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
  // 插到最前：新建的便签立刻可见，不用滚到底下找
  notes.value.unshift(note);
  editingId.value = note.id; // 新建即打开编辑弹窗
  return note;
}

export function updateNote(id: string, text: string): void {
  const n = notes.value.find((x) => x.id === id);
  if (!n || n.text === text) return;
  n.text = text;
  n.updatedAt = Date.now();
}

export function removeNote(id: string): void {
  const i = notes.value.findIndex((x) => x.id === id);
  if (i >= 0) notes.value.splice(i, 1);
  if (editingId.value === id) editingId.value = null;
  pruneHues();
}

/** 结束编辑；内容为空的新便签直接丢掉，避免留下空卡片 */
export function stopEditing(): void {
  const id = editingId.value;
  editingId.value = null;
  if (!id) return;
  const n = notes.value.find((x) => x.id === id);
  if (n && !n.text.trim()) removeNote(id);
}

export function togglePin(id: string): void {
  const n = notes.value.find((x) => x.id === id);
  if (!n) return;
  n.pinned = !n.pinned;
  n.updatedAt = Date.now();
}

/* ---------- 标签 ---------- */

export type AddTagResult = "ok" | "empty" | "duplicate" | "full";

export function addTag(id: string, raw: string): AddTagResult {
  const n = notes.value.find((x) => x.id === id);
  if (!n) return "empty";

  const tag = normalizeTag(raw);
  if (!tag) return "empty";
  if (n.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return "duplicate";
  if (n.tags.length >= MAX_TAGS_PER_NOTE) return "full";

  ensureHue(tag);
  n.tags.push(tag);
  n.updatedAt = Date.now();
  return "ok";
}

export function removeTag(id: string, tag: string): void {
  const n = notes.value.find((x) => x.id === id);
  if (!n) return;
  const key = tagKey(tag);
  const i = n.tags.findIndex((t) => tagKey(t) === key);
  if (i < 0) return;
  n.tags.splice(i, 1);
  n.updatedAt = Date.now();
  pruneHues(); // 这个标签可能已经没人用了，把颜色让出来
}

export function setTags(id: string, list: string[]): void {
  const n = notes.value.find((x) => x.id === id);
  if (!n) return;
  n.tags = normalizeTags(list);
  for (const t of n.tags) ensureHue(t);
  n.updatedAt = Date.now();
}

/** 把某个标签从所有便签上删掉 */
export function deleteTagEverywhere(tag: string): number {
  const key = tagKey(tag);
  const now = Date.now();
  let hit = 0;
  for (const n of notes.value) {
    const i = n.tags.findIndex((t) => tagKey(t) === key);
    if (i >= 0) {
      n.tags.splice(i, 1);
      n.updatedAt = now;
      hit++;
    }
  }
  pruneHues();
  return hit;
}

/** 重命名标签（全局）。目标名已存在则合并，颜色跟着旧名字走 */
export function renameTagEverywhere(from: string, to: string): number {
  const next = normalizeTag(to);
  if (!next) return 0;
  const oldKey = tagKey(from);
  const newKey = tagKey(next);
  const now = Date.now();

  // 改名不该换颜色，把配色迁到新名字上（目标已有颜色则保留目标的）
  if (oldKey !== newKey && tagColors.value[newKey] === undefined) {
    const hue = tagColors.value[oldKey];
    if (hue !== undefined) tagColors.value[newKey] = hue;
  }

  let hit = 0;
  for (const n of notes.value) {
    const i = n.tags.findIndex((t) => tagKey(t) === oldKey);
    if (i < 0) continue;
    n.tags[i] = next;
    n.tags = normalizeTags(n.tags); // 可能和已有标签重名，去重
    n.updatedAt = now;
    hit++;
  }
  pruneHues();
  return hit;
}

/* ---------- 导出 / 导入 ---------- */

export function exportJson(): void {
  const blob = new Blob([store.serialize(notes.value, tagColors.value)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `notes-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  ok: boolean;
  added: number;
  skipped: number;
  message: string;
}

/**
 * 导入。默认合并而不是覆盖 —— 覆盖会静默毁掉现有便签，
 * 同 id 的以导入内容为准。
 */
export function importJson(raw: string, mode: "merge" | "replace"): ImportResult {
  const { notes: incoming, tagColors: incomingColors, skipped, error } =
    store.parseNotesFile(raw);
  if (error) return { ok: false, added: 0, skipped: 0, message: `导入失败：${error}` };
  if (!incoming.length) {
    return { ok: false, added: 0, skipped, message: "文件里没有可用的便签" };
  }

  if (mode === "replace") {
    notes.value = incoming;
    tagColors.value = { ...incomingColors };
  } else {
    const byId = new Map(notes.value.map((n) => [n.id, n]));
    for (const n of incoming) byId.set(n.id, n);
    notes.value = [...byId.values()];
    // 已有标签的颜色不动，只补文件里带来的新标签
    for (const [k, v] of Object.entries(incomingColors)) {
      if (tagColors.value[k] === undefined) tagColors.value[k] = v;
    }
  }

  backfillHues();
  pruneHues();

  const tail = skipped ? `，跳过 ${skipped} 条无效数据` : "";
  return {
    ok: true,
    added: incoming.length,
    skipped,
    message: `已导入 ${incoming.length} 条${tail}`,
  };
}

/* ---------- 持久化 ---------- */

let started = false;

export function initNotes(): void {
  if (started) return;
  started = true;

  const loaded = store.load();
  notes.value = loaded.notes;
  tagColors.value = loaded.tagColors;
  // 旧数据、外部文件可能有标签但没有配色记录
  backfillHues();
  pruneHues();

  let timer: number | undefined;
  watch(
    [notes, tagColors],
    () => {
      saveState.value = "saving";
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        try {
          store.save(notes.value, tagColors.value);
          saveState.value = "saved";
          saveError.value = "";
        } catch (err) {
          saveState.value = "error";
          saveError.value =
            err instanceof store.QuotaError
              ? "存储空间已满，请导出备份后删掉一些便签"
              : "保存失败，浏览器可能禁用了本地存储";
        }
      }, 300);
    },
    { deep: true }
  );
}
