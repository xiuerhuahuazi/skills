#!/usr/bin/env node
/* ============================================================
   survey.mjs — 阶段 0 勘察：数原始 HTML 的元素，和 article.md 对账
   用法：node tools/survey.mjs <raw.html> [--article data/article.md] [--out data/survey.json] [--strict]

   为什么要有它：defuddle 会静默丢图、吞表格列、吃掉 inline SVG（05-pitfalls #16）。
   先把原始 HTML 的数量记下来，后面 check-content 才有东西可比。
   产出 survey.json 后，check-content 的 [S] 会自动对比「勘察时有多少 / 现在数据里有多少」。

   退出码：0 一致 / 1 有缺失（加 --strict 才拦）/ 2 用法问题
   ============================================================ */
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i > -1 ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);
const raw = argv[0] && !argv[0].startsWith("--") ? path.resolve(argv[0]) : null;
if (!raw || !fs.existsSync(raw)) {
  console.error("用法: node tools/survey.mjs <raw.html> [--article data/article.md] [--out data/survey.json] [--strict]");
  process.exit(2);
}
const html = fs.readFileSync(raw, "utf8");
const count = (re) => (html.match(re) || []).length;

const counts = {
  figure: count(/<figure\b/gi),
  img: count(/<img\b/gi),
  table: count(/<table\b/gi) + count(/role=["']?table/gi),
  video: count(/<video\b/gi),
  pre: count(/<pre\b/gi),
  h2: count(/<h2\b/gi),
  h3: count(/<h3\b/gi),
  p: count(/<p\b/gi),
  links: (() => {
    const hrefs = [...html.matchAll(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["']/gi)].map((m) => m[1]);
    return { total: hrefs.length, unique: new Set(hrefs).size };
  })(),
};

const articlePath = path.resolve(arg("--article", "data/article.md"));
const problems = [];
if (fs.existsSync(articlePath)) {
  const md = fs.readFileSync(articlePath, "utf8");
  const mdImg = (md.match(/!\[/g) || []).length;
  const mdTable = md.split("\n").filter((l) => /^\s*\|/.test(l) && !/^\s*\|[\s:|-]+\|?\s*$/.test(l)).length;
  const mdPre = (md.match(/```/g) || []).length / 2;
  const mdLinks = (md.match(/\]\(https?:\/\//g) || []).length;
  counts.article = { img: mdImg, table: mdTable, pre: Math.round(mdPre), links: mdLinks };
  const cmp = (label, a, b) => { if (b < a) problems.push(label + "：原始 HTML " + a + " 个，article.md " + b + " 个"); };
  cmp("图片", counts.img, mdImg);
  cmp("表格", counts.table, mdTable);
  cmp("代码块", counts.pre, Math.round(mdPre));
}

const out = path.resolve(arg("--out", "data/survey.json"));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ source: path.basename(raw), generatedAt: new Date().toISOString(), counts }, null, 2) + "\n", "utf8");

console.log("原始 HTML：" + Object.entries({ figure: counts.figure, img: counts.img, table: counts.table, video: counts.video, pre: counts.pre, h2: counts.h2, h3: counts.h3, p: counts.p })
  .map(([k, v]) => k + "=" + v).join(" · "));
console.log("外链：锚点 " + counts.links.total + " · 唯一目的地 " + counts.links.unique);
if (counts.article) console.log("article.md：" + Object.entries(counts.article).map(([k, v]) => k + "=" + v).join(" · "));
console.log("已写入 " + path.relative(process.cwd(), out));

if (problems.length) {
  console.log("\n✗ 对不上（先重建 article.md，再翻译）：");
  problems.forEach((p) => console.log("  · " + p));
  console.log("  重建方法见 references/01-pipeline.md「原始 HTML 对账」");
  process.exit(has("--strict") ? 1 : 0);
}
console.log("\n✓ 数量一致");
