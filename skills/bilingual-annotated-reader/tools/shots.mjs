#!/usr/bin/env node
/* ============================================================
   shots.mjs — 用 headless Chrome 给页面拍分区截图，做视觉核查
   用法：node tools/shots.mjs [--root <项目目录>] [--width 1500] [--height 1300]

   做法：先注入探针测出每个 section / figure / appendix 的真实纵向偏移，
   再用 body{margin-top:-Npx} 把目标区顶进视口截图。

   已知边界（见 references/05-pitfalls.md）：
   - 偏移超过 ~16000px 时负 margin 方案不可靠（Chrome 合成层上限 16384px；实测 16902px
     不白屏，而是**静默拍到文档末尾**，比白屏更难发现）→ 该区改为「单独渲染」截屏
     （把目标区块切出来、套同一个 <head> 从 0 偏移截图；附录与深部区块都走这条路）
   - Chrome 窗口最小宽度约 512px，想做手机视图请用 600 宽近似
   - CSS 过渡在 virtual-time 下不推进 → opacity 动画的浮层截不到，属假象
   - 每次截图会生成 5-10MB 的 Chrome profile，跑完自动删除，免得撑大工程目录
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { findChrome, chromeHint } from "./chrome.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i > -1 ? argv[i + 1] : d; };
const ROOT = path.resolve(arg("--root", "."));
const CH = findChrome();
if (!CH) { console.error(chromeHint()); process.exit(2); }
const W = Number(arg("--width", 1500));
const H = Number(arg("--height", 1300));
const OUT = path.join(ROOT, "shots");
fs.mkdirSync(OUT, { recursive: true });

const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const HEAD = src.slice(0, src.indexOf("</head>") + 7);
const fileUrl = (p) => "file:///" + p.split("\\").join("/");
const run = (args) => execFileSync(CH, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
const cleanProfile = (dir) => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} };

/* 把目标区块切出来，套同一个 <head>，从 0 偏移截图（绕过负 margin 上限） */
function isolate(id) {
  const idx = id === "appendix"
    ? src.indexOf('<section class="appendix"')
    : id.startsWith("s-")
      ? src.indexOf('<section class="sec" id="' + id + '"')
      : src.indexOf('<figure class="row wide fig" id="' + id + '"');
  if (idx < 0) return null;
  let end;
  if (id === "appendix") {
    end = src.indexOf("</main>", idx + 10);
  } else if (id.startsWith("s-")) {
    const cands = [src.indexOf('<section class="sec"', idx + 10), src.indexOf('<section class="appendix"', idx + 10), src.indexOf("</main>", idx + 10)]
      .filter((x) => x > idx);
    end = Math.min(...cands);
  } else {
    end = src.indexOf("</figure>", idx) + "</figure>".length;
  }
  const chunk = src.slice(idx, end);
  return HEAD + '<body data-mode="both"><main style="max-width:1420px;margin:0 auto;padding:20px 28px">' + chunk + "</main></body></html>";
}

/* 1. 探针 */
const probe = `<script>window.addEventListener('load',function(){
  var out=[];
  document.querySelectorAll('section.hero,.overview,.sec,figure.fig,.appendix').forEach(function(e){
    out.push([e.id||e.className.split(' ')[0], Math.round(e.getBoundingClientRect().top+window.scrollY)]);
  });
  document.title=JSON.stringify({h:Math.round(document.body.scrollHeight),o:out});
});</script>`;
const probeFile = path.join(OUT, "_probe.html");
fs.writeFileSync(probeFile, src.replace("</body>", probe + "</body>"));
const probeProfile = path.join(OUT, "_ch-probe");
let dom;
try {
  dom = run(["--headless=new","--no-sandbox","--disable-gpu","--disable-crash-reporter","--disable-breakpad",
    "--hide-scrollbars","--allow-file-access-from-files","--virtual-time-budget=9000",
    "--user-data-dir=" + probeProfile, "--dump-dom", fileUrl(probeFile)]);
} finally { cleanProfile(probeProfile); }
const tm = dom.match(/<title>([\s\S]*?)<\/title>/);
if (!tm) { console.error("探针失败"); process.exit(1); }
const info = JSON.parse(tm[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
console.log("页面总高：" + info.h + "px，目标区 " + info.o.length + " 个");

/* 2. 逐区截图 */
function shotFile(name, doc, extra = "", w = W, h = H) {
  const f = path.join(OUT, "_s_" + name + ".html");
  fs.writeFileSync(f, doc);
  const profile = path.join(OUT, "_ch-" + name);
  try {
    run(["--headless=new","--no-sandbox","--disable-gpu","--disable-crash-reporter","--disable-breakpad",
      "--hide-scrollbars","--force-prefers-reduced-motion","--run-all-compositor-stages-before-draw","--allow-file-access-from-files",
      `--window-size=${w},${h}`, "--virtual-time-budget=12000",
      "--user-data-dir=" + profile,
      "--screenshot=" + path.join(OUT, (extra || "s_") + name + ".png"),
      fileUrl(f)]);
  } finally { cleanProfile(profile); }
}

let n = 0;
for (const [id, top] of info.o) {
  const safe = id.replace(/[^\w-]/g, "_");
  if (top > 16000) {
    /* 深部区块：单独渲染，别跳过（长文的后半部分最需要人眼看） */
    const doc = isolate(id);
    if (!doc) { console.log("跳过 " + id + "（偏移 " + top + " 超过负 margin 上限，且无法切块）"); continue; }
    shotFile("iso_" + safe, doc);
    n++;
    console.log("  s_iso_" + id + ".png（单独渲染，原偏移 " + top + "）");
    continue;
  }
  const t = Math.max(0, top - 40);
  shotFile(safe, src.replace("</head>", `<style>body{margin-top:-${t}px!important}</style></head>`));
  n++;
  console.log("  s_" + id + ".png  (offset " + t + ")");
}

/* 3. 附录单独渲染（即使偏移没超限也单独出一张，方便检查卡片布局） */
const appStart = src.indexOf('<section class="appendix"');
if (appStart > -1 && !info.o.some(([id]) => id === "appendix")) {
  const body = src.slice(appStart, src.indexOf("</main>"));
  shotFile("appendix", HEAD + '<body data-mode="both"><main style="max-width:1420px;margin:0 auto;padding:20px 28px">' + body + "</main></body></html>");
  n++;
  console.log("  s_appendix.png（单独渲染）");
}

/* 4. 顶部与窄屏 */
shotFile("top", src);
/* Chrome 窗口最小宽度约 512px，手机视图用 600 近似 */
shotFile("narrow", src, "s_", 600, 1900);
console.log("\n共 " + (n + 2) + " 张 → " + OUT);
