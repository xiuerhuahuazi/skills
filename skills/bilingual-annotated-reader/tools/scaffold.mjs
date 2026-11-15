#!/usr/bin/env node
/* ============================================================
   scaffold.mjs — 建骨架 / 刷新旧项目的工具
   用法：
     node scaffold.mjs <目标目录> [--article <原文.md>]      # 新建
     node scaffold.mjs --refresh <已有项目> [--src]         # 只同步 tools/；加 --src 才碰 src/

   为什么有 --refresh：tools/ 与 src/ 是 scaffold 时复制进项目的**快照**，
   以前 skill 更新后旧项目永远停在旧版（5 篇成品里有 3 篇用着缺 [T] 检查的旧脚本）。
   --refresh 只覆盖 tools/（纯通用脚本，安全）；src/ 默认只报告差异不覆盖，
   因为项目里可能有文章专属改动（如 sdlc 的硬编码标签），覆盖会丢。
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, "..");
const TPL = path.join(SKILL, "templates");
const VERSION = "2.1.0";
const TOOLS = ["check-content.mjs", "check-tags.mjs", "smoke.mjs", "shots.mjs", "chrome.mjs", "gate.mjs", "survey.mjs", "publish.mjs"];

const argv = process.argv.slice(2);
const has = (k) => argv.includes(k);
const val = (k, d) => { const i = argv.indexOf(k); return i > -1 ? argv[i + 1] : d; };
/* 位置参数 = 目标目录；带值的 flag 吃掉下一个参数，避免把它当成目录 */
const VALUE_FLAGS = ["--article"];
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--refresh" || a === "--src") continue;
  if (a.startsWith("--")) { if (VALUE_FLAGS.includes(a)) i++; continue; }
  positional.push(a);
}
const target = positional[0];
if (!target) {
  console.error(`用法:\n  node scaffold.mjs <目标目录> [--article <原文.md>]\n  node scaffold.mjs --refresh <已有项目> [--src]`);
  process.exit(1);
}
const root = path.resolve(target);
const stamp = { skill: "bilingual-annotated-reader", version: VERSION, at: new Date().toISOString(), tools: TOOLS };

function writeSkillStamp(dir) {
  fs.mkdirSync(path.join(dir, "data"), { recursive: true });
  fs.writeFileSync(path.join(dir, "data", "skill.json"), JSON.stringify(stamp, null, 2) + "\n", "utf8");
}

function copyTools(dir) {
  fs.mkdirSync(path.join(dir, "tools"), { recursive: true });
  const copied = [];
  for (const f of TOOLS) {
    const src = path.join(HERE, f);
    if (!fs.existsSync(src)) { console.warn("跳过（skill 里没有）：" + f); continue; }
    fs.copyFileSync(src, path.join(dir, "tools", f));
    copied.push(f);
  }
  return copied;
}

function diffLines(a, b) {
  const la = a.split("\n"), lb = b.split("\n");
  let n = 0;
  for (let i = 0; i < Math.max(la.length, lb.length); i++) if (la[i] !== lb[i]) n++;
  return n;
}

/* ---------- 刷新已有项目 ---------- */
if (has("--refresh")) {
  if (!fs.existsSync(path.join(root, "data"))) { console.error("不像一个精读项目（没有 data/）：" + root); process.exit(1); }
  const copied = copyTools(root);
  writeSkillStamp(root);
  console.log("已刷新 tools/：" + copied.join("、") + "（" + VERSION + "）");

  const pairs = [
    ["src/app.js", "app.js"], ["src/style.css", "style.css"], ["src/template.html", "template.html"], ["build.mjs", "build.mjs"],
  ];
  const drift = [];
  for (const [rel, tpl] of pairs) {
    const p = path.join(root, rel), t = path.join(TPL, tpl);
    if (!fs.existsSync(p)) { drift.push(rel + "：项目里没有"); continue; }
    const a = fs.readFileSync(p, "utf8"), b = fs.readFileSync(t, "utf8");
    if (a !== b) drift.push(rel + "：与模板差 " + diffLines(a, b) + " 行");
  }
  if (!drift.length) console.log("src/ 与模板一致");
  else {
    console.log("\nsrc/ 有差异（默认不覆盖，项目里可能是文章专属改动）：");
    drift.forEach((d) => console.log("  · " + d));
    if (has("--src")) {
      for (const [rel, tpl] of pairs) {
        if (fs.existsSync(path.join(root, rel))) fs.copyFileSync(path.join(TPL, tpl), path.join(root, rel));
      }
      console.log("已用模板覆盖 src/ 与 build.mjs（--src）：先跑 node tools/gate.mjs，并人眼看一遍截图。");
    } else {
      console.log("  确认要覆盖再加 --src；覆盖后必须重跑 gate + 看截图。");
    }
  }
  process.exit(0);
}

/* ---------- 新建 ---------- */
const article = val("--article", null);
for (const d of ["data", "assets", "src", "shots", "tools"]) fs.mkdirSync(path.join(root, d), { recursive: true });
for (const [from, to] of [["build.mjs", "build.mjs"], ["style.css", "src/style.css"], ["app.js", "src/app.js"], ["template.html", "src/template.html"]]) {
  fs.copyFileSync(path.join(TPL, from), path.join(root, to));
}
copyTools(root);
writeSkillStamp(root);

const configPath = path.join(root, "data", "config.json");
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(configPath, JSON.stringify({ termPatterns: [], figureAssets: {} }, null, 2) + "\n", "utf8");
}
const metaPath = path.join(root, "data", "meta.json");
if (!fs.existsSync(metaPath)) {
  fs.writeFileSync(metaPath, JSON.stringify({
    title_en: "", title_zh: "", subtitle_zh: "", source_url: "", published: "", org_en: "",
    read_min: 12, overview_title_zh: "60 秒速览：这篇文章在说什么", overview_zh: [],
    overview_foot_zh: "", compare_zh: null, notes: [], typos: [], foot_zh: "",
  }, null, 2) + "\n", "utf8");
}
if (article && fs.existsSync(article)) {
  fs.copyFileSync(article, path.join(root, "data", "article.md"));
  const md = fs.readFileSync(article, "utf8");
  const words = md.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").split(/\s+/).filter(Boolean).length;
  console.log(`已复制原文 → data/article.md（约 ${words} 词）`);
}

console.log(`
工程骨架已建立：${root}（skill ${VERSION}）

下一步（按顺序，缺一不可）：
  1. 抓原始 HTML → node tools/survey.mjs <raw.html> --article data/article.md
     数量对不上就先重建 article.md（references/01-pipeline.md「原始 HTML 对账」）
  2. 读 references/01-pipeline.md，先过「四问确认」再动手
  3. 拆句：写 data/part-1.json …（schema 见 references/02-data-contract.md）
  4. 填 data/config.json 的 termPatterns 与 figureAssets；采集 assets/
  5. node tools/gate.mjs          → 构建 + 全部自动检查 + 写 QA.md/QA.json
     node tools/publish.mjs       → 另出云端版（cloud/index.html + media/，视频/图片外置）
  6. 派独立审校（references/04-qa.md），报告存 QA-review.md
  7. 改完回第 5 步；确认后用 node tools/gate.mjs --confirm "…" 登记人工确认
旧项目升级：node scaffold.mjs --refresh <项目目录>
`);
