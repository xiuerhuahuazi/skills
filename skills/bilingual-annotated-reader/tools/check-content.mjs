#!/usr/bin/env node
/* ============================================================
   check-content.mjs — 英中逐句对照的保真度、闭合与漂移校验
   用法：node tools/check-content.mjs [--article <原文.md>] [--root <项目目录>]
                [--json] [--json-out <file>] [--allow-no-html] [--strict-drift]

   退出码（闸门可判）：
     0 = 通过（允许有警告）
     1 = 内容有问题（保真/闭合/结构）
     2 = 环境没准备好（缺原文、缺 index.html 且未加 --allow-no-html）

   检查项：
   A. 我写的每一句英文，能否在原文里逐字找到（抓抄错、改写原文）
   B. 原文的每一句，是否都出现在英文列里（抓漏译）
   C. 中文列是否有空值
   D. 左右两栏同一句是否各出现一次
   E/F/G. 术语 / 链接 / 译注 / 笔误 的标注是否都能对上数据文件
   T. 表格英文单元保真
   S. 结构对账：配图、文内锚点数、图注、survey.json（阶段 0 勘察）
   W. 漂移扫描（警告级）：程度词丢失、数字丢失、术语首次译法不一致

   说明：
   - 纯空白差异（如 `,"passing` vs `, "passing`）自动归为「排版空格」，不算错误；
     其它差异必须在 meta.typos[].quote_en 或 meta.allowed_diffs 里备案，否则算错误。
   - W 类只报警告，默认不拦交付；加 --strict-drift 才升级为错误。
   ============================================================ */
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`用法: node tools/check-content.mjs [--article <原文.md>] [--root <项目目录>]
                [--json] [--json-out <file>] [--allow-no-html] [--strict-drift] [--max-show N]

退出码: 0 通过（可带警告） / 1 内容有问题 / 2 环境没准备好（缺原文、缺 index.html）
检查项: A/B 保真、C 空译、D 句对平衡、E/F/G 引用闭合、T 表格单元、S 结构对账、W 漂移扫描`);
  process.exit(0);
}
const arg = (k, d) => { const i = argv.indexOf(k); return i > -1 ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);
const ROOT = path.resolve(arg("--root", "."));
const ARTICLE = path.resolve(arg("--article", path.join(ROOT, "data", "article.md")));
const ASC = arg("--json-out", null);
const STRICT = has("--strict-drift");
const MAX_SHOW = Number(arg("--max-show", 8));

const errors = [];
const warnings = [];
const numbers = {};
const sections = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);
function out(title, line) {
  sections.push({ title, line });
}

if (!fs.existsSync(ARTICLE)) {
  console.error("找不到原文：" + ARTICLE + "\n用 --article 指定 defuddle 抓下来的 markdown（或加 --allow-no-html 只跑数据层）");
  process.exit(2);
}

const readJSON = (p, dflt) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", p), "utf8")); } catch (e) { return dflt; } };
const meta = readJSON("meta.json", { notes: [], typos: [] });
const config = readJSON("config.json", { termPatterns: [], figureAssets: {} });
const glossary = readJSON("glossary.json", { terms: [] });
const figures = readJSON("figures.json", { figures: [] });
const links = readJSON("links.json", { links: [] });
const survey = readJSON("survey.json", null);
const dataDir = path.join(ROOT, "data");
const parts = fs.readdirSync(dataDir).filter((f) => /^part-\d+\.json$/.test(f)).sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8")));

/* ---------- 原文清洗 ---------- */
const figAlts = new Set((figures.figures || []).map((f) => (f.alt_en || "").trim()).filter(Boolean));
function cleanText(s) {
  return s
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\\\|/g, "|")
    .replace(/\*\*/g, "")
    .replace(/[*_]/g, "")
    .replace(/`/g, "")
    .replace(/^\s*[-–—>]\s+/, "")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
/* <br/> 换成空格再剥标签：否则 `gaps:<br/>- Audio` 会拼成 `gaps:- Audio`（05-pitfalls #17） */
const stripTags = (s) => cleanText(s.replace(/<sup[^>]*>[\s\S]*?<\/sup>/g, "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/ {2,}/g, " "));
const tight = (s) => s.replace(/\s+/g, "");

const mdRaw = fs.readFileSync(ARTICLE, "utf8");
const md = mdRaw.replace(/```[\s\S]*?```/g, "\n");
const bodyLines = md.split("\n").map((l) => l.trim())
  .filter((l) => l && !/^!\[/.test(l) && !/^#{1,6}\s/.test(l) && !figAlts.has(l));
const origParas = bodyLines.map(cleanText);
const origAll = origParas.join(" ");
const origTight = tight(origAll);
const origSentences = bodyLines.filter((l) => !/^\|/.test(l)).map(cleanText)
  .flatMap((p) => p.split(/(?<=[.!?])\s+(?=[A-Z"'])/)).map((s) => s.trim()).filter(Boolean);

/* ---------- 我的数据 ---------- */
const pairs = [];
for (const sec of parts) for (const b of sec.blocks || []) {
  if (b.s) b.s.forEach((p) => pairs.push(p));
  if (b.items) b.items.forEach((it) => it.forEach((p) => pairs.push(p)));
}
const enSents = pairs.map((p) => stripTags(p[0]));
const zhSents = pairs.map((p) => stripTags(p[1]));
const enAll = enSents.join(" ");
const zhAll = zhSents.join(" ");
const enTight = tight(enAll);
const emptyZh = pairs.filter((p) => !stripTags(p[1]).trim()).length;

const wc = (t) => t.split(/\s+/).filter(Boolean).length;

/* 备案表：原文笔误 + 允许差异 */
const quotes = [
  ...(meta.typos || []).map((t) => t.quote_en).filter(Boolean),
  ...(meta.allowed_diffs || []).map((d) => (typeof d === "string" ? d : d && d.en)).filter(Boolean),
].map((q) => tight(stripTags(String(q)))).filter(Boolean);
const declared = (s) => quotes.some((q) => q && (tight(s).includes(q) || q.includes(tight(s))));

/* ---------- A 保真：我的英文句能否在原文找到 ---------- */
const aSpace = [], aDeclared = [], aMissing = [];
for (const en of enSents) {
  if (!en) continue;
  if (origAll.includes(en)) continue;
  if (origTight.includes(tight(en))) { aSpace.push(en); continue; }
  if (declared(en)) { aDeclared.push(en); continue; }
  aMissing.push(en);
}
aMissing.forEach((s) => fail("[A] 英文句不在原文里（抄错/改写）：" + s.slice(0, 100)));
out("[A] 我的英文句在原文中找不到", aMissing.length + "（空白差异 " + aSpace.length + "，已备案 " + aDeclared.length + "）");

/* ---------- B 完整：原文每句是否出现在英文列 ---------- */
const bMissing = [];
for (const s of origSentences) {
  if (enAll.includes(s)) continue;
  if (enTight.includes(tight(s))) continue;
  bMissing.push(s);
}
bMissing.forEach((s) => fail("[B] 原文句在英文列中缺失（漏译）：" + s.slice(0, 100)));
out("[B] 原文句在英文列中缺失", String(bMissing.length));

if (emptyZh) fail("[C] 中文空译 " + emptyZh + " 处");
out("[C] 中文空译", String(emptyZh));

numbers.pairs = pairs.length;
numbers.origSentences = origSentences.length;
numbers.enWords = wc(enAll);
numbers.zhChars = zhAll.length;
numbers.emptyZh = emptyZh;

/* ---------- D–H：index.html 里的引用闭合 ---------- */
const idx = path.join(ROOT, "index.html");
let html = null;
if (fs.existsSync(idx)) {
  html = fs.readFileSync(idx, "utf8");
  const ks = [...html.matchAll(/class="s" data-k="([^"]+)"/g)].map((m) => m[1]);
  const kc = {}; ks.forEach((k) => (kc[k] = (kc[k] || 0) + 1));
  const odd = Object.entries(kc).filter(([, v]) => v !== 2);
  odd.slice(0, MAX_SHOW).forEach(([k, v]) => fail("[D] 句对左右不对称：data-k=" + k + " 出现 " + v + " 次"));
  numbers.pairGroups = ks.length / 2;
  out("[D] 句对 " + numbers.pairGroups + " 组 · 左右不对称", String(odd.length));

  const used = { term: new Set(), link: new Set(), note: new Set(), typo: new Set() };
  for (const m of html.matchAll(/data-(term|link|note|typo)='([^']+)'/g)) used[m[1]].add(m[2]);
  const gk = new Set((glossary.terms || []).map((t) => t.key));
  const nk = new Set((meta.notes || []).map((n) => n.id));
  const lk = new Set((links.links || []).map((l) => l.id));
  [...used.term].filter((k) => !gk.has(k)).forEach((k) => fail("[E] 术语标注未在 glossary 定义：" + k));
  [...used.link].filter((k) => !lk.has(k)).forEach((k) => fail("[F] 链接标注未在 links.json 定义：" + k));
  [...used.note].filter((k) => !nk.has(k)).forEach((k) => fail("[G] 译注标注未在 meta.notes 定义：" + k));
  out("[E] 术语标注 " + used.term.size + " 个 · 未定义", String([...used.term].filter((k) => !gk.has(k)).length));
  out("[E] 术语表未标注（正文没出现，可接受）", JSON.stringify([...gk].filter((k) => !used.term.has(k))));
  out("[F] 链接 " + used.link.size + " 个 · 未定义", String([...used.link].filter((k) => !lk.has(k)).length));
  out("[F] 定义了但正文没用", JSON.stringify([...lk].filter((x) => !used.link.has(x))));
  out("[G] 译注 " + used.note.size + " · 未定义", String([...used.note].filter((k) => !nk.has(k)).length));
  out("[G] 笔误标记 / 备案", used.typo.size + " / " + (meta.typos || []).length);
  if (used.typo.size !== (meta.typos || []).length) {
    warn("[G] 笔误标记 " + used.typo.size + " 处，但 meta.typos 备案 " + (meta.typos || []).length + " 条——确认是多备案还是漏标（链接被 X 编辑器丢掉这类可以只备案不标记）");
  }

  /* 译注编号必须按阅读顺序出现，且与 meta.notes 顺序一致 */
  const order = [];
  for (const m of html.matchAll(/data-note='([^']+)'/g)) if (!order.includes(m[1])) order.push(m[1]);
  const expect = (meta.notes || []).map((n) => n.id);
  if (order.length && JSON.stringify(order) !== JSON.stringify(expect)) {
    fail("[G] 译注在正文中的出现顺序 " + JSON.stringify(order) + " ≠ meta.notes 顺序 " + JSON.stringify(expect));
  }

  const bare = (html.match(/<a data-link/g) || []).length;
  if (bare) fail("[H] 未补 href 的裸链接 " + bare + " 处（build.mjs 的 linkify 没生效）");
  out("[H] 未补 href 的裸链接", String(bare));

  /* 文内锚点数 vs meta.link_stats.refs（口径：同一链接出现两次算两处） */
  const anchorCount = [...html.matchAll(/data-link='([^']+)'/g)].length / 2;
  numbers.anchors = anchorCount;
  const declaredRefs = meta.link_stats && Number(meta.link_stats.refs);
  if (declaredRefs) {
    if (Math.round(anchorCount) !== declaredRefs) {
      warn("[F] meta.link_stats.refs=" + declaredRefs + "，页面实际文内锚点 " + Math.round(anchorCount) + " 处");
    }
  }
  out("[F] 文内锚点（含重复）", String(Math.round(anchorCount)));
} else if (has("--allow-no-html")) {
  warn("没有 index.html：跳过 D–H（引用闭合）与页面级结构检查（--allow-no-html）");
} else {
  console.error("找不到 " + idx + "\n先 node build.mjs，或加 --allow-no-html 只跑数据层（阶段 3 校对时用）");
  process.exit(2);
}

/* ---------- T 表格单元保真 ---------- */
const tableCells = [];
const figIds = [];
const tableBlocks = [];
for (const sec of parts) for (const b of sec.blocks || []) {
  if (b.t === "table") {
    tableBlocks.push(b);
    (b.head || []).forEach((c) => tableCells.push(c[0]));
    (b.rows || []).forEach((r) => r.forEach((c) => tableCells.push(c[0])));
  }
  if (b.t === "fig" && b.fig) figIds.push(b.fig);
}
const cellMissing = tableCells.map(stripTags).filter((n) => n && !origAll.includes(n) && !origTight.includes(tight(n)));
cellMissing.slice(0, MAX_SHOW).forEach((c) => fail("[T] 表格英文单元在原文找不到：" + c.slice(0, 90)));
out("[T] 表格英文单元 " + tableCells.length + " 个 · 找不到", String(cellMissing.length));

/* ---------- S 结构对账 ---------- */
const declaredFigs = (figures.figures || []).map((f) => f.id);
const figUse = {}; figIds.forEach((id) => (figUse[id] = (figUse[id] || 0) + 1));
figIds.filter((id) => !declaredFigs.includes(id)).forEach((id) => fail("[S] fig 块引用了 figures.json 里没有的 id：" + id));
declaredFigs.filter((id) => !figUse[id]).forEach((id) => fail("[S] figures.json 有 " + id + "，但正文没有任何 fig 块引用它"));
Object.entries(figUse).filter(([, n]) => n > 1).forEach(([id, n]) => fail("[S] 同一张图 " + id + " 被引用了 " + n + " 次"));
out("[S] 配图（引用 / 定义）", figIds.length + " / " + declaredFigs.length);

const mdImg = (mdRaw.match(/!\[/g) || []).length;
numbers.mdImages = mdImg;
const mdTableRows = mdRaw.split("\n").filter((l) => /^\s*\|/.test(l) && !/^\s*\|[\s:|-]+\|?\s*$/.test(l)).length;
if (mdImg && mdImg > declaredFigs.length) {
  warn("[S] 原文里有 " + mdImg + " 张图，figures.json 只登记 " + declaredFigs.length + " 张——确认是不是丢图（05-pitfalls #16）");
}
if (mdTableRows && !tableBlocks.length) {
  warn("[S] 原文里有 markdown 表格 " + mdTableRows + " 行，但正文没有 table 块——表格被吞了？");
}
if (mdTableRows && tableBlocks.length) {
  /* markdown 的行数含表头行；页面 table 的 head 也是表头行，所以每张表 +1 */
  const rowsOnPage = tableBlocks.reduce((n, b) => n + (b.rows || []).length + 1, 0);
  if (rowsOnPage < mdTableRows) warn("[S] 原文表格 " + mdTableRows + " 行（含表头），页面 table 块只有 " + rowsOnPage + " 行");
}
out("[S] 原文图 / 表格行", mdImg + " / " + mdTableRows);

/* 阶段 0 勘察 vs 现在（有 survey.json 才比） */
if (survey && survey.counts) {
  const c = survey.counts;
  const cmp = (label, got, want) => { if (want && got < want) warn("[S] survey.json 记 " + label + "=" + want + "，当前数据只有 " + got); };
  cmp("配图", declaredFigs.length, c.img);
  cmp("表格", tableBlocks.length, c.table);
  cmp("代码块", (() => { let n = 0; for (const s of parts) for (const b of s.blocks || []) if (b.t === "code") n++; return n; })(), c.pre);
  cmp("链接", (links.links || []).length, c.links);
  out("[S] survey.json", "配图 " + c.img + " · 表格 " + c.table + " · 代码 " + c.pre + " · 链接 " + c.links);
}

/* ---------- W 漂移扫描（警告级） ---------- */
/* 注意 may / can 的假阳性：`May 2026` 是月份，不是情态。带 i 标志会让它命中，
   所以单独用大小写敏感的正则；`Can you` 这类句首情态确实会漏，可接受。 */
const DEGREE = [
  [/\b(often|frequently|usually|typically|commonly)\b/i, /(经常|常常|往往|通常|多半|多数|一般会|频繁|时常|常)/, "频率词"],
  [/\b(always|invariably)\b/i, /(总是|总|一直|永远|始终|必然|必定)/, "always"],
  [/\b(never|rarely|seldom)\b/i, /(从不|从未|极少|很少|罕有|决不|绝不会)/, "never/rarely"],
  /* about / around 只有后面跟数字才算约数；「about how」是「关于」，不算 */
  [/\b(roughly|approximately|nearly|almost)\b/i, /(大约|约|大概|左右|接近|近|差不多|几乎|将近)/, "约数"],
  [/\b(about|around)\b(?=\s*\d)/i, /(大约|约|大概|左右|接近|差不多|将近)/, "约数"],
  [/\b(only|just|exclusively)\b/i, /(只|仅|唯一|光)/, "only"],
  [/\b(most|majority|most of)\b/i, /(大多数|多数|大部分|绝大多数|多是|最多|最)/, "most"],
  [/\b(some|several|a few)\b/i, /(一些|部分|某些|若干|少数|几|有些|些|数个|几家|多个)/, "some"],
  [/\b(tends? to|tendency)\b/i, /(倾向于|往往|容易|倾向|一般)/, "tends to"],
];
const driftDegree = [];
pairs.forEach(([en, zh], i) => {
  const e = stripTags(en), z = stripTags(zh);
  for (const [re, zhRe, label] of DEGREE) {
    const m = e.match(re);
    if (m && !zhRe.test(z)) {
      const at = Math.max(0, e.indexOf(m[0]) - 25);
      driftDegree.push("第 " + (i + 1) + " 对[" + label + " " + m[0] + "] …" + e.slice(at, at + 70));
      break;
    }
  }
});
const D = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
/* 1–99 的中文说法（十一 / 二十 / 二十三），用于判断数字是否被译成汉字 */
function zhNum(n) {
  const v = Number(n);
  if (!Number.isInteger(v) || v < 0 || v > 99) return null;
  if (v === 2) return "两"; /* 两 比 二 更常见，两个都要认 */
  if (v < 10) return D[v];
  if (v === 10) return "十";
  if (v < 20) return "十" + D[v - 10];
  const t = Math.floor(v / 10), r = v % 10;
  return D[t] + "十" + (r ? D[r] : "");
}
const driftNum = [];
pairs.forEach(([en, zh], i) => {
  const e = stripTags(en), z = stripTags(zh);
  for (const m of e.matchAll(/(?<![\w.])(\d[\d,]*(?:\.\d+)?)(\s*(k|m|b|K|M|B|million|billion|thousand))?/g)) {
    const n = m[1].replace(/,/g, "");
    if (z.includes(n)) continue;
    const h = zhNum(n);
    if (h && z.includes(h)) continue;
    if (h === "两" && z.includes("二")) continue;
    /* 2x faster 译成「一半时间」是正确译法，不是丢数字 */
    if (n === "2" && /一半|半/.test(z)) continue;
    if (n.length >= 3 && z.includes(n.replace(/(\d)(\d{3})$/, "$1,$2"))) continue;
    /* 万 / 亿 换算是正常译法：25M → 2,500 万 */
    const mag = m[3] || "";
    if (/^[mM]|million$/.test(mag) && /(万|亿|百万)/.test(z)) continue;
    if (/^[bB]|billion$/.test(mag) && /(亿|十亿)/.test(z)) continue;
    if (/^[kK]|thousand$/.test(mag) && /(千|万)/.test(z)) continue;
    driftNum.push("第 " + (i + 1) + " 对[" + n + mag + "] " + z.slice(0, 60));
    break;
  }
});
const driftTerm = [];
const gterms = glossary.terms || [];
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
for (const t of gterms) {
  const pat = (config.termPatterns || []).find((p) => p.key === t.key);
  if (!pat) { warn("[E] glossary 有 " + t.key + "，但 config.termPatterns 没有对应正则（不会标注）"); continue; }
  let re; try { re = new RegExp(pat.en, pat.enFlags || ""); } catch (e) { warn("[E] 术语正则无效：" + t.key); continue; }
  const zi = pairs.findIndex(([en]) => re.test(stripTags(en)));
  if (zi < 0) continue;
  const zhName = String(t.zh || "").replace(/[（(].*?[)）]/g, "").trim();
  const zfirst = stripTags(pairs[zi][1]);
  if (!zhName) continue;
  /* 正文用英文原名 / 缩写（SAST、Git）也算一致，只有「中文换了说法」才报 */
  const enTerm = String(t.en || "").trim();
  /* 「SAST (static application security testing)」这种写法：正文用缩写 SAST 也算一致 */
  const shortEn = enTerm.split(/[(（\s]/)[0];
  const sameName = zfirst.includes(zhName)
    || (enTerm && new RegExp(escRe(enTerm), "i").test(zfirst))
    || (shortEn.length >= 2 && new RegExp("\\b" + escRe(shortEn) + "\\b", "i").test(zfirst));
  if (!sameName) {
    driftTerm.push("第 " + (zi + 1) + " 对[" + t.key + "] 术语卡写「" + zhName + "」，正文首次出现译作「" + zfirst.slice(0, 50) + "」");
  }
}
if (driftDegree.length) {
  (STRICT ? fail : warn)("[W] 程度词可能丢失 " + driftDegree.length + " 处（例： " + driftDegree.slice(0, 3).join(" / ") + "）");
}
if (driftNum.length) {
  (STRICT ? fail : warn)("[W] 原文数字在译文里找不到 " + driftNum.length + " 处（例： " + driftNum.slice(0, 3).join(" / ") + "）");
}
if (driftTerm.length) {
  driftTerm.slice(0, MAX_SHOW).forEach((d) => warn("[W] 术语叫法不一致：" + d));
}
out("[W] 程度词 / 数字 / 术语漂移", driftDegree.length + " / " + driftNum.length + " / " + driftTerm.length);

/* ---------- 汇总 ---------- */
numbers.figures = declaredFigs.length;
numbers.links = (links.links || []).length;
numbers.terms = gterms.length;
numbers.notes = (meta.notes || []).length;
numbers.typos = (meta.typos || []).length;
const report = {
  ok: errors.length === 0,
  errors,
  warnings,
  numbers,
  drift: { degree: driftDegree.slice(0, 50), numbers: driftNum.slice(0, 50), terms: driftTerm.slice(0, 50) },
  sections,
  generatedAt: new Date().toISOString(),
  root: ROOT,
};

if (ASC) {
  fs.mkdirSync(path.dirname(path.resolve(ASC)), { recursive: true });
  fs.writeFileSync(ASC, JSON.stringify(report, null, 2) + "\n", "utf8");
}
if (has("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("原文：句 " + origSentences.length + " · 词 " + wc(origAll));
  console.log("我的：句对 " + pairs.length + " · 英词 " + numbers.enWords + " · 中文字 " + numbers.zhChars + " · 空译 " + emptyZh);
  console.log("");
  for (const s of sections) console.log(s.title + "：" + s.line);
  if (warnings.length) {
    console.log("\n⚠ 警告 " + warnings.length + " 条（不拦交付，但要在 QA.md 里交代或复核）：");
    warnings.slice(0, MAX_SHOW).forEach((w) => console.log("  · " + w));
    if (warnings.length > MAX_SHOW) console.log("  … 另有 " + (warnings.length - MAX_SHOW) + " 条，见 --json");
  }
  if (errors.length) {
    console.log("\n✗ 错误 " + errors.length + " 条：");
    errors.slice(0, MAX_SHOW * 2).forEach((e) => console.log("  · " + e));
  }
  console.log("\n" + (errors.length ? "✗ 保真度检查未通过" : "✓ 保真度检查通过（警告 " + warnings.length + " 条）"));
}
process.exit(errors.length ? 1 : 0);
