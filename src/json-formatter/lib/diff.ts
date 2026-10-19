/**
 * 结构化 diff。
 *
 * 用 jsondiffpatch 算出 delta（它负责数组的 LCS 和移动检测），
 * 然后从同一份 delta 派生两个视图：
 *   1. changeList  —— 按 key 路径列出增/删/改/移
 *   2. pairedRows  —— 左右两列对齐的行，行对齐由 delta 决定而不是按文本比对
 *
 * 好处：key 改名、数组中间插入元素，不会像文本 diff 那样产生一长串连锁假差异。
 */

import { create, type Delta } from "jsondiffpatch";

export type ChangeKind = "add" | "del" | "mod" | "move";
export type RowKind = "eq" | "add" | "del" | "mod";

export interface Change {
  /** 形如 ['user', 'tags', '2']，渲染成 user.tags[2] */
  path: string[];
  kind: ChangeKind;
  oldValue?: unknown;
  newValue?: unknown;
  /** kind === 'move' 时的新下标 */
  toIndex?: number;
}

export interface PairedRow {
  l: string | null;
  r: string | null;
  kind: RowKind;
  lineL: number | null;
  lineR: number | null;
}

export interface DiffResult {
  changes: Change[];
  rows: PairedRow[];
  identical: boolean;
  truncated: boolean;
  stats: { add: number; del: number; mod: number; move: number };
}

const MAX_ROWS = 20000;

const differ = create({
  // 对象数组按 id 之类的字段配对，比纯下标对齐准得多
  objectHash: (obj: unknown) => {
    if (obj && typeof obj === "object") {
      const o = obj as Record<string, unknown>;
      for (const k of ["id", "_id", "key", "name", "uuid"]) {
        if (o[k] != null) return `${k}:${String(o[k])}`;
      }
      return JSON.stringify(obj);
    }
    return String(obj);
  },
  arrays: { detectMove: true, includeValueOnMove: false },
  // 不配 textDiff：0.7 起字符级文本 patch 需要显式传入 diff-match-patch 实例，
  // 不传就不启用。长字符串按整体替换处理，delta 更简单，展示也更直观。
});

/* ---------- delta 形状判定 ---------- */

type DeltaArray = [unknown] | [unknown, unknown] | [unknown, 0, 0] | ["", number, 3];

function isArrayDelta(d: unknown): d is DeltaArray {
  return Array.isArray(d);
}

function isObjectDelta(d: unknown): d is Record<string, Delta> {
  return !!d && typeof d === "object" && !Array.isArray(d);
}

function isArrayContainerDelta(d: unknown): d is Record<string, Delta> & { _t: "a" } {
  return isObjectDelta(d) && (d as Record<string, unknown>)._t === "a";
}

/* ---------- 变更清单 ---------- */

function collectChanges(delta: Delta, path: string[], out: Change[]): void {
  if (delta === undefined) return;

  if (isArrayDelta(delta)) {
    if (delta.length === 1) {
      out.push({ path, kind: "add", newValue: delta[0] });
    } else if (delta.length === 2) {
      out.push({ path, kind: "mod", oldValue: delta[0], newValue: delta[1] });
    } else if (delta[2] === 0) {
      out.push({ path, kind: "del", oldValue: delta[0] });
    } else if (delta[2] === 3) {
      out.push({ path, kind: "move", toIndex: delta[1] as number });
    }
    return;
  }

  if (isArrayContainerDelta(delta)) {
    for (const key of Object.keys(delta)) {
      if (key === "_t") continue;
      // _N 表示「原数组的第 N 项」被删除或移动
      const idx = key.startsWith("_") ? key.slice(1) : key;
      collectChanges(delta[key], [...path, idx], out);
    }
    return;
  }

  if (isObjectDelta(delta)) {
    for (const key of Object.keys(delta)) {
      collectChanges(delta[key], [...path, key], out);
    }
  }
}

/** user.tags[2] 这种可读路径 */
export function formatPath(path: string[]): string {
  if (!path.length) return "(根)";
  let out = "";
  for (const seg of path) {
    if (/^\d+$/.test(seg)) out += `[${seg}]`;
    else if (/^[A-Za-z_$][\w$]*$/.test(seg)) out += out ? `.${seg}` : seg;
    else out += `[${JSON.stringify(seg)}]`;
  }
  return out;
}

/** 值的单行摘要，长的截断 */
export function previewValue(v: unknown, max = 60): string {
  if (v === undefined) return "—";
  let s: string;
  try {
    s = JSON.stringify(v) ?? String(v);
  } catch {
    s = String(v);
  }
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/* ---------- 两列对齐 ---------- */

interface Ctx {
  rows: { l: string | null; r: string | null; kind: RowKind }[];
  indent: string;
  truncated: boolean;
}

function pad(ctx: Ctx, depth: number): string {
  return ctx.indent.repeat(depth);
}

/** 对象 key 的前缀，数组项没有 */
function keyPrefix(key: string | null): string {
  return key === null ? "" : `${JSON.stringify(key)}: `;
}

/**
 * 把一个值 pretty-print 成多行。
 * @param prefix 行首附加内容（如 `"key": `）
 * @param comma  是否需要尾逗号
 */
function serialize(
  value: unknown,
  prefix: string,
  comma: boolean,
  depth: number,
  ctx: Ctx
): string[] {
  const ind = pad(ctx, depth);
  const tail = comma ? "," : "";

  if (Array.isArray(value)) {
    if (value.length === 0) return [`${ind}${prefix}[]${tail}`];
    const out = [`${ind}${prefix}[`];
    value.forEach((item, i) => {
      out.push(...serialize(item, "", i < value.length - 1, depth + 1, ctx));
    });
    out.push(`${ind}]${tail}`);
    return out;
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return [`${ind}${prefix}{}${tail}`];
    const out = [`${ind}${prefix}{`];
    keys.forEach((k, i) => {
      out.push(...serialize(obj[k], keyPrefix(k), i < keys.length - 1, depth + 1, ctx));
    });
    out.push(`${ind}}${tail}`);
    return out;
  }

  return [`${ind}${prefix}${JSON.stringify(value) ?? "null"}${tail}`];
}

function pushRow(ctx: Ctx, l: string | null, r: string | null, kind: RowKind): void {
  if (ctx.rows.length >= MAX_ROWS) {
    ctx.truncated = true;
    return;
  }
  ctx.rows.push({ l, r, kind });
}

/**
 * 两侧值相同、只可能差一个尾逗号：逐行对齐。
 * 行数必然一致，所以不需要补空。
 */
function pushZipped(
  ctx: Ctx,
  left: string[],
  right: string[],
  kind: RowKind
): void {
  const n = Math.max(left.length, right.length);
  for (let i = 0; i < n; i++) {
    pushRow(ctx, left[i] ?? null, right[i] ?? null, kind);
  }
}

/** 只有一侧有内容：另一侧留空占位，保持行对齐 */
function pushOneSide(ctx: Ctx, lines: string[], side: "l" | "r", kind: RowKind): void {
  for (const line of lines) {
    pushRow(ctx, side === "l" ? line : null, side === "r" ? line : null, kind);
  }
}

/** 两侧都有但不同：逐行配对，短的一侧补空 */
function pushPaired(ctx: Ctx, left: string[], right: string[]): void {
  const n = Math.max(left.length, right.length);
  for (let i = 0; i < n; i++) {
    pushRow(ctx, left[i] ?? null, right[i] ?? null, "mod");
  }
}

/**
 * 按 delta 递归发射两列行。
 *
 * 尾逗号必须左右分开判断：右侧比左侧多一项时，左侧最后一个可见项
 * 不该带逗号，否则单独把左列取出来就不是合法 JSON 了。
 *
 * @param left    左侧值（纯新增时为 undefined）
 * @param right   右侧值（纯删除时为 undefined）
 * @param delta   这个位置的 delta；undefined 表示整棵子树没变
 * @param key     对象 key，数组项传 null
 * @param commaL  左列是否需要尾逗号
 * @param commaR  右列是否需要尾逗号
 */
function emit(
  left: unknown,
  right: unknown,
  delta: Delta,
  key: string | null,
  commaL: boolean,
  commaR: boolean,
  depth: number,
  ctx: Ctx
): void {
  const prefix = keyPrefix(key);

  // 整棵子树没变：值相同，但两侧逗号可能不同，所以各自序列化再配对
  if (delta === undefined) {
    pushZipped(
      ctx,
      serialize(left, prefix, commaL, depth, ctx),
      serialize(left, prefix, commaR, depth, ctx),
      "eq"
    );
    return;
  }

  if (isArrayDelta(delta)) {
    if (delta.length === 1) {
      pushOneSide(ctx, serialize(delta[0], prefix, commaR, depth, ctx), "r", "add");
      return;
    }
    if (delta.length === 2) {
      pushPaired(
        ctx,
        serialize(delta[0], prefix, commaL, depth, ctx),
        serialize(delta[1], prefix, commaR, depth, ctx)
      );
      return;
    }
    if (delta[2] === 0) {
      pushOneSide(ctx, serialize(delta[0], prefix, commaL, depth, ctx), "l", "del");
      return;
    }
    if (delta[2] === 3) {
      // 移动：在 buildArraySlots 里已拆成删除 + 新增两个槽位，
      // 正常不会走到这里；保险起见按未变化处理。
      pushZipped(
        ctx,
        serialize(left, prefix, commaL, depth, ctx),
        serialize(left, prefix, commaR, depth, ctx),
        "mod"
      );
      return;
    }
  }

  if (isArrayContainerDelta(delta)) {
    emitArray(left as unknown[], right as unknown[], delta, prefix, commaL, commaR, depth, ctx);
    return;
  }

  if (isObjectDelta(delta)) {
    emitObject(
      left as Record<string, unknown>,
      right as Record<string, unknown>,
      delta,
      prefix,
      commaL,
      commaR,
      depth,
      ctx
    );
    return;
  }

  pushZipped(
    ctx,
    serialize(left, prefix, commaL, depth, ctx),
    serialize(left, prefix, commaR, depth, ctx),
    "eq"
  );
}

/**
 * 合并两侧的 key 顺序。
 *
 * 共有的 key 按**左侧**顺序排（这样两列能对齐）；只在右侧出现的 key
 * 插到「它右侧顺序里后面第一个共有 key」之前，而不是一律堆到末尾，
 * 这样新增的 key 显示位置更接近它在右文档里的真实位置。
 *
 * 两侧 key 顺序不一致时无法同时满足「对齐」和「各自保序」，
 * 这里选择对齐 —— JSON 对象的 key 顺序本身不影响语义。
 */
function mergeKeyOrder(
  l: Record<string, unknown>,
  r: Record<string, unknown>
): string[] {
  const leftKeys = Object.keys(l);
  const rightKeys = Object.keys(r);

  // 右侧独有的 key → 锚点（它后面第一个共有 key；没有则挂到末尾）
  const anchored = new Map<string, string[]>();
  const trailing: string[] = [];

  for (let i = 0; i < rightKeys.length; i++) {
    const key = rightKeys[i];
    if (key in l) continue;

    let anchor: string | null = null;
    for (let j = i + 1; j < rightKeys.length; j++) {
      if (rightKeys[j] in l) {
        anchor = rightKeys[j];
        break;
      }
    }

    if (anchor === null) trailing.push(key);
    else {
      const list = anchored.get(anchor);
      if (list) list.push(key);
      else anchored.set(anchor, [key]);
    }
  }

  const out: string[] = [];
  for (const key of leftKeys) {
    const pending = anchored.get(key);
    if (pending) out.push(...pending);
    out.push(key);
  }
  out.push(...trailing);
  return out;
}

function emitObject(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  delta: Record<string, Delta>,
  prefix: string,
  commaL: boolean,
  commaR: boolean,
  depth: number,
  ctx: Ctx
): void {
  const ind = pad(ctx, depth);
  const l = left ?? {};
  const r = right ?? {};

  const keys = mergeKeyOrder(l, r);

  if (keys.length === 0) {
    pushZipped(ctx, [`${ind}${prefix}{}${commaL ? "," : ""}`], [`${ind}${prefix}{}${commaR ? "," : ""}`], "eq");
    return;
  }

  pushZipped(ctx, [`${ind}${prefix}{`], [`${ind}${prefix}{`], "eq");

  // 某个 key 是否会渲染在这一侧
  const inL = keys.map((k) => k in l);
  const inR = keys.map((k) => k in r);
  const laterIn = (flags: boolean[], i: number) => flags.slice(i + 1).some(Boolean);

  keys.forEach((k, i) => {
    emit(l[k], r[k], delta[k], k, laterIn(inL, i), laterIn(inR, i), depth + 1, ctx);
  });

  pushZipped(ctx, [`${ind}}${commaL ? "," : ""}`], [`${ind}}${commaR ? "," : ""}`], "eq");
}

/**
 * 数组对齐。
 *
 * jsondiffpatch 的数组 delta 里：
 *   "N"  → 新数组第 N 项被插入或修改
 *   "_N" → 原数组第 N 项被删除（[v,0,0]）或移动（['',destIdx,3]）
 * 剩下没提到的项按顺序一一对应。
 */
function emitArray(
  left: unknown[],
  right: unknown[],
  delta: Record<string, Delta>,
  prefix: string,
  commaL: boolean,
  commaR: boolean,
  depth: number,
  ctx: Ctx
): void {
  const ind = pad(ctx, depth);

  const removed = new Set<number>();
  const movedFrom = new Map<number, number>(); // 原下标 → 新下标
  const changedAt = new Map<number, Delta>(); // 新下标 → delta
  const insertedAt = new Set<number>();

  for (const rawKey of Object.keys(delta)) {
    if (rawKey === "_t") continue;
    const d = delta[rawKey];

    if (rawKey.startsWith("_")) {
      const oldIdx = Number(rawKey.slice(1));
      if (isArrayDelta(d) && d.length === 3 && d[2] === 3) {
        movedFrom.set(oldIdx, d[1] as number);
      } else {
        removed.add(oldIdx);
      }
    } else {
      const newIdx = Number(rawKey);
      changedAt.set(newIdx, d);
      if (isArrayDelta(d) && d.length === 1) insertedAt.add(newIdx);
    }
  }

  const leftArr = left ?? [];
  const rightArr = right ?? [];

  if (leftArr.length === 0 && rightArr.length === 0) {
    pushZipped(
      ctx,
      [`${ind}${prefix}[]${commaL ? "," : ""}`],
      [`${ind}${prefix}[]${commaR ? "," : ""}`],
      "eq"
    );
    return;
  }

  pushZipped(ctx, [`${ind}${prefix}[`], [`${ind}${prefix}[`], "eq");

  const slots = buildArraySlots(
    leftArr.length,
    rightArr.length,
    removed,
    movedFrom,
    insertedAt
  );

  // 槽位是否渲染在这一侧
  const inL = slots.map((s) => s.oldIdx !== null);
  const inR = slots.map((s) => s.newIdx !== null);
  const laterIn = (flags: boolean[], i: number) => flags.slice(i + 1).some(Boolean);

  slots.forEach((slot, i) => {
    let d: Delta;
    if (slot.newIdx === null) {
      // 只在左侧 → 删除（含被移走的项）
      d = [leftArr[slot.oldIdx as number], 0, 0] as Delta;
    } else if (slot.oldIdx === null) {
      // 只在右侧 → 新增（含移动过来的项）
      d = changedAt.get(slot.newIdx) ?? ([rightArr[slot.newIdx]] as Delta);
    } else {
      d = changedAt.get(slot.newIdx);
    }

    emit(
      slot.oldIdx !== null ? leftArr[slot.oldIdx] : undefined,
      slot.newIdx !== null ? rightArr[slot.newIdx] : undefined,
      d,
      null,
      laterIn(inL, i),
      laterIn(inR, i),
      depth + 1,
      ctx
    );
  });

  pushZipped(
    ctx,
    [`${ind}]${commaL ? "," : ""}`],
    [`${ind}]${commaR ? "," : ""}`],
    "eq"
  );
}

interface Slot {
  oldIdx: number | null;
  newIdx: number | null;
}

/**
 * 把原数组下标和新数组下标配成槽位。
 * 没被删除也没被移动的项按顺序一一对应；被删除的项插在它原本的相对位置上。
 *
 * 移动的项**不配对**，而是拆成「左侧删除 + 右侧新增」两个槽位。
 * 因为槽位整体按新数组顺序排列，如果把移动项对齐到同一行，
 * 左列就会被迫按新顺序输出 —— 单独取出来就不是原来那份文档了。
 * 变更清单里仍然如实标为「移动」，那边没有顺序约束。
 */
function buildArraySlots(
  leftLen: number,
  rightLen: number,
  removed: Set<number>,
  movedFrom: Map<number, number>,
  insertedAt: Set<number>
): Slot[] {
  // 被移走的项，在左列按「删除」呈现
  const goneFromLeft = new Set<number>(removed);
  for (const oldIdx of movedFrom.keys()) goneFromLeft.add(oldIdx);

  // 移动过来的项，在右列按「新增」呈现
  const newFromMove = new Set<number>(movedFrom.values());

  // 既没删也没移的原下标，按顺序待配
  const availableOld: number[] = [];
  for (let i = 0; i < leftLen; i++) {
    if (!goneFromLeft.has(i)) availableOld.push(i);
  }

  const newToOld = new Map<number, number>();
  let cursor = 0;
  for (let j = 0; j < rightLen; j++) {
    if (insertedAt.has(j) || newFromMove.has(j)) continue;
    if (cursor < availableOld.length) newToOld.set(j, availableOld[cursor++]);
  }

  const slots: Slot[] = [];
  let oldCursor = 0;

  const flushRemovedBefore = (limit: number) => {
    while (oldCursor < limit) {
      if (goneFromLeft.has(oldCursor)) slots.push({ oldIdx: oldCursor, newIdx: null });
      oldCursor++;
    }
  };

  for (let j = 0; j < rightLen; j++) {
    const oi = newToOld.get(j);
    if (oi === undefined) {
      slots.push({ oldIdx: null, newIdx: j });
      continue;
    }
    flushRemovedBefore(oi);
    slots.push({ oldIdx: oi, newIdx: j });
    oldCursor = Math.max(oldCursor, oi + 1);
  }
  flushRemovedBefore(leftLen);

  return slots;
}

/* ---------- 对外入口 ---------- */

export function computeDiff(
  left: unknown,
  right: unknown,
  indent: string
): DiffResult {
  const delta = differ.diff(left, right);

  const changes: Change[] = [];
  collectChanges(delta, [], changes);

  const ctx: Ctx = { rows: [], indent, truncated: false };
  emit(left, right, delta, null, false, false, 0, ctx);

  // 行号：左右各自独立计数，空占位不占号
  let lineL = 0;
  let lineR = 0;
  const rows: PairedRow[] = ctx.rows.map((r) => ({
    ...r,
    lineL: r.l !== null ? ++lineL : null,
    lineR: r.r !== null ? ++lineR : null,
  }));

  const stats = { add: 0, del: 0, mod: 0, move: 0 };
  for (const c of changes) stats[c.kind]++;

  return {
    changes,
    rows,
    identical: delta === undefined,
    truncated: ctx.truncated,
    stats,
  };
}

/** 「仅差异」：保留差异行及其上下 context 行，中间压成一个折叠标记 */
export type DisplayRow = PairedRow | { kind: "gap"; count: number };

export function collapseEqual(rows: PairedRow[], context = 3): DisplayRow[] {
  const keep = new Uint8Array(rows.length);

  for (let i = 0; i < rows.length; i++) {
    if (rows[i].kind === "eq") continue;
    const from = Math.max(0, i - context);
    const to = Math.min(rows.length - 1, i + context);
    for (let k = from; k <= to; k++) keep[k] = 1;
  }

  const out: DisplayRow[] = [];
  let i = 0;
  while (i < rows.length) {
    if (keep[i]) {
      out.push(rows[i]);
      i++;
    } else {
      const start = i;
      while (i < rows.length && !keep[i]) i++;
      out.push({ kind: "gap", count: i - start });
    }
  }
  return out;
}

export function isGap(row: DisplayRow): row is { kind: "gap"; count: number } {
  return row.kind === "gap";
}
