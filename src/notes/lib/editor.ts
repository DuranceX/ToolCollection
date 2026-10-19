/**
 * 便签编辑器的 CodeMirror 装配。
 *
 * 和 json-formatter 那套刻意分开：那边要行号、折叠、lint，这边是写字的地方，
 * 只要软换行 + 所见即所得装饰，装多了反而干扰。
 *
 * 颜色同样全部走 CSS 变量，切主题不用重建编辑器。
 */

import {
  EditorView,
  keymap,
  drawSelection,
  placeholder as cmPlaceholder,
} from "@codemirror/view";
import { EditorState, type Extension } from "@codemirror/state";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { tags as t } from "@lezer/highlight";
import { liveMarkdown } from "./live-markdown.ts";

/**
 * Markdown token 配色。
 * 大部分视觉效果由 live-markdown 的装饰负责（字号、粗细），
 * 这里只管颜色。
 */
const mdHighlight = HighlightStyle.define([
  { tag: t.heading, color: "var(--text)", fontWeight: "650" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "var(--accent)" },
  { tag: t.url, color: "var(--accent)" },
  { tag: t.monospace, color: "var(--tok-string)" },
  { tag: t.quote, color: "var(--text-muted)" },
  // 不给 t.list 上色：那个标签覆盖整个列表项，会把正文也染成强调色。
  // 圆点由 .cm-md-bullet 自己着色，有序列表的序号走 t.meta。
  // 语法标记本身：不在光标行会被隐藏，显出来时压暗，不抢视线
  { tag: t.processingInstruction, color: "var(--text-faint)" },
  { tag: t.meta, color: "var(--text-faint)" },
]);

const theme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "14px",
    backgroundColor: "transparent",
    color: "var(--text)",
  },
  ".cm-scroller": {
    // 正文用无衬线：这是写笔记的地方，不是看代码
    fontFamily: "var(--font-sans)",
    lineHeight: "1.7",
    overflow: "auto",
    padding: "0",
  },
  ".cm-content": {
    caretColor: "var(--cursor)",
    padding: "var(--sp-4) var(--sp-4) 40vh",
    // 上限宽度，太长的行读起来累
    maxWidth: "760px",
    margin: "0 auto",
  },
  ".cm-line": { padding: "0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--cursor)" },
  "&.cm-focused": { outline: "none" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--selection)",
  },
  ".cm-placeholder": { color: "var(--text-faint)" },
});

export interface EditorHandle {
  view: EditorView;
  getValue: () => string;
  setValue: (text: string) => void;
  focusEnd: () => void;
  destroy: () => void;
}

export function createNoteEditor(opts: {
  parent: HTMLElement;
  doc: string;
  placeholder: string;
  onChange: (text: string) => void;
  /** Ctrl/Cmd + Enter */
  onSave: () => void;
}): EditorHandle {
  const extensions: Extension[] = [
    history(),
    drawSelection(),
    EditorView.lineWrapping,
    cmPlaceholder(opts.placeholder),
    markdown({ base: markdownLanguage, codeLanguages: [] }),
    syntaxHighlighting(mdHighlight),
    liveMarkdown,
    theme,
    keymap.of([
      {
        key: "Mod-Enter",
        run: () => {
          opts.onSave();
          return true;
        },
      },
      // Mod-s 也存一下，符合肌肉记忆
      {
        key: "Mod-s",
        preventDefault: true,
        run: () => {
          opts.onSave();
          return true;
        },
      },
      ...defaultKeymap,
      ...historyKeymap,
    ]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) opts.onChange(u.state.doc.toString());
    }),
  ];

  const view = new EditorView({
    parent: opts.parent,
    state: EditorState.create({ doc: opts.doc, extensions }),
  });

  return {
    view,
    getValue: () => view.state.doc.toString(),
    setValue: (text: string) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      });
    },
    focusEnd: () => {
      const end = view.state.doc.length;
      view.focus();
      view.dispatch({ selection: { anchor: end, head: end } });
    },
    destroy: () => view.destroy(),
  };
}
