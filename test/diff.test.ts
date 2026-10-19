import {
  computeDiff,
  collapseEqual,
  formatPath,
  previewValue,
  isGap,
} from "../src/json-formatter/lib/diff.ts";

let pass = 0;
const fails: string[] = [];

function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) pass++;
  else fails.push(`${label}\n    got:  ${g}\n    want: ${w}`);
}
function ok(label: string, cond: boolean, extra = "") {
  if (cond) pass++;
  else fails.push(`${label}${extra ? "\n    " + extra : ""}`);
}

/** 两列渲染成可读文本，方便断言 */
function render(rows: ReturnType<typeof computeDiff>["rows"]): string {
  return rows
    .map((r) => {
      const mark = r.kind === "eq" ? " " : r.kind === "add" ? "+" : r.kind === "del" ? "-" : "~";
      return `${mark} ${(r.l ?? "").padEnd(28)}| ${r.r ?? ""}`;
    })
    .join("\n");
}

const IND = "  ";

/* ---------- 1. 完全相同 ---------- */
{
  const a = { name: "x", n: 1, list: [1, 2] };
  const d = computeDiff(a, structuredClone(a), IND);
  ok("相同 → identical", d.identical);
  eq("相同 → 无变更", d.changes.length, 0);
  ok("相同 → 全 eq", d.rows.every((r) => r.kind === "eq"));
  // 两列内容必须逐行一致
  ok("相同 → 左右逐行相同", d.rows.every((r) => r.l === r.r));
  // 行数应等于正常 stringify 的行数
  eq("相同 → 行数", d.rows.length, JSON.stringify(a, null, 2).split("\n").length);
}

/* ---------- 2. 修改标量 ---------- */
{
  const d = computeDiff({ v: "1.0.0" }, { v: "2.1.0" }, IND);
  eq("改值 → 1 处", d.changes.length, 1);
  eq("改值 → kind", d.changes[0].kind, "mod");
  eq("改值 → path", formatPath(d.changes[0].path), "v");
  eq("改值 → old/new", [d.changes[0].oldValue, d.changes[0].newValue], ["1.0.0", "2.1.0"]);
  const modRows = d.rows.filter((r) => r.kind === "mod");
  eq("改值 → 1 行 mod", modRows.length, 1);
  ok("改值 → 左右都有内容", modRows[0].l !== null && modRows[0].r !== null);
  ok("改值 → 左含旧值", modRows[0].l!.includes("1.0.0"));
  ok("改值 → 右含新值", modRows[0].r!.includes("2.1.0"));
}

/* ---------- 3. 新增 / 删除 key ---------- */
{
  const d = computeDiff({ a: 1 }, { a: 1, b: 2 }, IND);
  eq("加 key → kind", d.changes[0].kind, "add");
  eq("加 key → path", formatPath(d.changes[0].path), "b");
  const addRows = d.rows.filter((r) => r.kind === "add");
  eq("加 key → 1 行", addRows.length, 1);
  eq("加 key → 左侧占位为空", addRows[0].l, null);
  ok("加 key → 右侧有 b", addRows[0].r!.includes('"b"'));
  // 左侧空占位不应占用行号
  eq("加 key → 左行号为 null", addRows[0].lineL, null);
  ok("加 key → 右行号有值", typeof addRows[0].lineR === "number");
}
{
  const d = computeDiff({ a: 1, b: 2 }, { a: 1 }, IND);
  eq("删 key → kind", d.changes[0].kind, "del");
  const delRows = d.rows.filter((r) => r.kind === "del");
  eq("删 key → 右侧占位为空", delRows[0].r, null);
}

/* ---------- 4. 嵌套 ---------- */
{
  const d = computeDiff(
    { user: { name: "a", meta: { age: 1 } } },
    { user: { name: "a", meta: { age: 2 } } },
    IND
  );
  eq("嵌套 → 1 处", d.changes.length, 1);
  eq("嵌套 → path", formatPath(d.changes[0].path), "user.meta.age");
  // 未变化的部分必须保持 eq，不能连锁标红
  const nonEq = d.rows.filter((r) => r.kind !== "eq");
  eq("嵌套 → 只有 1 行非 eq", nonEq.length, 1);
}

/* ---------- 5. 数组中间插入（文本 diff 的死穴） ---------- */
{
  const d = computeDiff({ t: ["a", "b", "d"] }, { t: ["a", "b", "c", "d"] }, IND);
  eq("数组插入 → 1 处变更", d.changes.length, 1);
  eq("数组插入 → kind", d.changes[0].kind, "add");
  eq("数组插入 → path", formatPath(d.changes[0].path), "t[2]");
  const nonEq = d.rows.filter((r) => r.kind !== "eq");
  eq("数组插入 → 只有 1 行非 eq", nonEq.length, 1);
  ok("数组插入 → 新增的是 c", nonEq[0].r!.includes('"c"'), render(d.rows));
  // "d" 不应因为下标位移被判成差异
  const dRows = d.rows.filter((r) => (r.l ?? "").includes('"d"'));
  ok("数组插入 → d 仍是 eq", dRows.every((r) => r.kind === "eq"), render(d.rows));
}

/* ---------- 6. 数组元素移动 ---------- */
{
  const d = computeDiff({ t: ["a", "b", "c"] }, { t: ["c", "a", "b"] }, IND);
  ok("数组移动 → 识别为 move", d.changes.some((c) => c.kind === "move"), JSON.stringify(d.changes));
  ok("数组移动 → 不是全部重写", d.changes.length < 3, JSON.stringify(d.changes));
}

/* ---------- 7. 对象数组按 id 配对 ---------- */
{
  const left = { rows: [{ id: 1, v: "x" }, { id: 2, v: "y" }] };
  const right = { rows: [{ id: 2, v: "y" }, { id: 1, v: "x2" }] };
  const d = computeDiff(left, right, IND);
  const paths = d.changes.map((c) => `${c.kind}:${formatPath(c.path)}`);
  ok("按 id 配对 → 只报 v 变化和移动", paths.some((p) => p.includes("v")), JSON.stringify(paths));
  ok("按 id 配对 → 没把整对象重写", !paths.includes("mod:rows[0]"), JSON.stringify(paths));
}

/* ---------- 8. 类型改变 ---------- */
{
  const d = computeDiff({ a: 1 }, { a: { b: 2 } }, IND);
  eq("标量→对象 → 1 处", d.changes.length, 1);
  eq("标量→对象 → mod", d.changes[0].kind, "mod");
  const nonEq = d.rows.filter((r) => r.kind !== "eq");
  ok("标量→对象 → 左右都渲染出来", nonEq.some((r) => r.l !== null) && nonEq.some((r) => r.r !== null), render(d.rows));
}

/* ---------- 9. 括号/逗号结构完整性 ---------- */
{
  // 左右两列各自单独取出来，应该都是合法 JSON
  const cases: [unknown, unknown][] = [
    [{ a: 1, b: [1, 2], c: { d: 1 } }, { a: 2, b: [1, 2, 3], c: { d: 1, e: 5 } }],
    [{ list: [{ x: 1 }, { x: 2 }] }, { list: [{ x: 2 }] }],
    [{ a: [] }, { a: [1] }],
    [{ a: {} }, { a: { b: 1 } }],
    [[1, 2, 3], [3, 2, 1]],
    [{ deep: { a: { b: { c: [1, { d: 2 }] } } } }, { deep: { a: { b: { c: [1, { d: 3 }] } } } }],
  ];

  cases.forEach(([l, r], i) => {
    const d = computeDiff(l, r, IND);
    const leftText = d.rows.filter((x) => x.l !== null).map((x) => x.l).join("\n");
    const rightText = d.rows.filter((x) => x.r !== null).map((x) => x.r).join("\n");

    let lo: unknown, ro: unknown;
    let lErr = "", rErr = "";
    try { lo = JSON.parse(leftText); } catch (e) { lErr = String(e); }
    try { ro = JSON.parse(rightText); } catch (e) { rErr = String(e); }

    ok(`case${i} 左列是合法 JSON`, !lErr, lErr + "\n" + leftText);
    ok(`case${i} 右列是合法 JSON`, !rErr, rErr + "\n" + rightText);
    // 而且必须还原成原始数据
    if (!lErr) eq(`case${i} 左列还原`, lo, l);
    if (!rErr) eq(`case${i} 右列还原`, ro, r);
  });
}

/* ---------- 10. collapseEqual ---------- */
{
  const big: Record<string, number> = {};
  for (let i = 0; i < 40; i++) big["k" + i] = i;
  const big2 = { ...big, k20: 999 };
  const d = computeDiff(big, big2, IND);
  const collapsed = collapseEqual(d.rows, 3);
  ok("折叠 → 产生 gap", collapsed.some(isGap));
  ok("折叠 → 行数减少", collapsed.length < d.rows.length);
  const gapTotal = collapsed.filter(isGap).reduce((s, g) => s + (g as { count: number }).count, 0);
  eq("折叠 → gap + 显示 = 原行数", gapTotal + collapsed.filter((r) => !isGap(r)).length, d.rows.length);
  eq("折叠 → 保留那处修改", collapsed.filter((r) => !isGap(r) && r.kind === "mod").length, 1);
}

/* ---------- 11. previewValue / formatPath ---------- */
{
  eq("path 数字下标", formatPath(["a", "0", "b"]), "a[0].b");
  eq("path 特殊字符", formatPath(["a-b"]), '["a-b"]');
  eq("path 空", formatPath([]), "(根)");
  eq("preview 截断", previewValue("x".repeat(100), 10).length, 11);
  eq("preview undefined", previewValue(undefined), "—");
}

/* ---------- 11b. key 顺序规则 ---------- */
{
  // 新增的 key 应插在「它后面第一个共有 key」之前，而不是堆到末尾
  const d = computeDiff({ a: 1, c: 3 }, { a: 1, b: 2, c: 3 }, IND);
  const rightText = d.rows.filter((x) => x.r !== null).map((x) => x.r).join("\n");
  eq("新增 key 插在真实位置", Object.keys(JSON.parse(rightText)), ["a", "b", "c"]);

  // 末尾新增的 key 挂在末尾
  const d2 = computeDiff({ a: 1 }, { a: 1, z: 9 }, IND);
  const r2 = d2.rows.filter((x) => x.r !== null).map((x) => x.r).join("\n");
  eq("末尾新增", Object.keys(JSON.parse(r2)), ["a", "z"]);

  // 顺序冲突时以左侧顺序对齐（记录既有行为，语义不受影响）
  const d3 = computeDiff({ a: 1, b: 2 }, { b: 2, a: 1 }, IND);
  const r3 = d3.rows.filter((x) => x.r !== null).map((x) => x.r).join("\n");
  eq("顺序冲突 → 按左侧对齐", Object.keys(JSON.parse(r3)), ["a", "b"]);
  eq("顺序冲突 → 语义无差异", d3.changes.length, 0);
}

/* ---------- 12. 根节点就是数组 / 标量 ---------- */
{
  const d = computeDiff([1, 2], [1, 2, 3], IND);
  ok("根数组 → 有变更", d.changes.length > 0);
  const rightText = d.rows.filter((x) => x.r !== null).map((x) => x.r).join("\n");
  eq("根数组 → 右列还原", JSON.parse(rightText), [1, 2, 3]);
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) {
  console.log("\n--- 失败详情 ---");
  fails.forEach((f) => console.log("✗ " + f));
  process.exit(1);
}
