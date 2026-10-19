/** 便签数据结构。导出 / 导入用的就是这套结构，改动要考虑向后兼容。 */

export interface Note {
  id: string;
  /** Markdown 原文 */
  text: string;
  /** 标签名列表，已去重、去空白 */
  tags: string[];
  pinned: boolean;
  /** Unix 毫秒 */
  createdAt: number;
  updatedAt: number;
}

/** 标签名（小写）→ 配色下标 */
export type TagColorMap = Record<string, number>;

/** 落盘 / 导出的顶层结构 */
export interface NotesFile {
  /** 结构版本，将来迁移靠它判断 */
  v: 1;
  notes: Note[];
  /** 标签配色分配表，缺失时按哈希回落 */
  tagColors?: TagColorMap;
  savedAt: number;
}

/* ---------- 标签 ---------- */

export const MAX_TAG_LEN = 16;
export const MAX_TAGS_PER_NOTE = 8;

/**
 * 标签配色。
 *
 * 颜色不让用户挑，由系统分配：新标签取当前用得最少的那个色，
 * 分配结果存进数据文件，所以一旦定了就永久稳定。
 *
 * 为什么不用「名字哈希」：8 种颜色里随机取 6 次，期望只有 4.4 种互不相同
 * （生日问题），实测 6 个中文标签经常 3~4 个撞成同色。
 * 而标签颜色的全部意义就是区分标签，撞色等于白做。
 * 哈希只留作没有分配记录时的回落。
 */
export const TAG_HUES = [
  { name: "blue", h: 218 },
  { name: "green", h: 152 },
  { name: "amber", h: 38 },
  { name: "rose", h: 344 },
  { name: "violet", h: 268 },
  { name: "cyan", h: 190 },
  { name: "lime", h: 96 },
  { name: "orange", h: 18 },
] as const;

/** 字符串 → 稳定的小整数（FNV-1a + fmix32 收尾，把高位的熵搅到低位） */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // 只取模 8 的话只有最低 3 位起作用，FNV 在低位的雪崩性不够，必须补这一步
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 没有分配记录时的回落配色。大小写不影响，"Bug" 和 "bug" 同色 */
export function tagHueIndex(tag: string): number {
  return hashString(tag.trim().toLowerCase()) % TAG_HUES.length;
}

/** 标签名的归一化键，用作配色表的 key */
export function tagKey(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * 给新标签挑颜色：用得最少的优先，同样少时按调色板顺序。
 * 头 8 个标签因此必然互不同色。
 */
export function pickHue(assigned: Iterable<number>): number {
  const used = new Array(TAG_HUES.length).fill(0);
  for (const i of assigned) {
    if (Number.isInteger(i) && i >= 0 && i < used.length) used[i]++;
  }
  let best = 0;
  for (let i = 1; i < used.length; i++) {
    if (used[i] < used[best]) best = i;
  }
  return best;
}

/** 校验配色表：丢掉非法项，下标越界的取模拉回范围 */
export function normalizeTagColors(raw: unknown): TagColorMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: TagColorMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = tagKey(k);
    if (!key) continue;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) continue;
    out[key] = v % TAG_HUES.length;
  }
  return out;
}

/** 规范化单个标签：去空白、压缩内部空格、截断 */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LEN);
}

/** 规范化标签列表：逐个清理、去重（忽略大小写）、限制数量 */
export function normalizeTags(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const tag = normalizeTag(item);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS_PER_NOTE) break;
  }
  return out;
}
