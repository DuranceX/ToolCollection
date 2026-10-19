/**
 * JSON 解析与格式化辅助。
 *
 * 错误的「位置」不在这里算 —— 交给 CodeMirror 的 Lezer 语法树
 * （见 lib/cm.ts 的 jsonLinter），那是唯一不依赖引擎报错文本的可靠来源。
 * 这里只关心「能不能解析」和「怎么输出」。
 */

export type IndentMode = "2" | "4" | "tab";

export interface ParseResult {
  ok: boolean;
  empty: boolean;
  value?: unknown;
  error?: string;
}

export function parseJson(text: string): ParseResult {
  const src = text.replace(/^﻿/, ""); // 去 BOM
  if (!src.trim()) return { ok: false, empty: true };

  try {
    return { ok: true, empty: false, value: JSON.parse(src) };
  } catch (err) {
    return {
      ok: false,
      empty: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function indentOf(mode: IndentMode): string | number {
  return mode === "tab" ? "\t" : Number(mode);
}

export function format(value: unknown, mode: IndentMode): string {
  return JSON.stringify(value, null, indentOf(mode)) ?? "";
}

export function minify(value: unknown): string {
  return JSON.stringify(value) ?? "";
}

/** 递归按键名排序，数组顺序保持不变 */
export function sortKeysDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sortKeysDeep) as unknown as T;
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort((a, b) => a.localeCompare(b))) {
      out[key] = sortKeysDeep(src[key]);
    }
    return out as T;
  }
  return value;
}

/** 顶层结构概述，例如「对象 · 8 个键」 */
export function describe(value: unknown): string {
  if (Array.isArray(value)) return `数组 · ${value.length} 项`;
  if (value === null) return "null";
  if (typeof value === "object") {
    return `对象 · ${Object.keys(value as object).length} 个键`;
  }
  return typeof value;
}

// 通用格式化函数放在 shared/，这里转出去保持既有 import 不变
export { byteLength, formatBytes, countLines } from "../../shared/format.ts";
