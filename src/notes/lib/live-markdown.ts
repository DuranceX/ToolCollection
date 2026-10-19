/**
 * Markdown 所见即所得装饰。
 *
 * 做法（和 Obsidian / Typora 的实时预览同一路子）：
 *   1. 遍历 Lezer 语法树，给标题、粗体、代码等加上样式装饰
 *   2. 把语法标记（#、**、`、> 等）隐藏起来
 *   3. 光标落在哪一行，那一行的标记就显出来，方便继续编辑
 *
 * 不是「编辑框 + 预览框」，而是同一块区域直接呈现结果。
 */

import { syntaxTree } from "@codemirror/language";
import type { Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";

/* ---------- 装饰定义 ---------- */

/** 隐藏语法标记 */
const hide = Decoration.replace({});

/** 行级样式：标题、引用、列表项 */
const lineDeco: Record<string, Decoration> = {
  ATXHeading1: Decoration.line({ class: "cm-md-h1" }),
  ATXHeading2: Decoration.line({ class: "cm-md-h2" }),
  ATXHeading3: Decoration.line({ class: "cm-md-h3" }),
  ATXHeading4: Decoration.line({ class: "cm-md-h4" }),
  ATXHeading5: Decoration.line({ class: "cm-md-h5" }),
  ATXHeading6: Decoration.line({ class: "cm-md-h6" }),
  Blockquote: Decoration.line({ class: "cm-md-quote" }),
  FencedCode: Decoration.line({ class: "cm-md-codeblock" }),
  CodeBlock: Decoration.line({ class: "cm-md-codeblock" }),
  Table: Decoration.line({ class: "cm-md-table" }),
};

/** 行内样式 */
const markDeco: Record<string, Decoration> = {
  StrongEmphasis: Decoration.mark({ class: "cm-md-strong" }),
  Emphasis: Decoration.mark({ class: "cm-md-em" }),
  Strikethrough: Decoration.mark({ class: "cm-md-strike" }),
  InlineCode: Decoration.mark({ class: "cm-md-code" }),
  Link: Decoration.mark({ class: "cm-md-link" }),
};

/**
 * 纯语法标记，不在光标行时隐藏。
 * URL 也算：所见即所得只该显示链接文字，地址等编辑时再看。
 */
const MARKER_NODES = new Set([
  "HeaderMark",
  "EmphasisMark",
  "StrikethroughMark",
  "CodeMark",
  "QuoteMark",
  "LinkMark",
  "CodeInfo",
  "URL",
]);

/* ---------- 任务列表复选框 ---------- */

class TaskBox extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number
  ) {
    super();
  }

  eq(other: TaskBox) {
    return other.checked === this.checked && other.pos === this.pos;
  }

  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement("span");
    box.className = `cm-md-task${this.checked ? " is-done" : ""}`;
    box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(this.checked));
    box.tabIndex = -1;
    box.title = this.checked ? "点击取消完成" : "点击标记完成";

    // 点复选框直接改文档里的 [ ] / [x]
    box.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.dispatch({
        changes: {
          from: this.pos,
          to: this.pos + 3,
          insert: this.checked ? "[ ]" : "[x]",
        },
      });
    });

    return box;
  }

  ignoreEvent() {
    return false;
  }
}

/** 无序列表的 - / * / + 换成真正的圆点 */
class Bullet extends WidgetType {
  eq() {
    return true;
  }

  toDOM(): HTMLElement {
    const dot = document.createElement("span");
    dot.className = "cm-md-bullet";
    dot.textContent = "•";
    return dot;
  }
}

const bulletDeco = Decoration.replace({ widget: new Bullet() });

/* ---------- 主逻辑 ---------- */

/** 光标（或选区）是否落在 [from, to] 所在的行上 */
function cursorTouchesLine(view: EditorView, from: number, to: number): boolean {
  const startLine = view.state.doc.lineAt(from).number;
  const endLine = view.state.doc.lineAt(to).number;
  for (const r of view.state.selection.ranges) {
    const a = view.state.doc.lineAt(r.from).number;
    const b = view.state.doc.lineAt(r.to).number;
    // 选区行范围与目标行范围有交集
    if (a <= endLine && b >= startLine) return true;
  }
  return false;
}

function buildDecorations(view: EditorView): DecorationSet {
  const deco: Range<Decoration>[] = [];
  const tree = syntaxTree(view.state);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;

        // 行级
        const ld = lineDeco[name];
        if (ld) {
          const startLine = view.state.doc.lineAt(node.from);
          const endLine = view.state.doc.lineAt(node.to);
          for (let n = startLine.number; n <= endLine.number; n++) {
            const line = view.state.doc.line(n);
            deco.push(ld.range(line.from));
          }
        }

        // 行内
        const md = markDeco[name];
        if (md && node.to > node.from) {
          deco.push(md.range(node.from, node.to));
        }

        // 任务列表：Task 节点下的 TaskMarker 是 [ ] / [x]
        if (name === "TaskMarker") {
          const text = view.state.doc.sliceString(node.from, node.to);
          const checked = /[xX]/.test(text);
          if (!cursorTouchesLine(view, node.from, node.to)) {
            deco.push(
              Decoration.replace({
                widget: new TaskBox(checked, node.from),
              }).range(node.from, node.to)
            );
          }
          return;
        }

        // 列表标记
        if (name === "ListMark" && !cursorTouchesLine(view, node.from, node.to)) {
          const mark = view.state.doc.sliceString(node.from, node.to);
          const line = view.state.doc.lineAt(node.from);
          const rest = view.state.doc.sliceString(node.to, line.to);
          const isTask = /^\s*\[[ xX]\]/.test(rest);

          if (/^[-*+]$/.test(mark)) {
            // 任务项已经有复选框了，- 直接隐掉；普通列表换成圆点
            deco.push(
              isTask
                ? hide.range(node.from, node.to)
                : bulletDeco.range(node.from, node.to)
            );
          }
          // 有序列表的 "1." 保留，序号本身是内容
          return;
        }

        // 语法标记：不在光标行就隐藏
        if (MARKER_NODES.has(name) && node.to > node.from) {
          if (!cursorTouchesLine(view, node.from, node.to)) {
            let end = node.to;
            // 标题的 # 后面跟一个空格，一起隐掉，否则正文左边会缩进一格
            if (name === "HeaderMark") {
              const line = view.state.doc.lineAt(node.to);
              if (end < line.to && view.state.doc.sliceString(end, end + 1) === " ") {
                end += 1;
              }
            }
            deco.push(hide.range(node.from, end));
          }
        }
      },
    });
  }

  // Decoration.set 的第二个参数为 true 表示允许乱序输入、由它排序
  return Decoration.set(deco, true);
}

/**
 * 不加 atomicRanges：光标进入某行时该行的标记就显出来了，
 * 再让光标「整体跳过」会和显隐逻辑打架。
 */
export const liveMarkdown = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      // 选区变化也要重算：光标进出某行会切换标记的显隐
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);
