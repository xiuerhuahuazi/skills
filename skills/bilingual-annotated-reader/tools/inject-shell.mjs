#!/usr/bin/env node
/* ============================================================
   inject-shell.mjs — 给精读成品页注入「站点外壳 + 深色主题」

   用法：
     node tools/inject-shell.mjs <page.html> --config <cfg.json>            # 注入（默认就地写回）
     node tools/inject-shell.mjs <page.html> --config <cfg.json> --check    # 只检测状态，不写盘（0=已注入且配置一致，1=未注入或配置已变，2=出错）
     node tools/inject-shell.mjs <page.html> --config <cfg.json> --dry-run  # 只打印变动摘要，不写盘

   退出码：0 正常 / 1 --check 发现尚未注入、或已注入但配置已变 / 2 参数或环境错误（config 不存在、页面不像 HTML、标记半残等）

   为什么要有这个工具：成品页是"单个离线 HTML"，自成一体；
   把它嵌进自己的站（导航条 + 品牌 + 深色主题）时，不要重写页面，而是**注入式外壳**：
   往 <head> 里塞引导脚本与样式，往 <body> 前后塞导航条与切换脚本。
   每一块都带成对的 begin/end 标记，重复跑只替换、不叠加 —— 同一份配置跑两次，字节完全相同。

   不做的事：不碰精读页自己的布局与文案；注入内容里不引任何 http(s) 资源（图标一律内联 SVG）；
   不改 templates/ 下的任何文件。
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const argv = process.argv.slice(2);
const has = (k) => argv.includes(k);
const val = (k, d) => { const i = argv.indexOf(k); return i > -1 ? argv[i + 1] : d; };

/* ---------- 5 个注入点：key 决定标记名，id 决定元素上的 id ---------- */
const BLOCKS = [
  { key: "theme-boot", id: "shell-theme-boot", at: "head-tail", label: "主题引导脚本" },
  { key: "style", id: "shell-style", at: "head-tail", label: "外壳样式（导航 + 布局偏移 + 跨页过渡）" },
  { key: "dark", id: "shell-dark", at: "head-tail", label: "深色覆盖（换变量 + 换写死的浅色）" },
  { key: "nav", id: "shell-nav", at: "body-head", label: "站点导航条" },
  { key: "script", id: "shell-script", at: "body-tail", label: "主题切换脚本" },
];

/* ================= 颜色工具（无第三方依赖） ================= */
function hexToRgb(hex) {
  let h = String(hex).trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex(rgb) {
  return "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  if (!A || !B) return a;
  return rgbToHex([0, 1, 2].map((i) => A[i] + (B[i] - A[i]) * t));
}
function rgba(hex, a) {
  const c = hexToRgb(hex);
  if (!c) return hex;
  return "rgba(" + c.join(",") + "," + a + ")";
}
function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function luminance(hex) { const c = hexToRgb(hex); if (!c) return 0; return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); }
function contrast(a, b) {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
/* 深色底上如果 accent 太暗就往前景色方向提，直到对比度达标；本来就亮的不动 */
function ensureContrast(color, bg, toward, target) {
  let out = mix(color, toward, 1);
  for (let t = 0; t <= 1.0001; t += 0.02) {
    out = mix(color, toward, t);
    if (contrast(out, bg) >= target) return out;
  }
  return out;
}

/* ================= 配置 ================= */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function resolveHref(href, siteUrl) {
  const h = String(href == null ? "" : href).trim();
  if (!h) return siteUrl;
  if (/^(https?:|mailto:|tel:|#)/i.test(h)) return h;
  const base = String(siteUrl).replace(/\/+$/, "");
  return h.startsWith("/") ? base + h : base + "/" + h;
}
function readConfig(file) {
  if (!fs.existsSync(file)) throw new Error("找不到配置文件：" + file);
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { throw new Error("配置文件不是合法 JSON：" + file + "（" + e.message + "）"); }
  const need = (v, msg) => { if (!v) throw new Error("配置缺少字段：" + msg); };

  need(cfg.siteUrl, "siteUrl（站点 URL）");
  need(cfg.brand && cfg.brand.text, "brand.text（品牌文字）");
  need(cfg.accent, "accent（强调色）");
  need(cfg.dark && cfg.dark.bg, "dark.bg（深色底色）");
  need(cfg.dark && cfg.dark.fg, "dark.fg（深色字色）");
  if (!hexToRgb(cfg.accent)) throw new Error("accent 不是合法十六进制色：" + cfg.accent);
  if (!hexToRgb(cfg.dark.bg)) throw new Error("dark.bg 不是合法十六进制色：" + cfg.dark.bg);
  if (!hexToRgb(cfg.dark.fg)) throw new Error("dark.fg 不是合法十六进制色：" + cfg.dark.fg);

  cfg.siteUrl = String(cfg.siteUrl).trim();
  cfg.brand = { text: String(cfg.brand.text).trim(), href: resolveHref(cfg.brand.href, cfg.siteUrl) };
  cfg.nav = (Array.isArray(cfg.nav) ? cfg.nav : []).map((it, i) => {
    if (!it || !it.text) throw new Error("nav[" + i + "] 缺少 text");
    return { text: String(it.text).trim(), href: resolveHref(it.href, cfg.siteUrl), current: !!it.current };
  });
  return cfg;
}

/* ================= 配置指纹 =================
   目的：让 --check 能认出「外壳还在，但配置已经改过」——只查标记在不在会漏掉这种漂移。
   指纹只由**规范化后**的配置算出（字段顺序、空白、URL 拼法差异不影响），改一个导航项就会变。 */
function configFingerprint(cfg) {
  const canon = {
    siteUrl: cfg.siteUrl,
    brand: { text: cfg.brand.text, href: cfg.brand.href },
    nav: cfg.nav.map((n) => ({ text: n.text, href: n.href, current: n.current })),
    accent: String(cfg.accent).trim().toLowerCase(),
    dark: { bg: String(cfg.dark.bg).trim().toLowerCase(), fg: String(cfg.dark.fg).trim().toLowerCase() },
  };
  return crypto.createHash("sha1").update(JSON.stringify(canon), "utf8").digest("hex").slice(0, 8);
}

/* ================= 调色板 ================= */
function palettes(cfg) {
  const accent0 = cfg.accent;
  const paper = cfg.dark.bg, ink = cfg.dark.fg;
  const accent = ensureContrast(accent0, paper, ink, 4.5);
  const accent2 = ensureContrast(mix(accent0, ink, 0.28), paper, ink, 4.5);
  return {
    light: {
      accent: accent0,
      accent2: mix(accent0, "#000000", 0.22),
      accentSoft: rgba(accent0, 0.14),
      hl: rgba(accent0, 0.17),
    },
    dark: {
      paper,
      paper2: mix(paper, ink, 0.045),
      card: mix(paper, ink, 0.07),
      ink,
      ink2: mix(paper, ink, 0.72),
      ink3: mix(paper, ink, 0.50),
      rule: mix(paper, ink, 0.14),
      rule2: mix(paper, ink, 0.22),
      accent,
      accent2,
      accentSoft: mix(paper, accent, 0.18),
      hl: rgba(accent, 0.18),
      term: mix(ink, accent, 0.35),
    },
  };
}

/* ================= 5 块内容 ================= */
function bootBlock(cfg, fp) {
  return `<!-- shell:config:${fp} -->
<script id="shell-theme-boot">
(function () {
  var root = document.documentElement;
  var dark = false;
  try { dark = localStorage.getItem('site-theme') === 'dark'; } catch (e) {}
  /* 首帧之前就把 data-theme 落到根元素上，避免先闪一帧浅色 */
  if (dark) root.setAttribute('data-theme', 'dark');
  /* 深色下同步 meta theme-color（移动端地址栏跟着页面底色） */
  try {
    var meta = document.querySelector('meta[name="theme-color"]');
    var paper = dark ? ${JSON.stringify(cfg.dark.bg)} : "";
    if (!paper) { try { paper = getComputedStyle(root).getPropertyValue('--paper').trim(); } catch (e) {} }
    if (meta) { if (paper) meta.setAttribute('content', paper); }
    else if (paper) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      meta.setAttribute('content', paper);
      document.head.appendChild(meta);
    }
  } catch (e) {}
})();
</script>`;
}

function styleBlock(cfg, P) {
  return `<style id="shell-style">
/* ---------- 站点外壳：导航条 ---------- */
/* 用 html 而不是 :root：类型选择器特异性更低，页面自己写 :root{--shell-h:…} 就能覆盖 */
html{--shell-accent:${cfg.accent}}
.shell-nav{
  position:sticky;top:0;z-index:85;height:var(--shell-h,52px);
  background-color:var(--paper);
  background-color:color-mix(in srgb,var(--paper) 92%,transparent);
  border-bottom:1px solid var(--rule);
  -webkit-backdrop-filter:blur(14px) saturate(1.1);backdrop-filter:blur(14px) saturate(1.1);
}
.shell-nav-in{max-width:var(--reader,1420px);margin:0 auto;height:100%;padding:0 28px;
  display:flex;align-items:center;gap:clamp(16px,3vw,34px)}
.shell-brand{display:inline-flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink);flex:none}
.shell-mark{display:inline-grid;place-items:center;width:24px;height:24px;border:1px solid var(--shell-accent);
  border-radius:7px;color:var(--shell-accent);font:italic 400 15px/1 var(--serif,serif);flex:none}
.shell-word{font-size:12.5px;font-weight:600;letter-spacing:.14em;text-transform:lowercase}
.shell-links{display:flex;align-items:center;gap:clamp(16px,2.4vw,28px);font-size:14.5px}
.shell-links a{position:relative;color:var(--ink-2);text-decoration:none;padding:4px 0;transition:color .2s}
.shell-links a::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;
  background:var(--shell-accent);transform:scaleX(0);transform-origin:left;
  transition:transform .28s cubic-bezier(.22,.61,.36,1)}
.shell-links a:hover{color:var(--ink)}
.shell-links a:hover::after,.shell-links a[aria-current="page"]::after{transform:scaleX(1)}
.shell-links a[aria-current="page"]{color:var(--ink)}
.shell-theme{margin-left:auto;display:inline-grid;place-items:center;width:32px;height:32px;
  border:1px solid var(--rule-2);border-radius:50%;background:transparent;color:var(--ink-2);
  cursor:pointer;transition:color .2s,border-color .2s,transform .3s}
.shell-theme:hover{color:var(--shell-accent);border-color:var(--shell-accent);transform:rotate(12deg)}
.shell-theme svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round}
.shell-theme .i-moon{display:none}
[data-theme="dark"] .shell-theme .i-moon{display:block}
[data-theme="dark"] .shell-theme .i-sun{display:none}

/* ---------- 布局偏移：只把精读页的吸顶件让开，不改它自己的排版 ---------- */
.topbar{top:var(--shell-h,52px)}
.colheads{top:calc(var(--shell-h,52px) + var(--bar,46px))}
/* 锚点落点要把两条吸顶栏都算进去，否则标题被压在栏下面 */
html{scroll-padding-top:calc(var(--shell-h,52px) + var(--bar,46px) + 12px)}

/* ---------- 换肤的过渡：主题切换是同步改属性，靠 CSS 过渡做平滑 ---------- */
body,.topbar,.shell-nav{transition:background-color .25s ease,color .25s ease,border-color .25s ease}
.cell.en,.cell.zh,.gist p{transition:color .25s ease}
@media (prefers-reduced-motion:reduce){
  body,.topbar,.shell-nav,.cell.en,.cell.zh,.gist p{transition:none}
}

@media (max-width:900px){.shell-links{display:none}}
@media (max-width:640px){html{--shell-h:48px}}
@media (max-width:359px){.shell-word{display:none}}

/* ---------- 跨文档过渡（Chrome 126+ 生效，其余浏览器照常跳转） ---------- */
@view-transition{navigation:auto}
/* 默认的 plus-lighter 混色会让新旧两帧叠成"重影"，强制改成普通混色 */
::view-transition-old(root),::view-transition-new(root){mix-blend-mode:normal}
@keyframes shell-vt-out{to{opacity:0}}
@keyframes shell-vt-in{from{opacity:0}}
@media (prefers-reduced-motion:no-preference){
  ::view-transition-old(root){animation:shell-vt-out .14s ease both}
  ::view-transition-new(root){animation:shell-vt-in .22s ease .08s both}
}
@media (prefers-reduced-motion:reduce){
  ::view-transition-old(root),::view-transition-new(root){animation:none!important}
}

/* ---------- 打印：去掉外壳，强制浅色 ---------- */
@media print{
  .shell-nav{display:none!important}
  html{scroll-padding-top:0}
  [data-theme="dark"]{
    --paper:#fff;--paper-2:#f5f5f5;--card:#fff;
    --ink:#000;--ink-2:#333;--ink-3:#555;
    --rule:#ddd;--rule-2:#ccc;
    --accent:${P.light.accent};--accent-2:${P.light.accent2};--accent-soft:${P.light.accentSoft};
    --hl:${P.light.hl};--term:#6b5a2e;
    color-scheme:light;
  }
  [data-theme="dark"] ::selection{background:transparent}
  [data-theme="dark"] .chip.must{background:#fbe4d6;color:${P.light.accent2};border-color:#eccdb8}
  [data-theme="dark"] .chip.bg{background:#eaf0e2;color:#4b5c2f;border-color:#d8e0c8}
}
</style>`;
}

function darkBlock(cfg, P) {
  const D = P.dark;
  return `<style id="shell-dark">
/* ---------- 深色主题第一步：把精读页自己的配色变量换成深色 ---------- */
[data-theme="dark"]{
  --paper:${D.paper};--paper-2:${D.paper2};--card:${D.card};
  --ink:${D.ink};--ink-2:${D.ink2};--ink-3:${D.ink3};
  --rule:${D.rule};--rule-2:${D.rule2};
  --accent:${D.accent};--accent-2:${D.accent2};--accent-soft:${D.accentSoft};
  --hl:${D.hl};--term:${D.term};
  color-scheme:dark;
}

/* ---------- 深色主题第二步：把页面里写死的浅色逐个换掉 ---------- */
[data-theme="dark"] ::selection{background:${rgba(D.accent, 0.24)}}
[data-theme="dark"] #progress{background:linear-gradient(90deg,var(--accent),var(--accent-2))}
[data-theme="dark"] .topbar{background:${rgba(D.paper, 0.9)}}
[data-theme="dark"] .gist p{color:var(--ink-2)}
[data-theme="dark"] .cell.en,[data-theme="dark"] .cell.zh{color:var(--ink)}
[data-theme="dark"] .cmp.win{background:${mix(D.paper, D.accent, 0.1)};border-color:${mix(D.paper, D.accent, 0.32)}}
[data-theme="dark"] .fig-media{background:var(--paper-2)}
[data-theme="dark"] .s.pin{background:${rgba(D.accent, 0.16)};box-shadow:inset 2px 0 0 ${rgba(D.accent, 0.6)}}
[data-theme="dark"] a.lnk{border-bottom-color:${rgba(D.accent, 0.5)}}
[data-theme="dark"] a.lnk:hover{background:${rgba(D.accent, 0.12)}}
[data-theme="dark"] .term:hover{background:${rgba(D.term, 0.16)}}
[data-theme="dark"] sup.tn{border-color:${rgba(D.accent, 0.4)}}
[data-theme="dark"] sup.tn:hover{color:var(--paper)}
[data-theme="dark"] .typo{border-bottom-color:#e57373}
[data-theme="dark"] .typo:hover{background:${rgba("#e57373", 0.14)}}
[data-theme="dark"] figcaption{border-left-color:${rgba(D.accent, 0.42)}}
[data-theme="dark"] .card{box-shadow:0 18px 44px -12px rgba(0,0,0,.6),0 3px 10px rgba(0,0,0,.4)}
[data-theme="dark"] .chip.must{background:${rgba(D.accent, 0.18)};color:var(--accent-2);border-color:${rgba(D.accent, 0.4)}}
[data-theme="dark"] .chip.bg{background:#232a1c;color:#b7c98f;border-color:#37402c}
[data-theme="dark"] .lnk-card:hover{border-color:${rgba(D.accent, 0.35)};box-shadow:0 10px 26px -14px rgba(0,0,0,.5)}
[data-theme="dark"] table.bt tbody tr:hover td{background:${mix(D.paper, D.ink, 0.05)}}
[data-theme="dark"] table.bt code{color:var(--accent-2)}
[data-theme="dark"] .typo-item code{color:var(--accent-2)}
[data-theme="dark"] .cap-video a{border-bottom-color:${rgba(D.accent, 0.4)}}
[data-theme="dark"] .fig-bar button{background:${rgba(D.paper, 0.9)}}
[data-theme="dark"] .fig-bar button.on{background:var(--ink);color:var(--paper);border-color:var(--ink)}
[data-theme="dark"] .fig-bar .vbtn{border-color:${rgba(D.accent, 0.4)};background:${rgba(D.paper, 0.92)}}
[data-theme="dark"] .toc-bg{background:rgba(0,0,0,.55)}
[data-theme="dark"] .toc-panel{box-shadow:-20px 0 50px rgba(0,0,0,.55)}
[data-theme="dark"] .toc-panel a{border-bottom-color:rgba(255,255,255,.08)}
[data-theme="dark"] .seg button:hover{background:rgba(255,255,255,.06)}
[data-theme="dark"] .seg button.on{background:var(--ink);color:var(--paper)}
</style>`;
}

function navBlock(cfg) {
  const mark = (cfg.brand.text[0] || "·").toLowerCase();
  const links = cfg.nav.map((it) =>
    '<a href="' + esc(it.href) + '"' + (it.current ? ' aria-current="page"' : "") + ">" + esc(it.text) + "</a>"
  ).join("\n      ");
  return `<header class="shell-nav" id="shell-nav">
  <div class="shell-nav-in">
    <a class="shell-brand" href="${esc(cfg.brand.href)}" aria-label="回到首页">
      <span class="shell-mark" aria-hidden="true">${esc(mark)}</span>
      <span class="shell-word">${esc(cfg.brand.text)}</span>
    </a>
    <nav class="shell-links" aria-label="主导航">
      ${links}
    </nav>
    <button class="shell-theme" type="button" data-shell-theme-toggle aria-label="切换深色模式" aria-pressed="false">
      <svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/></svg>
      <svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.3A8.6 8.6 0 1 1 9.7 3.5a7 7 0 0 0 10.8 10.8z"/></svg>
    </button>
  </div>
</header>`;
}

function scriptBlock(cfg) {
  return `<script id="shell-script">
(function () {
  'use strict';
  var root = document.documentElement;
  var KEY = 'site-theme';
  var btn = document.querySelector('[data-shell-theme-toggle]');
  function isDark() { return root.getAttribute('data-theme') === 'dark'; }
  function syncMeta() {
    try {
      var meta = document.querySelector('meta[name="theme-color"]');
      var paper = "";
      try { paper = getComputedStyle(root).getPropertyValue('--paper').trim(); } catch (e) {}
      if (!paper) return;
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', paper);
    } catch (e) {}
  }
  function sync() {
    if (!btn) return;
    btn.setAttribute('aria-pressed', isDark() ? 'true' : 'false');
    btn.setAttribute('aria-label', isDark() ? '切换到浅色模式' : '切换到深色模式');
  }
  function apply(dark) {
    if (dark) { root.setAttribute('data-theme', 'dark'); } else { root.removeAttribute('data-theme'); }
  }
  function commit(dark) {
    try { localStorage.setItem(KEY, dark ? 'dark' : 'light'); } catch (e) {}
    sync();
    syncMeta();
  }
  if (!btn) return;
  sync();
  syncMeta();
  btn.addEventListener('click', function () {
    var dark = !isDark();
    /* 同步改状态：不把变更放进 startViewTransition 的回调里——回调在后续渲染步骤才跑，
       任何同步快照（--dump-dom / 立刻截图）只能读到旧状态（见 references/05-pitfalls.md #31）；
       平滑感交给 CSS 过渡（见 shell-style 里的 transition）。 */
    apply(dark);
    commit(dark);
  });
})();
</script>`;
}

/* ================= 注入 ================= */
function beginMark(key) { return "<!-- shell:" + key + ":begin -->"; }
function endMark(key) { return "<!-- shell:" + key + ":end -->"; }

function findHeadEnd(html) {
  const m = /<\/head\s*>/i.exec(html);
  if (!m) throw new Error("页面里找不到 </head>，不是标准 HTML");
  return m.index;
}
function findBodyOpen(html) {
  const m = /<body\b[^>]*>/i.exec(html);
  if (!m) throw new Error("页面里找不到 <body>，无法插入导航条");
  return { index: m.index, end: m.index + m[0].length };
}
function findBodyEnd(html) {
  const m = /<\/body\s*>/i.exec(html);
  if (!m) throw new Error("页面里找不到 </body>，无法插入主题切换脚本");
  return m.index;
}

/* 一块内容：有成对标记就整块替换，没有就按锚点插入；只有半个标记视为页面损坏 */
function upsert(html, key, content, at) {
  const b = beginMark(key), e = endMark(key);
  const i = html.indexOf(b), j = html.indexOf(e);
  if (i > -1 && j > -1 && j > i) {
    return { html: html.slice(0, i) + b + "\n" + content + "\n" + e + html.slice(j + e.length), action: "替换" };
  }
  if (i > -1 || j > -1) {
    throw new Error("页面里的 shell:" + key + " 标记不成对（begin/end 缺一个），请检查文件后再注入");
  }
  const block = b + "\n" + content + "\n" + e;
  if (at === "head-tail") {
    const k = findHeadEnd(html);
    return { html: html.slice(0, k) + block + "\n" + html.slice(k), action: "插入" };
  }
  if (at === "body-head") {
    const o = findBodyOpen(html);
    return { html: html.slice(0, o.end) + "\n" + block + "\n" + html.slice(o.end), action: "插入" };
  }
  const k = findBodyEnd(html);
  return { html: html.slice(0, k) + block + "\n" + html.slice(k), action: "插入" };
}

function injectAll(html, cfg, P, fp) {
  const out = { html, actions: [] };
  /* head 里的三块：按 dark → style → boot 的顺序插，boot 最后跑，能读到已解析的 --paper */
  const plan = [
    { key: "dark", content: darkBlock(cfg, P), at: "head-tail" },
    { key: "style", content: styleBlock(cfg, P), at: "head-tail" },
    { key: "theme-boot", content: bootBlock(cfg, fp), at: "head-tail" },
    { key: "nav", content: navBlock(cfg), at: "body-head" },
    { key: "script", content: scriptBlock(cfg), at: "body-tail" },
  ];
  for (const step of plan) {
    const r = upsert(out.html, step.key, step.content, step.at);
    out.html = r.html;
    const meta = BLOCKS.find((x) => x.key === step.key);
    out.actions.push({ label: meta.label, id: meta.id, key: step.key, action: r.action, at: step.at });
  }
  return out;
}

/* 三态：整块在（ok）/ 只有一个标记（half，页面被改坏了）/ 整块都没有（missing，没注入过） */
function injectedState(html) {
  return BLOCKS.map((b) => {
    const hasB = html.includes(beginMark(b.key));
    const hasE = html.includes(endMark(b.key));
    return { key: b.key, id: b.id, ok: hasB && hasE, half: hasB !== hasE, missing: !hasB && !hasE };
  });
}

/* 指纹写在第 1 块（theme-boot）的标记区里，随整块替换 */
const FP_RE = /<!--\s*shell:config:([0-9a-f]{8})\s*-->/;
function readFingerprint(html) {
  const m = FP_RE.exec(html);
  return m ? m[1] : null;
}

/* ================= 主流程 ================= */
const pageArg = argv.find((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1] === "--config"));
const configArg = val("--config", null);

if (!pageArg) {
  console.error("用法：node tools/inject-shell.mjs <page.html> --config <cfg.json> [--check] [--dry-run]");
  process.exit(2);
}
if (!configArg) {
  console.error("缺少 --config <cfg.json>（模板见 templates/shell.config.example.json）");
  process.exit(2);
}

const pageFile = path.resolve(pageArg);
const configFile = path.resolve(configArg);

let cfg;
try { cfg = readConfig(configFile); }
catch (e) { console.error("[inject-shell] " + e.message); process.exit(2); }

if (!fs.existsSync(pageFile)) {
  console.error("[inject-shell] 找不到页面文件：" + pageFile);
  process.exit(2);
}
const html = fs.readFileSync(pageFile, "utf8");
if (!/<html\b/i.test(html)) {
  console.error("[inject-shell] 这不像一个 HTML 页面（没有 <html>）：" + pageFile);
  process.exit(2);
}

if (has("--check")) {
  const state = injectedState(html);
  const half = state.filter((s) => s.half);
  const missing = state.filter((s) => s.missing);
  const present = state.filter((s) => s.ok);

  /* 标记半残 → 页面被改坏了：不要猜，报错退出 2 */
  if (half.length) {
    console.error("[inject-shell] 标记不成对（页面可能被改坏），请人工检查后再注入：" + pageFile);
    half.forEach((s) => console.error("  · " + s.key + "（" + s.id + "）：只有 begin 或只有 end"));
    process.exit(2);
  }
  /* 一块都没有 → 未注入 */
  if (!present.length) {
    console.log("[inject-shell] 未注入外壳：" + pageFile);
    missing.forEach((s) => console.log("  · 缺 " + s.key + "（" + s.id + "）"));
    process.exit(1);
  }
  /* 缺了整块 → 半注入，也是坏状态：退出 2 */
  if (missing.length) {
    console.error("[inject-shell] 标记不完整（缺 " + missing.length + " 块），请人工检查后再注入：" + pageFile);
    missing.forEach((s) => console.error("  · 缺 " + s.key + "（" + s.id + "）"));
    process.exit(2);
  }
  /* 已注入：比对配置指纹——外壳还在但配置改过，也算「没生效」 */
  const cur = configFingerprint(cfg);
  const old = readFingerprint(html);
  if (old !== cur) {
    console.log("[inject-shell] 配置已变，需重跑注入（旧 " + (old || "无") + " / 新 " + cur + "）：" + pageFile);
    process.exit(1);
  }
  console.log("[inject-shell] 已注入外壳：" + pageFile);
  state.forEach((s) => console.log("  · " + s.key + "（" + s.id + "）"));
  console.log("  配置指纹 " + cur + "（与当前 config 一致）");
  process.exit(0);
}

const P = palettes(cfg);
const fp = configFingerprint(cfg);
let res;
try { res = injectAll(html, cfg, P, fp); }
catch (e) { console.error("[inject-shell] " + e.message); process.exit(2); }

const before = Buffer.byteLength(html, "utf8");
const after = Buffer.byteLength(res.html, "utf8");
const dry = has("--dry-run");

console.log((dry ? "[inject-shell] dry-run（不写盘）：" : "[inject-shell] 已注入外壳：") + pageFile);
res.actions.forEach((a) => console.log("  · " + a.action + " " + a.label + "（" + a.id + "）"));
console.log("  字节 " + before + " → " + after + "（" + (after >= before ? "+" : "") + (after - before) + "）");
console.log("  配置指纹 " + fp + "（--check 拿它比对配置是否已变）");

if (!dry && res.html !== html) fs.writeFileSync(pageFile, res.html, "utf8");
if (dry) console.log("  （--dry-run：文件未改动）");
process.exit(0);
