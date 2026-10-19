/**
 * 便签存储层。
 *
 * 目前落在 localStorage，所以数据只在当前浏览器里 —— 换设备、换浏览器、
 * 清站点数据都看不到。这是明确的取舍，用导出 / 导入 JSON 兜底。
 *
 * 整个模块只暴露 load / save / 校验，不含任何 UI 逻辑。将来要接服务端，
 * 把这三个函数换成 fetch 即可，上层不用动。
 */

// 显式写 .ts：测试直接用 node 跑，Node 的 ESM 解析不做扩展名补全
import {
  normalizeTags,
  normalizeTagColors,
  type Note,
  type NotesFile,
  type TagColorMap,
} from "./types.ts";

const KEY = "tc-notes";

export type SaveState = "idle" | "saving" | "saved" | "error";

/* ---------- 校验 ---------- */

/**
 * 逐条校验并修补。外部导入的文件和历史数据都会走这里，
 * 坏字段就地补默认值，不因为一条脏数据丢掉整份便签。
 *
 * 旧版数据带 color 字段（便签整体颜色），现已改成标签体系：
 * color 直接忽略，不转成标签 —— 「yellow」当标签毫无意义。
 */
export function normalizeNote(raw: unknown, index = 0): Note | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const text = typeof o.text === "string" ? o.text : "";
  const now = Date.now();
  const created = typeof o.createdAt === "number" && o.createdAt > 0 ? o.createdAt : now;

  return {
    id: typeof o.id === "string" && o.id ? o.id : `n${now.toString(36)}${index}`,
    text,
    tags: normalizeTags(o.tags),
    pinned: o.pinned === true,
    createdAt: created,
    updatedAt:
      typeof o.updatedAt === "number" && o.updatedAt > 0 ? o.updatedAt : created,
  };
}

/** 解析一份 NotesFile（也用于导入），返回校验后的便签与被丢弃的条数 */
export function parseNotesFile(raw: string): {
  notes: Note[];
  tagColors: TagColorMap;
  skipped: number;
  error?: string;
} {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { notes: [], tagColors: {}, skipped: 0, error: "不是合法的 JSON" };
  }

  // 兼容两种形态：{ v, notes: [...] } 和裸数组
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as NotesFile).notes)
      ? (data as NotesFile).notes
      : null;

  if (!list) return { notes: [], tagColors: {}, skipped: 0, error: "缺少 notes 数组" };

  const notes: Note[] = [];
  let skipped = 0;
  list.forEach((item, i) => {
    const n = normalizeNote(item, i);
    if (n) notes.push(n);
    else skipped++;
  });

  const tagColors = Array.isArray(data)
    ? {}
    : normalizeTagColors((data as NotesFile).tagColors);

  return { notes, tagColors, skipped };
}

/* ---------- 读写 ---------- */

export function load(): { notes: Note[]; tagColors: TagColorMap } {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return { notes: [], tagColors: {} }; // 隐私模式下 localStorage 会抛
  }
  if (!raw) return { notes: [], tagColors: {} };
  const r = parseNotesFile(raw);
  return { notes: r.notes, tagColors: r.tagColors };
}

export class QuotaError extends Error {
  constructor() {
    super("浏览器存储空间已满");
  }
}

export function save(notes: Note[], tagColors: TagColorMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(build(notes, tagColors)));
  } catch (err) {
    // 配额超限和隐私模式都会走到这里，交给上层提示用户导出
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      throw new QuotaError();
    }
    throw err;
  }
}

function build(notes: Note[], tagColors: TagColorMap): NotesFile {
  return { v: 1, notes, tagColors, savedAt: Date.now() };
}

export function serialize(notes: Note[], tagColors: TagColorMap): string {
  return JSON.stringify(build(notes, tagColors), null, 2);
}

/** 估算当前占用，用于在接近配额时提醒 */
export function usedBytes(notes: Note[], tagColors: TagColorMap): number {
  return new TextEncoder().encode(serialize(notes, tagColors)).length;
}
