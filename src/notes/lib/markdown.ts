/**
 * Markdown 渲染。
 *
 * 安全上的关键一条：html: false。便签内容常常是从别处粘贴来的，
 * 允许原始 HTML 就等于允许 <script> 和 onerror=，而渲染结果要进 v-html。
 * 关掉它之后 markdown-it 会把 HTML 标签当纯文本转义输出，不需要再挂 DOMPurify。
 */

import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
  html: false, // 不解析原始 HTML —— XSS 防线
  linkify: true, // 裸链接自动变成 <a>
  breaks: true, // 单个换行也换行，便签里更符合直觉
  typographer: false,
});

/* ---------- 链接安全 ---------- */

const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  // attrGet 的返回类型带 number，统一转成字符串再判断
  const href = String(token.attrGet("href") ?? "");

  // 只放行 http/https/mailto，挡掉 javascript: data: 等
  if (!/^(https?:|mailto:|#|\/)/i.test(href)) {
    token.attrSet("href", "#");
  }

  token.attrSet("target", "_blank");
  // noopener 防止新页面通过 window.opener 反向操作本页
  token.attrSet("rel", "noopener noreferrer nofollow");

  return defaultLinkOpen(tokens, idx, options, env, self);
};

/* ---------- 任务列表 ---------- */

/**
 * 把 `- [ ]` / `- [x]` 渲染成复选框。
 * 没引第三方插件：为一个复选框依赖一个多年未更新的包不值得，
 * 这里在 inline 阶段替换开头的 [ ] 标记即可。
 */
md.core.ruler.after("inline", "task_lists", (state) => {
  const tokens = state.tokens;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== "inline" || !token.children?.length) continue;

    const first = token.children[0];
    if (first.type !== "text") continue;

    const m = /^\[([ xX])\]\s/.exec(first.content);
    if (!m) continue;

    // 只在列表项里生效，否则普通段落开头写 [x] 也会被吃掉。
    // 结构固定是 list_item_open → paragraph_open → inline
    if (tokens[i - 1]?.type !== "paragraph_open") continue;
    if (tokens[i - 2]?.type !== "list_item_open") continue;

    const checked = m[1].toLowerCase() === "x";
    first.content = first.content.slice(m[0].length);

    // 标到 li 上，方便 CSS 去掉项目符号
    const li = tokens[i - 2];
    li.attrJoin("class", "task-item");

    const box = new state.Token("html_inline", "", 0);
    box.content = `<span class="task-box${checked ? " is-done" : ""}" aria-hidden="true"></span>`;
    token.children.unshift(box);
  }
  return true;
});

export function renderMarkdown(text: string): string {
  return md.render(text);
}

/** 取首行纯文本，用作卡片标题 / 搜索预览 */
export function firstLine(text: string, max = 60): string {
  const line =
    text
      .split("\n")
      .map((l) => l.replace(/^#{1,6}\s*/, "").replace(/^[-*+]\s+(\[[ xX]\]\s*)?/, "").trim())
      .find((l) => l.length > 0) ?? "";
  return line.length > max ? `${line.slice(0, max)}…` : line;
}
