/**
 * 静态语法高亮：把一行 JSON 文本变成带 class 的 HTML。
 *
 * 对比视图有几千行，每行塞一个 CodeMirror 实例不现实，
 * 所以这里直接用 CodeMirror 背后的 Lezer 解析器 + highlightTree，
 * 保证和编辑器里的着色完全一致。
 */

import { jsonLanguage } from "@codemirror/lang-json";
import { highlightTree } from "@lezer/highlight";
import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/** 这里用 class 而不是 inline style，配色交给 CSS 变量 */
const staticStyle = HighlightStyle.define([
  { tag: t.propertyName, class: "tk-key" },
  { tag: t.string, class: "tk-str" },
  { tag: t.number, class: "tk-num" },
  { tag: t.bool, class: "tk-bool" },
  { tag: t.null, class: "tk-null" },
  { tag: t.punctuation, class: "tk-punct" },
  { tag: t.separator, class: "tk-punct" },
]);

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 高亮一段 JSON 文本（通常是单行）。
 * 传入的是「片段」，解析器可能报错，但 highlightTree 对残缺输入也能work，
 * 认不出的部分原样输出。
 */
export function highlightJson(code: string): string {
  if (!code) return "";

  let html = "";
  let pos = 0;
  const tree = jsonLanguage.parser.parse(code);

  highlightTree(tree, staticStyle, (from, to, classes) => {
    if (from > pos) html += escapeHtml(code.slice(pos, from));
    html += `<span class="${classes}">${escapeHtml(code.slice(from, to))}</span>`;
    pos = to;
  });

  if (pos < code.length) html += escapeHtml(code.slice(pos));
  return html;
}

/**
 * 高亮并在 [markFrom, markTo) 区间套一层 <mark>，用于行内字符级差异。
 * 先算高亮再插 mark 会破坏 span 结构，所以这里按字符位置切成三段分别高亮。
 */
export function highlightWithMark(
  code: string,
  markFrom: number,
  markTo: number
): string {
  if (markTo <= markFrom) return highlightJson(code);

  const a = code.slice(0, markFrom);
  const b = code.slice(markFrom, markTo);
  const c = code.slice(markTo);

  // 分段高亮会让跨段的 token（比如被切断的字符串）着色不完整，
  // 对差异展示来说可以接受，换来的是 mark 边界绝对准确。
  return highlightJson(a) + `<mark>${highlightJson(b)}</mark>` + highlightJson(c);
}

/** 去掉公共头尾，得到两行真正不同的字符区间 */
export function innerRange(
  a: string,
  b: string
): { start: number; endA: number; endB: number } | null {
  let s = 0;
  const maxS = Math.min(a.length, b.length);
  while (s < maxS && a[s] === b[s]) s++;

  let ea = a.length;
  let eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) {
    ea--;
    eb--;
  }

  if (s === ea && s === eb) return null;
  return { start: s, endA: ea, endB: eb };
}
