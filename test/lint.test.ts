/**
 * JSON 语法诊断的回归测试。
 *
 * 起因：合法 JSON 超过 ~3000 字符后被报语法错误。
 * 根因是 CodeMirror 的 syntaxTree(state) 只按视口预算解析，
 * 部分树在截断处带一个 error 节点 —— 那是假的。
 *
 * 这里不 import cm.ts（它拉 @codemirror/view，Node 里没有 DOM），
 * 而是复刻它的取树逻辑，把「合法输入零报错」这条不变量钉住。
 */

import { EditorState } from "@codemirror/state";
import { syntaxTree, ensureSyntaxTree } from "@codemirror/language";
import { json as jsonLang } from "@codemirror/lang-json";
import type { Tree } from "@lezer/common";

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

/* ---------- 与 cm.ts 保持一致的取树 + 诊断 ---------- */

const PARSE_TIMEOUT = 1500;

function resolveTree(state: EditorState): { tree: Tree; complete: boolean } {
  const parsed = ensureSyntaxTree(state, state.doc.length, PARSE_TIMEOUT);
  const cached = syntaxTree(state);
  const tree = parsed && parsed.length >= cached.length ? parsed : cached;
  return { tree, complete: tree.length >= state.doc.length };
}

interface Err {
  pos: number;
  line: number;
  col: number;
}

function diagnose(text: string): Err[] {
  if (!text.trim()) return [];
  const state = EditorState.create({ doc: text, extensions: [jsonLang()] });
  const { tree, complete } = resolveTree(state);
  const out: Err[] = [];
  tree.iterate({
    enter: (node) => {
      if (!node.type.isError) return;
      if (!complete && node.to >= tree.length) return;
      const line = state.doc.lineAt(node.from);
      out.push({
        pos: node.from,
        line: line.number,
        col: node.from - line.from + 1,
      });
    },
  });
  return out;
}

/** 旧实现，用来证明这个 bug 真实存在且已被修掉 */
function diagnoseOld(text: string): Err[] {
  if (!text.trim()) return [];
  const state = EditorState.create({ doc: text, extensions: [jsonLang()] });
  const tree = syntaxTree(state);
  const out: Err[] = [];
  tree.iterate({
    enter: (node) => {
      if (!node.type.isError) return;
      const line = state.doc.lineAt(node.from);
      out.push({ pos: node.from, line: line.number, col: node.from - line.from + 1 });
    },
  });
  return out;
}

/* ---------- 造数据 ---------- */

function bigValid(items: number): string {
  return JSON.stringify(
    {
      name: "tool-collection",
      version: "1.0.0",
      config: {
        port: 8080,
        hosts: ["a.example.com", "b.example.com"],
        nested: { deep: { deeper: { value: true } } },
      },
      items: Array.from({ length: items }, (i) => i).map((_, i) => ({
        id: i,
        label: `条目 ${i}`,
        tags: ["x", "y"],
        meta: { active: i % 2 === 0, score: i * 1.5, note: null },
      })),
    },
    null,
    2
  );
}

/* ================= 合法输入必须零报错 ================= */
{
  // 各种长度，尤其要跨过 ~3000 字符那条默认解析预算
  for (const items of [0, 1, 5, 20, 60, 200, 1000, 5000]) {
    const text = bigValid(items);
    const lines = text.split("\n").length;
    // 先确认样本本身合法，否则测试没意义
    let valid = true;
    try {
      JSON.parse(text);
    } catch {
      valid = false;
    }
    ok(`样本自身合法 (${items} 项)`, valid);

    const errs = diagnose(text);
    ok(
      `合法 JSON 零报错 (${lines} 行 / ${text.length} 字符)`,
      errs.length === 0,
      errs.length ? `误报 ${errs.length} 处，首个在第 ${errs[0].line} 行第 ${errs[0].col} 列` : ""
    );
  }

  // 证明旧实现确实有这个 bug —— 否则这些测试是空转
  {
    const text = bigValid(200);
    const before = diagnoseOld(text);
    const after = diagnose(text);
    ok("旧实现在长文档上确实误报", before.length > 0, `旧实现报了 ${before.length} 处`);
    eq("新实现修掉了误报", after.length, 0);
  }
}

/* ================= 各类合法写法 ================= */
{
  const valids: [string, string][] = [
    ["空对象", "{}"],
    ["空数组", "[]"],
    ["顶层字符串", '"hello"'],
    ["顶层数字", "42"],
    ["顶层 true", "true"],
    ["顶层 null", "null"],
    ["负数与科学计数", '{"a":-1,"b":1e10,"c":-2.5e-3}'],
    ["转义字符", '{"a":"line\\nbreak\\t\\"quoted\\"\\\\"}'],
    ["Unicode 转义", '{"a":"\\u4f60\\u597d"}'],
    ["中文键值", '{"名字":"张三","城市":"北京"}'],
    ["emoji", '{"a":"🎉🚀"}'],
    ["空字符串键", '{"":1}'],
    ["数组套数组", "[[[[1,2],[3]],[]],[]]"],
    ["混合数组", '[1,"a",true,null,{"b":[]},[]]'],
    ["前后空白", '\n\n  {"a":1}  \n\n'],
  ];

  for (const [label, text] of valids) {
    let valid = true;
    try {
      JSON.parse(text);
    } catch {
      valid = false;
    }
    if (!valid) {
      // 样本写错了就直接标记出来，不要静静通过
      fails.push(`样本本身不是合法 JSON: ${label} → ${text.slice(0, 40)}`);
      continue;
    }
    const errs = diagnose(text);
    ok(`合法: ${label}`, errs.length === 0, errs.length ? `误报 ${errs.length} 处` : "");
  }

  // 深层嵌套
  {
    let deep = "1";
    for (let i = 0; i < 40; i++) deep = `{"k${i}":${deep}}`;
    let valid = true;
    try {
      JSON.parse(deep);
    } catch {
      valid = false;
    }
    ok("深层嵌套样本合法", valid);
    eq("合法: 40 层嵌套", diagnose(deep).length, 0);
  }
}

/* ================= 真错误必须报出来 ================= */
{
  const invalids: [string, string][] = [
    ["尾随逗号（对象）", '{\n  "a": 1,\n}'],
    ["尾随逗号（数组）", "[\n  1,\n  2,\n]"],
    ["键名没引号", "{\n  a: 1\n}"],
    ["单引号字符串", "{\n  'a': 1\n}"],
    ["缺闭合花括号", '{\n  "a": 1'],
    ["缺闭合方括号", "[\n  1, 2"],
    ["多余的冒号", '{\n  "a":: 1\n}'],
    ["缺冒号", '{\n  "a" 1\n}'],
    ["缺逗号", '{\n  "a": 1\n  "b": 2\n}'],
    ["未闭合字符串", '{\n  "a": "未闭合\n}'],
    ["多余右括号", '{"a":1}}'],
    ["纯逗号", "{,}"],
    ["JS 注释", '{\n  // 注释\n  "a": 1\n}'],
    ["undefined 值", '{"a": undefined}'],
    ["十六进制数", '{"a": 0x1F}'],
  ];

  for (const [label, text] of invalids) {
    let parseOk = true;
    try {
      JSON.parse(text);
    } catch {
      parseOk = false;
    }
    if (parseOk) {
      fails.push(`样本其实是合法 JSON，不该放在非法组: ${label}`);
      continue;
    }
    const errs = diagnose(text);
    ok(`检出: ${label}`, errs.length > 0, "一处都没报，漏报了");
  }
}

/* ================= 长文档里的真错误不能漏 ================= */
{
  // 错误在文档末尾，远超默认解析预算
  {
    const base = bigValid(500);
    const broken = base.slice(0, -1) + ',\n  "dangling": \n}';
    let parseOk = true;
    try {
      JSON.parse(broken);
    } catch {
      parseOk = false;
    }
    ok("末尾坏样本确实非法", !parseOk);
    const errs = diagnose(broken);
    ok(
      `长文档末尾的错误能检出 (${broken.split("\n").length} 行)`,
      errs.length > 0,
      "漏报了末尾的语法错误"
    );
  }

  // 错误在文档开头，后面全是合法内容 —— 只该报开头那处附近
  {
    const tail = bigValid(500);
    const broken = "{,\n" + tail.slice(1);
    const errs = diagnose(broken);
    ok("开头的错误能检出", errs.length > 0);
    ok(
      "错误定位在开头附近",
      errs[0].line <= 3,
      `首个报错在第 ${errs[0]?.line} 行，应该在前 3 行内`
    );
  }

  // 错误在中间
  {
    const text = bigValid(400);
    const lines = text.split("\n");
    const mid = Math.floor(lines.length / 2);
    // 找一个中间的普通属性行，去掉它的冒号
    let hit = -1;
    for (let i = mid; i < lines.length; i++) {
      if (/^\s+"id":/.test(lines[i])) {
        lines[i] = lines[i].replace(":", "");
        hit = i;
        break;
      }
    }
    ok("找到可破坏的中间行", hit > 0);
    const broken = lines.join("\n");
    let parseOk = true;
    try {
      JSON.parse(broken);
    } catch {
      parseOk = false;
    }
    ok("中间坏样本确实非法", !parseOk);
    const errs = diagnose(broken);
    ok(`长文档中间的错误能检出（第 ${hit + 1} 行）`, errs.length > 0, "漏报了中间的语法错误");
  }
}

/* ================= 空白输入 ================= */
{
  eq("空串无报错", diagnose("").length, 0);
  eq("纯空格无报错", diagnose("   ").length, 0);
  eq("纯换行无报错", diagnose("\n\n\n").length, 0);
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) {
  console.log("\n--- 失败详情 ---");
  fails.forEach((f) => console.log("✗ " + f));
  process.exit(1);
}
