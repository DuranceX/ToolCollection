import { renderMarkdown, firstLine } from "../src/notes/lib/markdown.ts";
import { parseNotesFile, normalizeNote } from "../src/notes/lib/storage.ts";
import {
  normalizeTag,
  normalizeTags,
  normalizeTagColors,
  tagHueIndex,
  tagKey,
  pickHue,
  TAG_HUES,
  MAX_TAG_LEN,
  MAX_TAGS_PER_NOTE,
} from "../src/notes/lib/types.ts";

let pass = 0;
const fails: string[] = [];

function ok(label: string, cond: boolean, extra = "") {
  if (cond) pass++;
  else fails.push(`${label}${extra ? "\n    " + extra : ""}`);
}
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else fails.push(`${label}\n    got:  ${g}\n    want: ${w}`);
}

/* ================= XSS 防线 ================= */
{
  const attacks: [string, string][] = [
    ["script 标签", '<script>alert(1)</script>'],
    ["img onerror", '<img src=x onerror="alert(1)">'],
    ["svg onload", '<svg onload="alert(1)"></svg>'],
    ["iframe", '<iframe src="javascript:alert(1)"></iframe>'],
    ["javascript 链接", "[点我](javascript:alert(1))"],
    ["data 链接", "[点我](data:text/html,<script>alert(1)</script>)"],
    ["vbscript 链接", "[点我](vbscript:msgbox(1))"],
    ["图片 onerror 语法", "![x](x\" onerror=\"alert(1))"],
    ["HTML 属性注入", '<a href="#" onclick="alert(1)">x</a>'],
    ["style 表达式", '<div style="background:url(javascript:alert(1))">x</div>'],
    ["大写 SCRIPT", '<SCRIPT>alert(1)</SCRIPT>'],
    ["嵌套编码", '&lt;script&gt;alert(1)&lt;/script&gt;'],
  ];

  /**
   * markdown-it 会把原始 HTML 转义成 &lt;img ...&gt;，那是惰性文本。
   * 所以不能直接对整段字符串做正则 —— 转义后的 "onerror=" 字面量仍在，
   * 会误报。这里只扫描**真实标签**：未转义的 < 才算标签开始。
   */
  const ALLOWED_TAGS = new Set([
    "p", "br", "hr", "em", "strong", "s", "code", "pre", "blockquote",
    "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "a", "img",
    "table", "thead", "tbody", "tr", "th", "td", "span",
  ]);

  function findDanger(html: string): string | null {
    const tagRe = /<\/?([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(html))) {
      const tag = m[1].toLowerCase();
      const attrs = m[2] ?? "";
      if (!ALLOWED_TAGS.has(tag)) return `出现了不该有的标签 <${tag}>`;
      if (/\son\w+\s*=/i.test(attrs)) return `<${tag}> 上有事件属性: ${attrs.trim()}`;
      if (/(?:href|src)\s*=\s*["']?\s*(?:javascript|data|vbscript):/i.test(attrs)) {
        return `<${tag}> 有危险协议: ${attrs.trim()}`;
      }
    }
    return null;
  }

  for (const [label, payload] of attacks) {
    const html = renderMarkdown(payload);
    const danger = findDanger(html);
    ok(`XSS: ${label}`, danger === null, `${danger}\n    渲染结果: ${html.slice(0, 160)}`);
  }

  // 反向自检：确认扫描器真的能抓到危险标签，否则上面全过也没意义
  ok("扫描器能抓 script", findDanger("<script>x</script>") !== null);
  ok("扫描器能抓事件属性", findDanger('<p onclick="x">y</p>') !== null);
  ok("扫描器能抓 javascript 协议", findDanger('<a href="javascript:x">y</a>') !== null);
  ok("扫描器不误报正常输出", findDanger("<p>正常 <strong>内容</strong></p>") === null);
}

/* ================= 链接处理 ================= */
{
  const html = renderMarkdown("[站点](https://example.com)");
  ok("外链 target=_blank", html.includes('target="_blank"'));
  ok("外链带 noopener", html.includes("noopener"));
  ok("外链 href 保留", html.includes('href="https://example.com"'));

  ok("mailto 放行", renderMarkdown("[邮件](mailto:a@b.com)").includes("mailto:a@b.com"));
  ok("锚点放行", renderMarkdown("[锚](#top)").includes('href="#top"'));
  ok("站内相对路径放行", renderMarkdown("[内](/tools/x)").includes('href="/tools/x"'));

  // linkify：裸链接自动成链
  ok("裸链接自动成链", renderMarkdown("访问 https://example.com 看看").includes("<a "));
}

/* ================= Markdown 基本语法 ================= */
{
  ok("标题", renderMarkdown("# 标题").includes("<h1>"));
  ok("加粗", renderMarkdown("**粗**").includes("<strong>"));
  ok("斜体", renderMarkdown("*斜*").includes("<em>"));
  ok("行内代码", renderMarkdown("`code`").includes("<code>"));
  ok("代码块", renderMarkdown("```\nx=1\n```").includes("<pre>"));
  ok("无序列表", renderMarkdown("- a\n- b").includes("<ul>"));
  ok("有序列表", renderMarkdown("1. a\n2. b").includes("<ol>"));
  ok("引用", renderMarkdown("> 引用").includes("<blockquote>"));
  ok("分割线", renderMarkdown("---").includes("<hr>"));
  ok("表格", renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |").includes("<table>"));
  ok("删除线", renderMarkdown("~~del~~").includes("<s>"));
  // breaks: true
  ok("单换行也换行", renderMarkdown("第一行\n第二行").includes("<br>"));
}

/* ================= 任务列表 ================= */
{
  const done = renderMarkdown("- [x] 完成的");
  const todo = renderMarkdown("- [ ] 待办的");
  ok("已完成有 is-done", done.includes("task-box is-done"), done);
  ok("未完成无 is-done", todo.includes("task-box") && !todo.includes("is-done"), todo);
  ok("li 标了 task-item", done.includes("task-item"), done);
  ok("方括号标记被移除", !done.includes("[x]"), done);

  // 普通段落里的 [x] 不该被当成复选框
  const para = renderMarkdown("这里有 [x] 不是复选框");
  ok("段落内 [x] 不处理", !para.includes("task-box"), para);
  const paraStart = renderMarkdown("[x] 开头但不是列表");
  ok("段落开头 [x] 不处理", !paraStart.includes("task-box"), paraStart);
}

/* ================= firstLine ================= */
{
  eq("取首个非空行", firstLine("\n\n  正文第一行\n第二行"), "正文第一行");
  eq("去掉标题井号", firstLine("### 我是标题"), "我是标题");
  eq("去掉列表符号", firstLine("- 列表项"), "列表项");
  eq("去掉复选框标记", firstLine("- [ ] 待办事项"), "待办事项");
  eq("全空返回空串", firstLine("\n   \n"), "");
  eq("超长截断", firstLine("x".repeat(80), 10), "xxxxxxxxxx…");
}

/* ================= 标签规范化 ================= */
{
  eq("去首尾空白", normalizeTag("  工作  "), "工作");
  eq("压缩内部空格", normalizeTag("待  办   事项"), "待 办 事项");
  eq("纯空白得空串", normalizeTag("   "), "");
  eq("超长截断", normalizeTag("x".repeat(30)).length, MAX_TAG_LEN);

  eq("非数组得空数组", normalizeTags("工作"), []);
  eq("过滤非字符串", normalizeTags(["a", 1, null, {}, "b"]), ["a", "b"]);
  eq("过滤空白项", normalizeTags(["a", "  ", "", "b"]), ["a", "b"]);
  eq("去重", normalizeTags(["工作", "工作", "生活"]), ["工作", "生活"]);
  eq("去重忽略大小写", normalizeTags(["Bug", "bug", "BUG"]), ["Bug"]);
  eq("数量上限", normalizeTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).length, MAX_TAGS_PER_NOTE);

  // 哈希回落：必须稳定且大小写无关
  eq("同名同色", tagHueIndex("工作"), tagHueIndex("工作"));
  eq("大小写同色", tagHueIndex("Bug"), tagHueIndex("bug"));
  eq("前后空白同色", tagHueIndex(" bug "), tagHueIndex("bug"));
  ok(
    "色值下标在范围内",
    ["工作", "生活", "bug", "紧急", "x", "很长很长的标签名字"].every((t) => {
      const i = tagHueIndex(t);
      return Number.isInteger(i) && i >= 0 && i < TAG_HUES.length;
    })
  );
}

/* ================= 标签配色分配 ================= */
{
  // 核心保证：前 8 个标签必然互不同色（哈希做不到这点，所以才要显式分配）
  {
    const assigned: number[] = [];
    for (let i = 0; i < TAG_HUES.length; i++) assigned.push(pickHue(assigned));
    eq("前 8 个标签颜色全不同", new Set(assigned).size, TAG_HUES.length);
    eq("按调色板顺序分配", assigned, [0, 1, 2, 3, 4, 5, 6, 7]);
  }

  // 超过 8 个之后应均摊，而不是全堆在一个色上
  {
    const assigned: number[] = [];
    for (let i = 0; i < 20; i++) assigned.push(pickHue(assigned));
    const counts = new Array(TAG_HUES.length).fill(0);
    for (const h of assigned) counts[h]++;
    eq("20 个标签用满 8 色", new Set(assigned).size, TAG_HUES.length);
    ok(
      "分布均摊（最多与最少差 ≤1）",
      Math.max(...counts) - Math.min(...counts) <= 1,
      `分布 [${counts.join(",")}]`
    );
  }

  // 让出的颜色应被优先复用
  eq("空表从 0 开始", pickHue([]), 0);
  eq("缺口优先", pickHue([0, 1, 3, 4, 5, 6, 7]), 2);
  ok("非法项被忽略", pickHue([0, -1, 99, NaN, 1.5] as number[]) === 1);

  eq("tagKey 归一化", [tagKey(" Bug "), tagKey("BUG")], ["bug", "bug"]);

  // 配色表校验
  eq("非对象得空表", normalizeTagColors("x"), {});
  eq("数组得空表", normalizeTagColors([1, 2]), {});
  eq("key 归一化", normalizeTagColors({ " Bug ": 2 }), { bug: 2 });
  eq("丢掉非数字值", normalizeTagColors({ a: "x", b: 1 }), { b: 1 });
  eq("丢掉小数", normalizeTagColors({ a: 1.5, b: 2 }), { b: 2 });
  eq("丢掉负数", normalizeTagColors({ a: -1, b: 2 }), { b: 2 });
  eq("越界取模拉回", normalizeTagColors({ a: 9 }), { a: 9 % TAG_HUES.length });
}

/* ================= 存储校验 ================= */
{
  // 正常文件
  const good = JSON.stringify({
    v: 1,
    notes: [
      { id: "a", text: "hi", tags: ["工作"], pinned: true, createdAt: 100, updatedAt: 200 },
    ],
  });
  const r = parseNotesFile(good);
  eq("正常解析条数", r.notes.length, 1);
  eq("字段保留", [r.notes[0].tags, r.notes[0].pinned, r.notes[0].createdAt], [["工作"], true, 100]);

  // 旧数据带 color：忽略掉，不转成标签
  const legacy = parseNotesFile(
    JSON.stringify({ v: 1, notes: [{ id: "x", text: "旧的", color: "yellow" }] })
  );
  eq("旧 color 不进标签", legacy.notes[0].tags, []);
  ok("旧 color 字段被丢弃", !("color" in legacy.notes[0]));

  // 配色表随文件读出来
  eq("读出配色表", r.tagColors, {});
  eq(
    "配色表被解析",
    parseNotesFile(
      JSON.stringify({ v: 1, notes: [{ text: "a", tags: ["工作"] }], tagColors: { 工作: 3 } })
    ).tagColors,
    { 工作: 3 }
  );
  eq(
    "脏配色表被清理",
    parseNotesFile(
      JSON.stringify({ v: 1, notes: [{ text: "a" }], tagColors: { A: 1, b: "x", c: -2 } })
    ).tagColors,
    { a: 1 }
  );

  // 裸数组也接受
  eq("裸数组兼容", parseNotesFile('[{"text":"x"}]').notes.length, 1);
  eq("裸数组无配色表", parseNotesFile('[{"text":"x"}]').tagColors, {});

  // 坏数据
  eq("非 JSON 报错", !!parseNotesFile("{{{").error, true);
  eq("缺 notes 报错", !!parseNotesFile('{"v":1}').error, true);

  // 脏字段就地修补，不整份丢弃
  const dirty = parseNotesFile(
    JSON.stringify({
      v: 1,
      notes: [{ text: "ok" }, null, 42, { text: "b", tags: ["  好  ", "好", 5] }],
    })
  );
  eq("跳过无效条目数", dirty.skipped, 2);
  eq("保留有效条目数", dirty.notes.length, 2);
  eq("脏标签被清理去重", dirty.notes[1].tags, ["好"]);
  eq("缺 tags 得空数组", dirty.notes[0].tags, []);
  ok("自动补 id", dirty.notes.every((n) => !!n.id));
  ok("自动补时间", dirty.notes.every((n) => n.createdAt > 0 && n.updatedAt > 0));

  // tags 是错误类型时不该炸
  eq("tags 为字符串时回落", parseNotesFile('{"v":1,"notes":[{"text":"a","tags":"x"}]}').notes[0].tags, []);
  eq("tags 为 null 时回落", parseNotesFile('{"v":1,"notes":[{"text":"a","tags":null}]}').notes[0].tags, []);

  // normalizeNote 边界
  eq("null 返回 null", normalizeNote(null), null);
  eq("字符串返回 null", normalizeNote("x"), null);
  const n = normalizeNote({ text: "t" });
  ok("缺省 pinned 为 false", n?.pinned === false);
  ok("缺省 text 为空串", normalizeNote({})?.text === "");
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) {
  console.log("\n--- 失败详情 ---");
  fails.forEach((f) => console.log("✗ " + f));
  process.exit(1);
}
