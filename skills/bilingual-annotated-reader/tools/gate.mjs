#!/usr/bin/env node
/* ============================================================
   gate.mjs — 一条命令跑完交付闸门，把结果写成可复核的证据
   用法：
     node tools/gate.mjs [--root .] [--no-build] [--no-smoke] [--shots]
                         [--review QA-review.md] [--json]
     node tools/gate.mjs --confirm "看完三张截图，可以交"      # 人工确认（不改内容，只登记）

   产出：<root>/QA.md + <root>/QA.json（--out 可改目录）
   退出码：0 自动层全绿（未跑过的层不算绿，除非 --allow-partial）/ 1 有闸门失败（或 AI 审校有「严重」）/ 2 环境问题

   四态（每个成品都要能回答）：
     自动验证  = 本脚本跑的检查是否全绿
     AI 评估   = QA-review.md 是否存在、严重条目是否为 0
     人工确认  = 是否有人用 --confirm 登记过（并绑定当时的哈希）
     未验证    = 哪些项这次没跑（没跑就不许说通过）
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findChrome, chromeHint } from "./chrome.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i > -1 ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(arg("--root", "."));
const OUT = path.resolve(arg("--out", ROOT));
const NODE = process.execPath;
const tool = (f) => path.join(HERE, f);

if (has("--help")) {
  console.log(`用法: node tools/gate.mjs [--root .] [--no-build] [--no-smoke] [--shots] [--review <file>] [--out <dir>] [--allow-partial] [--json]
      node tools/gate.mjs --confirm "一句话说明你确认了什么"`);
  process.exit(0);
}

const readJSON = (p, dflt) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return dflt; } };
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const now = () => new Date().toISOString();
const st = (p) => { try { return fs.statSync(p); } catch (e) { return null; } };

const INDEX = path.join(ROOT, "index.html");
const DATA = path.join(ROOT, "data");
const QA_JSON = path.join(OUT, "QA.json");
const QA_MD = path.join(OUT, "QA.md");
const REVIEW = path.resolve(arg("--review", path.join(ROOT, "QA-review.md")));

const NUM_LABEL = {
  pairs: "句对", origSentences: "原文句", enWords: "英文词", zhChars: "中文字", emptyZh: "中文空译",
  pairGroups: "页面句对组", anchors: "文内锚点（含重复）", mdImages: "原文图", figures: "配图登记",
  links: "外链", terms: "术语卡", notes: "译注", typos: "笔误备案",
};


/* ---------- 哈希：把「这次验证的是哪份内容」钉死 ---------- */
function hashes() {
  const h = { index: null, data: null, files: {} };
  if (fs.existsSync(INDEX)) h.index = sha(fs.readFileSync(INDEX));
  if (fs.existsSync(DATA)) {
    const files = fs.readdirSync(DATA).sort();
    const acc = [];
    for (const f of files) {
      const p = path.join(DATA, f);
      if (!st(p) || !st(p).isFile()) continue;
      const d = sha(fs.readFileSync(p));
      h.files[f] = d;
      acc.push(f + ":" + d);
    }
    h.data = sha(acc.join("|"));
  }
  return h;
}

/* ---------- 审校报告：数严重 / 中等 / 轻微 ---------- */
function parseReview(file) {
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, "utf8");
  const counts = { 严重: 0, 中等: 0, 轻微: 0 };
  let cur = null;
  for (const line of text.split("\n")) {
    const h = line.match(/^#{1,4}\s*(严重|中等|轻微)/);
    if (h) { cur = h[1]; continue; }
    if (/^#{1,4}\s/.test(line)) { cur = null; continue; }
    if (cur && /^\s*[-*]\s+\S/.test(line)) counts[cur]++;
  }
  return { file: path.relative(ROOT, file) || file, counts, mtime: st(file).mtime.toISOString() };
}

/* ---------- 人工确认：只登记，不重跑 ---------- */
if (argv.includes("--confirm")) {
  const note = arg("--confirm", "");
  const prev = readJSON(QA_JSON, null);
  if (!prev) { console.error("没有 QA.json：先跑一次 node tools/gate.mjs，再登记人工确认。"); process.exit(2); }
  const cur = hashes();
  if (cur.index !== prev.hashes.index || cur.data !== prev.hashes.data) {
    console.error("内容变了（index.html 或 data 的哈希与上次闸门不一致）：先重跑 gate，再确认。");
    console.error("  index.html 上次 " + (prev.hashes.index || "-").slice(0, 16) + " → 现在 " + (cur.index || "-").slice(0, 16));
    console.error("  data/      上次 " + (prev.hashes.data || "-").slice(0, 16) + " → 现在 " + (cur.data || "-").slice(0, 16));
    prev.human = { ok: false, note: "内容已改（哈希不匹配），旧的确认已失效；重跑 gate 后重新确认", at: now(), invalidated: true };
    writeQA(prev);
    console.error("已把 QA.md 的人工确认改回「未确认」。");
    process.exit(1);
  }
  if (prev.ai && prev.ai.state === "有严重问题") {
    console.log("注意：AI 审校仍列有「严重」" + prev.ai.counts.严重 + " 条——确认你已逐条判断过（或已修订）。");
  }
  prev.human = { ok: true, note, at: now() };
  writeQA(prev);
  console.log("已登记人工确认：" + note);
  process.exit(0);
}

/* ---------- 跑一步 ---------- */
function runStep(step) {
  if (step.skip) return { ...step, status: "SKIP", code: null, ms: 0, out: "", reason: step.skip };
  const t0 = Date.now();
  let out = "", code = 0;
  try {
    out = execFileSync(step.cmd[0], step.cmd.slice(1), {
      cwd: step.cwd || ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    code = e.status == null ? 1 : e.status;
    out = String(e.stdout || "") + String(e.stderr || "");
    if (e.code === "ENOENT") { code = 2; out += "\n找不到命令：" + step.cmd[0]; }
  }
  return { ...step, status: code === 0 ? "PASS" : "FAIL", code, ms: Date.now() - t0, out };
}

/* ---------- 组装 ---------- */
const meta = readJSON(path.join(DATA, "meta.json"), {});
const chrome = findChrome();
const tmpContent = path.join(OUT, "QA-content.json");
const steps = [];

steps.push(runStep({
  id: "build", label: "构建 index.html", skip: has("--no-build") ? "--no-build" : null,
  cmd: [NODE, "build.mjs"], cwd: ROOT, tail: 2,
}));
steps.push(runStep({
  id: "content", label: "保真 / 闭合 / 结构", skip: null,
  cmd: [NODE, tool("check-content.mjs"), "--article", "data/article.md", "--root", ROOT, "--json-out", tmpContent], tail: 4,
}));
steps.push(runStep({
  id: "tags", label: "标签平衡", skip: null,
  cmd: [NODE, tool("check-tags.mjs"), "--root", ROOT], tail: 1,
}));
steps.push(runStep({
  id: "smoke", label: "交互冒烟（20+ 项）",
  skip: has("--no-smoke") ? "--no-smoke" : (chrome ? null : "找不到 Chrome：" + chromeHint()),
  cmd: [NODE, tool("smoke.mjs"), "--root", ROOT], tail: 3,
}));
steps.push(runStep({
  id: "shots", label: "分区截图（只出证据，不做断言）", gating: false,
  skip: has("--shots") ? (chrome ? null : "找不到 Chrome：" + chromeHint()) : "未加 --shots",
  cmd: [NODE, tool("shots.mjs"), "--root", ROOT], tail: 2,
}));

const content = readJSON(tmpContent, null);
try { fs.rmSync(tmpContent, { force: true }); } catch (e) {}
const review = parseReview(REVIEW);
const h = hashes();
const gatingSteps = steps.filter((s) => s.gating !== false);
const failed = gatingSteps.filter((s) => s.status === "FAIL");
const skipped = steps.filter((s) => s.status === "SKIP");
const skippedGating = gatingSteps.filter((s) => s.status === "SKIP");
const autoStepsOk = failed.length === 0;
const autoOk = autoStepsOk && skippedGating.length === 0;
const autoState = !autoStepsOk ? "失败" : skippedGating.length ? "部分未验证" : "通过";

const qa = {
  tool: "bilingual-annotated-reader gate v2",
  project: path.basename(ROOT),
  title: meta.title_zh || meta.title_en || path.basename(ROOT),
  source: meta.source_url || "",
  generatedAt: now(),
  auto: { state: autoState, ok: autoOk },
  ai: review
    ? { state: review.counts.严重 ? "有严重问题" : "通过", ...review }
    : { state: "未提供", hint: "派独立审校（提示词见 references/04-qa.md），报告存 " + path.basename(REVIEW) },
  human: { ok: false, note: "", at: null },
  unverified: skipped.map((s) => s.label + "（" + s.reason + "）"),
  steps: steps.map((s) => ({
    id: s.id, label: s.label, status: s.status, code: s.code, ms: s.ms, reason: s.reason || null,
    tail: String(s.out || "").trim().split("\n").filter(Boolean).slice(-(s.tail || 2)).join("\n"),
  })),
  numbers: content ? content.numbers : null,
  warnings: content ? content.warnings : [],
  drift: content ? content.drift : null,
  hashes: { index: h.index, data: h.data, article: h.files["article.md"] || null },
  stillHuman: ["首屏 / 配图区 / 附录 三张截图的人眼确认", "EN / 中 单语模式各截一张", "「把页面关掉能不能复述论证链」这一句自评"],
};

function fmtMs(ms) { return ms >= 1000 ? (ms / 1000).toFixed(1) + "s" : ms + "ms"; }
function icon(s) { return s === "PASS" ? "✅" : s === "FAIL" ? "❌" : "⛔"; }

function renderQA(q) {
  const autoLine = q.auto.state === "通过" ? "✅ 通过" : q.auto.state === "部分未验证" ? "⚠️ 部分未验证" : "❌ 失败";
  const aiLine = q.ai.state === "通过" ? "✅ 通过（严重 0）" : q.ai.state === "有严重问题" ? "❌ 有严重问题（" + q.ai.counts.严重 + " 条）" : "⛔ 未提供";
  const humanLine = q.human.ok ? "✅ 已确认：" + q.human.note + "（" + new Date(q.human.at).toLocaleString("zh-CN", { hour12: false }) + "）" : "⛔ 未确认";
  const L = [];
  L.push("# QA · " + q.title);
  L.push("");
  L.push("> 由 `node tools/gate.mjs` 生成于 " + new Date(q.generatedAt).toLocaleString("zh-CN", { hour12: false }) + " · 项目 `" + q.project + "`");
  L.push("> 这一页就是这次交付的证据：**没有它，不许说「验证通过」**。");
  if (q.source) L.push(">");
  L.push("> 原文：" + q.source);
  L.push("");
  L.push("## 四态");
  L.push("");
  L.push("| 层级 | 状态 |");
  L.push("|---|---|");
  L.push("| 自动验证 | " + autoLine + " |");
  L.push("| AI 评估 | " + aiLine + " |");
  L.push("| 人工确认 | " + humanLine + " |");
  L.push("| 未验证 | " + (q.unverified.length ? q.unverified.join("；") : "无（自动层已全跑）") + " |");
  L.push("");
  L.push("## 闸门");
  L.push("");
  L.push("| 步骤 | 退出码 | 用时 | 结果 |");
  L.push("|---|---:|---:|---|");
  for (const s of q.steps) {
    const last = (s.tail || "").split("\n").filter(Boolean).pop() || "";
    const note = s.reason ? s.reason : last.slice(0, 70);
    L.push("| " + s.label + " | " + (s.code == null ? "—" : s.code) + " | " + fmtMs(s.ms) + " | " + icon(s.status) + (note ? " " + note : "") + " |");
  }
  L.push("");
  if (q.numbers) {
    L.push("## 关键数字");
    L.push("");
    L.push("| 项 | 值 |");
    L.push("|---|---|");
    for (const k of Object.keys(q.numbers)) L.push("| " + (NUM_LABEL[k] || k) + " | " + q.numbers[k] + " |");
    L.push("");
  }
  if (q.warnings && q.warnings.length) {
    L.push("## 警告（不拦交付，但审校要逐条交代）");
    L.push("");
    q.warnings.forEach((w) => L.push("- " + w));
    L.push("");
  }
  if (q.drift && (q.drift.degree.length || q.drift.numbers.length || q.drift.terms.length)) {
    L.push("## 漂移扫描（候选清单，交给审校逐条判）");
    L.push("");
    if (q.drift.degree.length) { L.push("**程度词可能丢失**"); q.drift.degree.slice(0, 10).forEach((d) => L.push("- " + d)); L.push(""); }
    if (q.drift.numbers.length) { L.push("**数字对不上**"); q.drift.numbers.slice(0, 10).forEach((d) => L.push("- " + d)); L.push(""); }
    if (q.drift.terms.length) { L.push("**术语叫法不一致**"); q.drift.terms.slice(0, 10).forEach((d) => L.push("- " + d)); L.push(""); }
  }
  L.push("## 证据");
  L.push("");
  L.push("- `index.html` sha256：`" + (q.hashes.index || "缺失") + "`");
  L.push("- `data/`（全部 json + article.md）合并 sha256：`" + (q.hashes.data || "缺失") + "`");
  L.push("- `data/article.md` sha256：`" + (q.hashes.article || "缺失") + "`");
  L.push("- 内容变了，这些哈希就变；`--confirm` 会因此拒绝登记人工确认。");
  L.push("");
  L.push("## 仍需人眼（脚本判不了）");
  L.push("");
  q.stillHuman.forEach((x) => L.push("- [ ] " + x));
  L.push("");
  L.push("确认后用：`node tools/gate.mjs --confirm \"一句话说明\"`（会绑定当前哈希）");
  return L.join("\n") + "\n";
}

function writeQA(q) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(QA_JSON, JSON.stringify(q, null, 2) + "\n", "utf8");
  fs.writeFileSync(QA_MD, renderQA(q), "utf8");
}

/* 保留上一次的人工确认（内容没变才算数） */
const prev = readJSON(QA_JSON, null);
if (prev && prev.human && prev.human.ok && prev.hashes && prev.hashes.index === h.index && prev.hashes.data === h.data) {
  qa.human = prev.human;
  qa.auto.state = qa.auto.state; /* 内容未变，人工确认继续有效 */
}

writeQA(qa);

/* ---------- 终端摘要 ---------- */
console.log("\n" + qa.title + "  ·  " + qa.project);
for (const s of qa.steps) console.log("  " + icon(s.status) + " " + s.label.padEnd(22) + (s.code == null ? "" : "exit " + s.code) + "  " + fmtMs(s.ms) + (s.reason ? "  " + s.reason : ""));
console.log("\n自动验证：" + qa.auto.state + " · AI 评估：" + qa.ai.state + " · 人工确认：" + (qa.human.ok ? "已确认" : "未确认"));
if (qa.unverified.length) console.log("未验证：" + qa.unverified.join("；"));
if (qa.warnings && qa.warnings.length) console.log("警告：" + qa.warnings.length + " 条（见 QA.md）");
console.log("证据：" + path.relative(process.cwd(), QA_MD) + " + " + path.relative(process.cwd(), QA_JSON));
if (!review) console.log("\n下一步：派独立审校（references/04-qa.md 有提示词），报告存 " + path.basename(REVIEW) + " 后再跑一次 gate。");
if (has("--json")) console.log("\n" + JSON.stringify(qa, null, 2));

const unverifiedGating = autoOk === false && autoStepsOk === true;
if (unverifiedGating) {
  console.log("\n未验证的层不算通过：" + skippedGating.map((s) => s.label).join("、"));
  if (!has("--allow-partial")) console.log("  （确认这是有意跳过，加 --allow-partial 才允许以 0 退出；QA.md 仍会记「部分未验证」）");
}
const bad = failed.length > 0 || (qa.ai.counts && qa.ai.counts.严重 > 0) || (unverifiedGating && !has("--allow-partial"));
process.exit(bad ? 1 : 0);
