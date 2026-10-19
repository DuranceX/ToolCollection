/**
 * CodeMirror 6 装配。
 *
 * 两个要点：
 * 1. 主题里的颜色全部写成 var(--xxx)，所以切换明暗主题不需要重建编辑器，
 *    改 <html data-theme> 就够了。
 * 2. 语法报错来自 Lezer 语法树的 error 节点，不解析引擎的报错文本 ——
 *    新版 V8 的 "Unexpected token ... is not valid JSON" 根本不带位置。
 */

import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor } from "@codemirror/view";
import { EditorState, type Extension } from "@codemirror/state";
import {
  syntaxHighlighting,
  HighlightStyle,
  bracketMatching,
  foldGutter,
  codeFolding,
  foldKeymap,
  indentOnInput,
  syntaxTree,
  ensureSyntaxTree,
} from "@codemirror/language";
import { history, defaultKeymap, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { json as jsonLang } from "@codemirror/lang-json";
import { tags as t } from "@lezer/highlight";
import type { Tree } from "@lezer/common";

/** JSON token → CSS 变量 */
export const jsonHighlightStyle = HighlightStyle.define([
  { tag: t.propertyName, color: "var(--tok-key)" },
  { tag: t.string, color: "var(--tok-string)" },
  { tag: t.number, color: "var(--tok-number)" },
  { tag: t.bool, color: "var(--tok-boolean)", fontWeight: "550" },
  { tag: t.null, color: "var(--tok-null)", fontStyle: "italic" },
  { tag: t.punctuation, color: "var(--tok-punct)" },
  { tag: t.separator, color: "var(--tok-punct)" },
  { tag: t.invalid, color: "var(--danger)" },
]);

export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "var(--code-size)",
    backgroundColor: "var(--bg)",
    color: "var(--text)",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "var(--code-line)",
    overflow: "auto",
  },
  ".cm-content": { caretColor: "var(--cursor)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--cursor)" },
  "&.cm-focused": { outline: "none" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--selection)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--bg)",
    color: "var(--text-faint)",
    border: "none",
    borderRight: "1px solid var(--border)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--active-line)",
    color: "var(--text-muted)",
  },
  ".cm-activeLine": { backgroundColor: "var(--active-line)" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 6px 0 12px" },
  ".cm-foldGutter .cm-gutterElement": { padding: "0 2px", cursor: "pointer" },
  ".cm-matchingBracket": {
    backgroundColor: "var(--bg-active)",
    outline: "1px solid var(--border-strong)",
  },
  ".cm-selectionMatch": { backgroundColor: "var(--accent-soft)" },
  ".cm-lint-marker": { width: "0.9em", height: "0.9em" },
  ".cm-tooltip": {
    backgroundColor: "var(--bg-elev)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text)",
    boxShadow: "var(--shadow)",
  },
  ".cm-tooltip.cm-tooltip-lint": { fontFamily: "var(--font-sans)", fontSize: "12.5px" },
  ".cm-diagnostic": { padding: "4px 8px", borderLeft: "none" },
  ".cm-diagnostic-error": { borderLeft: "3px solid var(--danger)" },
  ".cm-diagnostic-warning": { borderLeft: "3px solid var(--warning)" },
  ".cm-placeholder": { color: "var(--text-faint)" },
});

/**
 * 全量解析预算。实测 869 KB 约 197ms、3.5 MB 约 988ms，
 * 1500ms 够覆盖 5 MB 上下；再大就退回部分树，只报已解析范围内的错误。
 */
const PARSE_TIMEOUT = 1500;

/**
 * 取尽可能完整的语法树。
 *
 * 必须用 ensureSyntaxTree 的**返回值** —— EditorState 不可变，解析结果写不回去，
 * 之后再调 syntaxTree(state) 拿到的仍是按视口预算解析的部分树（默认只到 ~3000 字符）。
 * 部分树在截断处会带一个 error 节点，那是假的：合法 JSON 也会被报错。
 */
function resolveTree(state: EditorState): { tree: Tree; complete: boolean } {
  const parsed = ensureSyntaxTree(state, state.doc.length, PARSE_TIMEOUT);
  const cached = syntaxTree(state);
  // 超时时 ensureSyntaxTree 返回 null，退回缓存的部分树
  const tree = parsed && parsed.length >= cached.length ? parsed : cached;
  return { tree, complete: tree.length >= state.doc.length };
}

/**
 * 语法诊断。走 Lezer 语法树里的 error 节点，engine-agnostic。
 * 顺带检测重复 key —— JSON.parse 会静默取最后一个，通常是 bug。
 */
export function jsonDiagnostics(state: EditorState): Diagnostic[] {
  const doc = state.doc;
  if (!doc.length || !doc.toString().trim()) return [];

  const out: Diagnostic[] = [];
  const { tree, complete } = resolveTree(state);

  tree.iterate({
    enter: (node) => {
      if (!node.type.isError) return;
      // 树没解析完时，抵着边界的 error 是截断造成的假报错，跳过。
      // 宁可漏报也不误报 —— 后台解析推进后，下一轮 lint 会补上。
      if (!complete && node.to >= tree.length) return;

      // error 节点常常是零宽的，往后借一个字符才能画出波浪线
      const from = Math.min(node.from, doc.length);
      const to = Math.min(Math.max(node.to, from + 1), doc.length);
      out.push({
        from,
        to,
        severity: "error",
        message: describeSyntaxError(state, from),
      });
    },
  });

  // 语法没问题时才查重复 key，否则位置不可靠
  if (out.length === 0) out.push(...duplicateKeyWarnings(state, tree));

  return out;
}

/** 往前找最近的非空白字符，用于把报错位置修正到真正的问题处 */
function lastNonSpaceBefore(
  doc: EditorState["doc"],
  pos: number
): { pos: number; ch: string } | null {
  // 上限 200 字符，避免在超长空白里白跑
  const start = Math.max(0, pos - 200);
  for (let i = pos - 1; i >= start; i--) {
    const c = doc.sliceString(i, i + 1);
    if (!/\s/.test(c)) return { pos: i, ch: c };
  }
  return null;
}

/** 给出比「意外的 token」更具体的说明 */
function describeSyntaxError(state: EditorState, pos: number): string {
  const doc = state.doc;
  const line = doc.lineAt(pos);
  const ch = doc.sliceString(pos, pos + 1);
  const col = pos - line.from + 1;
  const where = `第 ${line.number} 行第 ${col} 列`;

  if (pos >= doc.length) return `${where}：内容意外结束，可能有括号或引号没有闭合`;
  if (ch === ",") return `${where}：多余的逗号`;

  if (ch === "}" || ch === "]") {
    // Lezer 把 error 落在收尾括号上，但真正的问题往往是它前面那个逗号。
    // 往前跳过空白看一眼，能报得更准。
    const prev = lastNonSpaceBefore(doc, pos);
    if (prev && prev.ch === ",") {
      const pl = doc.lineAt(prev.pos);
      return `第 ${pl.number} 行第 ${prev.pos - pl.from + 1} 列：多余的逗号，${ch} 前面不能有逗号`;
    }
    return `${where}：多余的 ${ch}，或前面缺少值`;
  }
  if (ch === "'") return `${where}：JSON 字符串必须用双引号`;
  if (/[A-Za-z_$]/.test(ch)) {
    return `${where}：意外的 ${JSON.stringify(ch)}，键名和字符串需要用双引号包裹`;
  }
  return `${where}：意外的 ${JSON.stringify(ch)}`;
}

/**
 * 同一层对象里出现同名 key。
 * 树由调用方传入 —— 自己调 syntaxTree 只会拿到部分树，长文档里后面的重复 key 查不到。
 */
function duplicateKeyWarnings(state: EditorState, tree: Tree): Diagnostic[] {
  const out: Diagnostic[] = [];
  const doc = state.doc;
  // 每层 Object 一个 Map：key 名 → 首次出现位置
  const stack: Map<string, number>[] = [];

  tree.iterate({
    enter: (node) => {
      if (node.name === "Object") stack.push(new Map());
      if (node.name === "PropertyName" && stack.length) {
        const raw = doc.sliceString(node.from, node.to);
        let key: string;
        try {
          key = JSON.parse(raw) as string;
        } catch {
          return;
        }
        const seen = stack[stack.length - 1];
        if (seen.has(key)) {
          out.push({
            from: node.from,
            to: node.to,
            severity: "warning",
            message: `重复的键 ${JSON.stringify(key)}，解析时只会保留最后一个`,
          });
        } else {
          seen.set(key, node.from);
        }
      }
    },
    leave: (node) => {
      if (node.name === "Object") stack.pop();
    },
  });

  return out;
}

export const jsonLinter = linter((view) => jsonDiagnostics(view.state), {
  delay: 250,
});

/**
 * 不依赖编辑器实例的诊断入口。
 * 状态栏、标签圆点和编辑器共用同一套判断，避免出现「圆点说没错、
 * 编辑器里画了波浪线」这种自相矛盾。
 */
export function diagnoseText(text: string): Diagnostic[] {
  if (!text.trim()) return [];
  const state = EditorState.create({ doc: text, extensions: [jsonLang()] });
  // 全量解析在 jsonDiagnostics 内部完成（resolveTree）
  return jsonDiagnostics(state);
}

/** 把诊断位置换算成行列，供状态栏显示与跳转 */
export function diagnosticPosition(
  text: string,
  d: Diagnostic
): { line: number; column: number } {
  const state = EditorState.create({ doc: text });
  const line = state.doc.lineAt(Math.min(d.from, state.doc.length));
  return { line: line.number, column: d.from - line.from + 1 };
}

const FOLD_MARKERS = {
  open: '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  closed:
    '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
};

function foldMarker(open: boolean): HTMLElement {
  const span = document.createElement("span");
  span.style.color = "var(--text-faint)";
  span.style.display = "inline-flex";
  span.innerHTML = open ? FOLD_MARKERS.open : FOLD_MARKERS.closed;
  return span;
}

/** 可编辑输入框的完整扩展集 */
export function editorExtensions(opts: {
  wrap: boolean;
  onChange: (text: string) => void;
}): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    drawSelection(),
    rectangularSelection(),
    crosshairCursor(),
    history(),
    indentOnInput(),
    bracketMatching(),
    codeFolding(),
    foldGutter({ markerDOM: foldMarker }),
    highlightSelectionMatches(),
    jsonLang(),
    syntaxHighlighting(jsonHighlightStyle),
    jsonLinter,
    lintGutter(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap, indentWithTab]),
    editorTheme,
    opts.wrap ? EditorView.lineWrapping : [],
    EditorView.updateListener.of((update) => {
      if (update.docChanged) opts.onChange(update.state.doc.toString());
    }),
  ];
}

/** 只读结果区：不需要 lint、历史、光标 */
export function viewerExtensions(opts: { wrap: boolean }): Extension[] {
  return [
    lineNumbers(),
    codeFolding(),
    foldGutter({ markerDOM: foldMarker }),
    jsonLang(),
    syntaxHighlighting(jsonHighlightStyle),
    keymap.of([...foldKeymap, ...searchKeymap]),
    editorTheme,
    EditorView.editable.of(false),
    EditorState.readOnly.of(true),
    opts.wrap ? EditorView.lineWrapping : [],
  ];
}
