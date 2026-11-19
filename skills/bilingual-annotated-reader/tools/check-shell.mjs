#!/usr/bin/env node
/* ============================================================
   check-shell.mjs — 外壳（inject-shell）自检

   用法：
     node tools/check-shell.mjs        # 无参数，全部在临时目录里做，跑完清理

   断言 6 项，逐行打印 PASS/FAIL：
     1. 文档 ↔ 代码对齐：references/09-site-shell.md §5 的选择器清单，
        逐条在 templates/style.css 与注入产物的 [data-theme="dark"] 规则里找得到；
        并核对 §5 表格的数据行数与解析出的条目数一致（格式错的行不许静默跳过）
     2. 幂等：同一 fixture 注入两次，字节完全相同
     3. 退出码：未注入=1 / 已注入=0 / config 缺失=2 / 配置漂移=1
     4. 零外部资源：注入新增块里没有 src="http、href="http（<a> 导航不算）、@import、url(http
     5. 结构：注入后以 </html> 收尾；<body、</body> 各一次
     6. 深色覆盖实测（无浏览器）：§5「必须换」清单 100% 命中 [data-theme="dark"] 规则

   特点：零第三方依赖、不用浏览器、不联网；只用自己造的 synthetic fixture，
   不依赖任何真实成品页（真实页面在别的仓库里，这里一律不碰）。
   退出码：全绿 0，任一 FAIL 1。
   ============================================================ */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INJECT = path.join(HERE, "inject-shell.mjs");

/* ---------- 找 skill 根（templates/style.css + references/09-site-shell.md） ---------- */
function findSkillRoot() {
  const env = process.env.SKILL_ROOT;
  if (env) {
    const r = path.resolve(env);
    if (fs.existsSync(path.join(r, "references", "09-site-shell.md"))) return r;
  }
  const cands = [];
  let d = path.resolve(HERE, "..");
  for (let i = 0; i < 8; i++) { cands.push(d); const up = path.dirname(d); if (up === d) break; d = up; }
  const home = os.homedir();
  cands.push(path.join(home, ".agents", "skills", "bilingual-annotated-reader"));
  for (const c of cands) {
    if (fs.existsSync(path.join(c, "references", "09-site-shell.md"))) return c;
  }
  return null;
}

const SKILL = findSkillRoot();
const DOC = SKILL ? path.join(SKILL, "references", "09-site-shell.md") : null;
const CSS = SKILL
  ? (fs.existsSync(path.join(SKILL, "templates", "style.css"))
      ? path.join(SKILL, "templates", "style.css")
      : path.join(SKILL, "src", "style.css"))
  : null;

/* ---------- 结果收集 ---------- */
const results = [];
function report(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (detail ? "：" + detail : ""));
}
function sub(line) { console.log("        " + line); }

/* ================= CSS 解析：按规则块取选择器（不靠全文 substring） ================= */
function stripCss(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "*") {
      const j = src.indexOf("*/", i + 2);
      i = j === -1 ? src.length : j + 2;
      out += " ";
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === q) { j++; break; }
        j++;
      }
      out += src.slice(i, j);
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/* 走一遍花括号：栈顶是 at-rule（@media/@supports…）时里面的规则照样记 */
function cssSelectors(css) {
  const src = stripCss(css);
  const out = new Set();
  const stack = [];
  let buf = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "{") {
      const prelude = buf.trim();
      buf = "";
      stack.push(prelude);
      if (!prelude.startsWith("@")) {
        for (const part of prelude.split(",")) {
          const sel = part.trim();
          if (sel) out.add(sel);
        }
      }
    } else if (c === "}") {
      stack.pop();
      buf = "";
    } else {
      buf += c;
    }
  }
  return out;
}

/* ================= 文档 §5 解析 ================= */
/* 表格行：| `选择器` | 写死的浅色 | 为什么必须换 | */
function parseMustChange(md) {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\|\s*选择器\s*\|/.test(l));
  if (start === -1) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim().startsWith("|")) break;
    const m = /^\|\s*`([^`]+)`\s*\|/.exec(l);
    if (m) out.push(m[1].trim());
  }
  return out;
}
/* §5 表格的数据行数（不含表头与 |---| 分隔行）：只认带反引号的行，格式错的行会被静默跳过 */
function countMustRows(md) {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\|\s*选择器\s*\|/.test(l));
  if (start === -1) return 0;
  let n = 0;
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t.startsWith("|")) break;
    if (/^[-:|\s]+$/.test(t) && t.includes("-")) continue; // |---|---| 分隔行
    n++;
  }
  return n;
}
/* 「不用换的」那段：反引号里是 `选择器{写死的值}`，取花括号前那截 */
function parseNoChange(md) {
  const line = md.split(/\r?\n/).find((l) => l.includes("**不用换的**"));
  if (!line) return [];
  const out = [];
  for (const m of line.matchAll(/`([^`]+)`/g)) {
    const code = m[1];
    const sel = code.split("{")[0].trim();
    if (sel && /^[^(){}]*$/.test(sel)) out.push(sel);
  }
  return out;
}

/* ================= synthetic fixture ================= */
const FIXTURE_HTML = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>合成测试页 · check-shell 自检用</title>
<style>
:root{--paper:#fbf8f3;--paper-2:#f5f1ea;--card:#fff;--ink:#2a251f;--ink-2:#4a3a2e;
--ink-3:#7a6a58;--rule:#e6ded1;--rule-2:#d8cdbc;--accent:#b0512b;--accent-2:#8f3f1f;
--accent-soft:rgba(176,81,43,.12);--hl:rgba(176,81,43,.17);--term:#7d6a3c;
--serif:Georgia,serif;--sans:system-ui,sans-serif;--mono:ui-monospace,monospace}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans)}
.typographic-content{max-width:900px;margin:0 auto;padding:32px 28px}
</style>
</head>
<body>
<div id="progress"></div>
<header class="topbar"><div class="topbar-in"><div class="seg"><button class="on">双语</button><button>英文</button></div></div></header>
<div class="colheads"><span>EN</span><span>中文</span></div>
<main class="typographic-content">
  <section class="gist"><p>速览正文：这一段在真实页面里写死了深棕字。</p></section>
  <div class="row"><div class="cell en">This sentence is hard-coded ink in the reader page.</div>
  <div class="cell zh"><span class="s">这一句</span>在真实页面里也一样写死。</div></div>
  <p>正文里的<a class="lnk" href="#x">延伸阅读链接</a>和一个<a class="lnk" href="#y">别的链接</a>。</p>
  <p>术语<span class="term" tabindex="0">term</span>与译注<sup class="tn">1</sup>、笔误<span class="typo">teh</span>。</p>
  <figure class="fig">
    <div class="fig-media"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="占位图"></div>
    <div class="fig-bar"><button class="on">静帧</button><button>动图</button><a class="vbtn" href="#video">视频</a><span class="vtag">MP4</span></div>
    <figcaption>图注里也有写死的浅色边框。</figcaption>
  </figure>
  <figure class="fig has-video">
    <div class="fig-media"><video class="fig-video" playsinline></video></div>
    <div class="fig-bar"><a class="vbtn" href="#video">播放</a></div>
    <figcaption class="cap-video">视频图注里的<a href="#origin">原站链接</a>。</figcaption>
  </figure>
  <div class="cmp"><div class="cmp win"><h3>胜出侧</h3><ol><li>要点</li></ol></div></div>
  <table class="bt">
    <thead><tr><th>列 A</th><th>列 B</th></tr></thead>
    <tbody><tr><td>值 <code>code</code></td><td>另一值</td></tr></tbody>
  </table>
  <div class="card"><h4>悬停卡</h4><div class="body">正文</div><span class="chip must">必读</span><span class="chip bg">背景</span></div>
  <a class="lnk-card" href="#z"><h4>延伸阅读卡</h4><p>说明</p></a>
  <div class="typo-item"><code>teh → the</code></div>
  <div class="toc"><div class="toc-bg"></div><aside class="toc-panel"><a href="#s1">第一节</a><a href="#s2">第二节</a></aside></div>
</main>
<div class="lb"><div class="lb-bar"><button>关闭</button></div><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="灯箱"></div>
</body>
</html>`;

const CONFIG_A = {
  siteUrl: "https://example.com/",
  brand: { text: "example", href: "/" },
  nav: [
    { text: "首页", href: "/" },
    { text: "双语书架", href: "/readers/", current: true },
    { text: "技术手记", href: "/notes/" },
  ],
  accent: "#b0512b",
  dark: { bg: "#15130f", fg: "#efe9dd" },
};
/* 只改一个导航项 → 指纹必须变 */
const CONFIG_B = JSON.parse(JSON.stringify(CONFIG_A));
CONFIG_B.nav[1].text = "双语书库";

/* ================= 跑 inject-shell ================= */
function runInject(args) {
  const r = spawnSync(process.execPath, [INJECT, ...args], { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

/* ================= 主流程 ================= */
let tmp = null;
let exitCode = 0;
try {
  if (!SKILL || !DOC || !CSS || !fs.existsSync(DOC) || !fs.existsSync(CSS)) {
    console.log("FAIL  自检前提（找不到 skill 的 references/09-site-shell.md 或 templates/style.css）");
    console.log("        找过：" + (SKILL || "(没找到 skill 根)"));
    console.log("        set SKILL_ROOT=<skill 目录> 或在 skill 目录里跑本脚本");
    process.exit(1);
  }

  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "check-shell-"));
  const page = path.join(tmp, "page.html");
  const cfgA = path.join(tmp, "site-a.json");
  const cfgB = path.join(tmp, "site-b.json");
  fs.writeFileSync(page, FIXTURE_HTML, "utf8");
  fs.writeFileSync(cfgA, JSON.stringify(CONFIG_A, null, 2), "utf8");
  fs.writeFileSync(cfgB, JSON.stringify(CONFIG_B, null, 2), "utf8");

  const md = fs.readFileSync(DOC, "utf8");
  const must = parseMustChange(md);
  const nochange = parseNoChange(md);
  const cssSel = cssSelectors(fs.readFileSync(CSS, "utf8"));

  /* ---- 先注入一份，后面几项都基于它 ---- */
  const inj = runInject([page, "--config", cfgA]);
  if (inj.status !== 0) {
    console.log("FAIL  注入 fixture 失败（inject-shell 退出码 " + inj.status + "）");
    if (inj.stderr.trim()) console.log("        " + inj.stderr.trim().split("\n").join("\n        "));
    process.exit(1);
  }
  const injected = fs.readFileSync(page, "utf8");

  /* ---- 抽出注入块的 CSS ---- */
  function blockOf(html, key) {
    const b = "<!-- shell:" + key + ":begin -->";
    const e = "<!-- shell:" + key + ":end -->";
    const i = html.indexOf(b), j = html.indexOf(e);
    if (i === -1 || j === -1 || j < i) return null;
    return html.slice(i + b.length, j);
  }
  const darkBlock = blockOf(injected, "dark") || "";
  const darkSel = cssSelectors(darkBlock);
  /* [data-theme="dark"] 前缀去掉后剩下的选择器 */
  const darkPlain = new Set();
  for (const s of darkSel) {
    if (!s.startsWith('[data-theme="dark"]')) continue;
    const rest = s.slice('[data-theme="dark"]'.length).trim();
    if (rest) darkPlain.add(rest);
  }

  /* ================= 1. 文档 ↔ 代码对齐 ================= */
  {
    const missCss = must.filter((s) => !cssSel.has(s));
    const missDark = must.filter((s) => !darkPlain.has(s));
    const missNc = nochange.filter((s) => !cssSel.has(s));
    const total = countMustRows(md);
    const gap = total !== must.length;
    const ok = must.length > 0 && !gap && !missCss.length && !missDark.length && !missNc.length;
    report("文档 ↔ 代码对齐", ok,
      gap
        ? "§5 表格有 " + total + " 行数据，只解析出 " + must.length + " 条（检查表格格式：选择器要用反引号包住）"
        : "§5 必须换 " + must.length + " 条 / 不用换 " + nochange.length + " 条");
    if (missCss.length) sub("style.css 里找不到：" + missCss.join("、"));
    if (missDark.length) sub("[data-theme=\"dark\"] 里没覆盖：" + missDark.join("、"));
    if (missNc.length) sub("「不用换」的选择器在 style.css 里找不到：" + missNc.join("、"));
    if (ok) {
      sub("style.css 命中 " + (must.length - missCss.length) + "/" + must.length +
          "，深色规则命中 " + (must.length - missDark.length) + "/" + must.length +
          "，「不用换」" + nochange.length + " 条全部在 style.css 里");
    }
  }

  /* ================= 2. 幂等 ================= */
  {
    const after1 = fs.readFileSync(page);
    const inj2 = runInject([page, "--config", cfgA]);
    const after2 = fs.readFileSync(page);
    const ok = inj2.status === 0 && Buffer.compare(after1, after2) === 0;
    report("幂等（同一 fixture 注入两次字节相同）", ok,
      ok ? after1.length + " 字节，两次一致" : "第二次注入后字节变了");
  }

  /* ================= 3. 退出码 ================= */
  {
    const fresh = path.join(tmp, "fresh.html");
    fs.writeFileSync(fresh, FIXTURE_HTML, "utf8");
    const notInjected = runInject([fresh, "--config", cfgA, "--check"]);
    const injectedOk = runInject([page, "--config", cfgA, "--check"]);
    const noCfg = runInject([page, "--config", path.join(tmp, "nope.json"), "--check"]);
    const drift = runInject([page, "--config", cfgB, "--check"]);

    const ok =
      notInjected.status === 1 &&
      injectedOk.status === 0 &&
      noCfg.status === 2 &&
      drift.status === 1 &&
      /配置已变/.test(drift.stdout) &&
      /旧 .+ \/ 新 .+/.test(drift.stdout);
    report("退出码（未注入=1 / 已注入=0 / config 缺失=2 / 配置漂移=1）", ok,
      "实测 " + notInjected.status + " / " + injectedOk.status + " / " + noCfg.status + " / " + drift.status);
    sub("未注入 → " + notInjected.status + "：" + (notInjected.stdout.trim().split("\n")[0] || ""));
    sub("已注入 → " + injectedOk.status + "：" + (injectedOk.stdout.trim().split("\n")[0] || ""));
    sub("config 缺失 → " + noCfg.status + "：" + ((noCfg.stderr || noCfg.stdout).trim().split("\n")[0] || ""));
    sub("配置漂移 → " + drift.status + "：" + (drift.stdout.trim().split("\n")[0] || ""));
  }

  /* ================= 4. 零外部资源 ================= */
  {
    const blocks = ["theme-boot", "style", "dark", "nav", "script"]
      .map((k) => blockOf(injected, k) || "")
      .join("\n");
    /* <a> 的 href 是导航链接，不算外部资源 */
    const noAnchors = blocks.replace(/<a\b[^>]*>/gi, (m) => m.replace(/\bhref\s*=\s*"[^"]*"/gi, 'href=""'));
    const hits = [];
    if (/src\s*=\s*"https?:/i.test(blocks)) hits.push("src=\"http");
    if (/href\s*=\s*"https?:/i.test(noAnchors)) hits.push("href=\"http（非 <a>）");
    if (/@import/i.test(blocks)) hits.push("@import");
    if (/url\(\s*['"]?https?:/i.test(blocks)) hits.push("url(http");
    report("零外部资源（注入新增块不引 http 资源）", hits.length === 0,
      hits.length ? "发现 " + hits.join("、") : "无 src/href/@import/url 外链");
  }

  /* ================= 5. 结构 ================= */
  {
    const bodyOpen = (injected.match(/<body\b/gi) || []).length;
    const bodyClose = (injected.match(/<\/body\s*>/gi) || []).length;
    const endsHtml = /<\/html>\s*$/.test(injected);
    const ok = bodyOpen === 1 && bodyClose === 1 && endsHtml;
    report("结构（</html> 收尾，<body 与 </body> 各一次）", ok,
      "<body×" + bodyOpen + " </body>×" + bodyClose + " 收尾 " + (endsHtml ? "是" : "否"));
  }

  /* ================= 6. 深色覆盖实测 ================= */
  {
    const hit = must.filter((s) => darkPlain.has(s));
    const miss = must.filter((s) => !darkPlain.has(s));
    const rate = hit.length + "/" + must.length;
    const ok = must.length > 0 && miss.length === 0;
    report("深色覆盖实测（无浏览器）", ok, "命中率 " + rate);
    sub("[data-theme=\"dark\"] 规则共 " + darkPlain.size + " 条选择器");
    if (miss.length) sub("没覆盖：" + miss.join("、"));
  }
} finally {
  if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* 临时目录删不掉就算了 */ } }
}

const failed = results.filter((r) => !r.ok);
console.log("");
console.log(failed.length ? "FAILED " + failed.length + "/" + results.length : "ALL PASS " + results.length + "/" + results.length);
exitCode = failed.length ? 1 : 0;
process.exit(exitCode);
