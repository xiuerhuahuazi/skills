/* ============================================================
   构建：data/*.json + assets/* + src/* → index.html（单文件）
   运行：node build.mjs
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = process.argv[2] && process.argv[2].endsWith(".html") ? process.argv[2] : "index.html";
const D = (p) => path.join(ROOT, p);
const read = (p) => fs.readFileSync(D(p), "utf8");
const readJSON = (p) => JSON.parse(read(p));

const meta = readJSON("data/meta.json");
const links = readJSON("data/links.json");
const glossary = readJSON("data/glossary.json");
const figures = readJSON("data/figures.json");
const parts = fs
  .readdirSync(D("data"))
  .filter((f) => /^part-\d+\.json$/.test(f))
  .sort()
  .map((f) => readJSON("data/" + f));

const figById = Object.fromEntries((figures.figures || []).map((f) => [f.id, f]));
const linkById = Object.fromEntries((links.links || []).map((l) => [l.id, l]));

/* ---------------- 术语：按全文顺序，每个术语只标注首次出现 ---------------- */
/* 项目相关的正则与图片映射放在 data/config.json，模板本身不含任何具体项目内容 */
const CONFIG = (() => { try { return readJSON("data/config.json"); } catch (e) { return {}; } })();
const TERM_PATTERNS = {};
for (const t of CONFIG.termPatterns || []) {
  TERM_PATTERNS[t.key] = [new RegExp(t.en, t.enFlags || ""), new RegExp(t.zh)];
}
const glossKeys = new Set((glossary.terms || []).map((t) => t.key));

const TAG = /(<[^>]+>)/;
function wrapFirst(html, re, key) {
  const parts = html.split(TAG);
  let spanDepth = 0, aDepth = 0, done = false;
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i];
    if (i % 2 === 1) {
      if (/^<a\b/i.test(t)) aDepth++;
      else if (/^<\/a>/i.test(t)) aDepth = Math.max(0, aDepth - 1);
      else if (/^<span\b/i.test(t)) spanDepth++;
      else if (/^<\/span>/i.test(t)) spanDepth = Math.max(0, spanDepth - 1);
      else if (/^<sup\b/i.test(t)) spanDepth++;
      else if (/^<\/sup>/i.test(t)) spanDepth = Math.max(0, spanDepth - 1);
      continue;
    }
    if (done || aDepth || spanDepth) continue;
    const m = re.exec(t);
    if (!m) continue;
    parts[i] =
      t.slice(0, m.index) +
      "<span class='term' data-term='" + key + "'>" + m[0] + "</span>" +
      t.slice(m.index + m[0].length);
    done = true;
  }
  return done ? parts.join("") : null;
}

const allPairs = [];
parts.forEach((sec) =>
  (sec.blocks || []).forEach((b) => {
    if (b.s) b.s.forEach((p) => allPairs.push(p));
    if (b.items) b.items.forEach((it) => it.forEach((p) => allPairs.push(p)));
  })
);
/* 正文里的 <a data-link='Lx'> 补成真正的可点链接 + 样式类 */
{
  const linkify = (s) =>
    s.replace(/<a data-link='(L\d+)'/g, (m, id) => {
      const L = linkById[id];
      if (!L) return m;
      return (
        "<a class='lnk' href='" + L.url + "' target='_blank' rel='noopener' data-link='" + id + "'"
      );
    });
  allPairs.forEach((p) => {
    p[0] = linkify(p[0]);
    p[1] = linkify(p[1]);
  });
}
{
  const remaining = Object.keys(TERM_PATTERNS).filter((k) => glossKeys.has(k));
  for (const p of allPairs) {
    if (!remaining.length) break;
    for (let i = 0; i < remaining.length; i++) {
      const key = remaining[i];
      const [reEn, reZh] = TERM_PATTERNS[key];
      const en2 = wrapFirst(p[0], reEn, key);
      if (!en2) continue;
      p[0] = en2;
      const zh2 = wrapFirst(p[1], reZh, key);
      if (zh2) p[1] = zh2;
      remaining.splice(i, 1);
      i--;
    }
  }
  console.log("[terms] 已标注:", Object.keys(TERM_PATTERNS).length - remaining.length, "未匹配:", remaining);
}

/* ---------------- 资源 ---------------- */
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
  mp4: "video/mp4", webm: "video/webm" };
const assets = {};
function assetUrl(file) {
  if (IMAGE_MODE === "external") return MEDIA_BASE + file;
  if (assets[file]) return assets[file];
  const ext = file.split(".").pop();
  const url = "data:" + MIME[ext] + ";base64," + fs.readFileSync(D("assets/" + file)).toString("base64");
  assets[file] = url;
  return url;
}
const FIG_ASSETS = CONFIG.figureAssets || {};
const VIDEO_MODE = ((process.env.VIDEO_MODE || CONFIG.videoMode) === "external") ? "external" : "inline";
const MEDIA_BASE = process.env.MEDIA_BASE || CONFIG.mediaBase || "media/";
const IMAGE_MODE = ((process.env.IMAGE_MODE || CONFIG.imageMode) === "external") ? "external" : "inline";

/* ---------------- 渲染 ---------------- */
const esc = (s) =>
  String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const mdInline = (s) =>
  esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");

function sp(pair, k) {
  return '<span class="s" data-k="' + k + '">' + pair + "</span>";
}
function sentences(pairs, rid, zh) {
  return pairs.map((p, i) => sp(p, rid + "-" + i)).join(zh ? "" : " ");
}

function renderBlock(b, secId, bi) {
  const rid = secId + "-b" + bi;
  if (b.t === "p") {
    return (
      '<div class="row" data-rid="' + rid + '">' +
      '<div class="cell en"><p class="para">' + sentences(b.s.map((x) => x[0]), rid, false) + "</p></div>" +
      '<div class="cell zh"><p class="para">' + sentences(b.s.map((x) => x[1]), rid, true) + "</p></div>" +
      "</div>"
    );
  }
  if (b.t === "ul") {
    const tag = b.ol ? "ol" : "ul";
    const mk = (lang) =>
      "<" + tag + " class='para'>" +
      b.items
        .map(
          (it, ii) =>
            "<li>" +
            it.map((p, i) => sp(p[lang], rid + "-" + ii + "-" + i)).join(lang === 1 ? "" : " ") +
            "</li>"
        )
        .join("") +
      "</" + tag + ">";
    const cls = b.depth === 1 ? "row nested" : "row";
    return (
      '<div class="' + cls + '" data-rid="' + rid + '">' +
      '<div class="cell en">' + mk(0) + "</div>" +
      '<div class="cell zh">' + mk(1) + "</div>" +
      "</div>"
    );
  }
  if (b.t === "h3") {
    return (
      '<div class="row h3row wide" id="h-' + rid + '">' +
      "<h3><span class='h3-en'>" + esc(b.en) + "</span><span class='h3-zh'>" + esc(b.zh) + "</span></h3>" +
      "</div>"
    );
  }
  if (b.t === "fig") return renderFigure(b.fig);
  if (b.t === "principle") {
    const pen = sentences((b.s || []).map((x) => x[0]), rid, false);
    const pzh = sentences((b.s || []).map((x) => x[1]), rid, true);
    const labZh = b.label_zh || meta.principle_label_zh || "设计原则";
    const labEn = b.label_en || meta.principle_label_en || "Design principle";
    return (
      '<div class="row wide principle" data-rid="' + rid + '"><div class="principle-box">' +
      '<span class="lab lab-zh">' + esc(labZh) + '</span><span class="lab lab-en">' + esc(labEn) + "</span>" +
      '<div class="principle-grid">' +
      '<div class="cell en">' + pen + "</div>" +
      '<div class="cell zh">' + pzh + "</div>" +
      "</div></div></div>"
    );
  }
  if (b.t === "foot") {
    const fen = sentences((b.s || []).map((x) => x[0]), rid, false);
    const fzh = sentences((b.s || []).map((x) => x[1]), rid, true);
    return (
      '<div class="row wide foot" data-rid="' + rid + '"><div class="foot-in">' +
      '<span class="foot-n">脚注 ' + (b.n || "") + ' · Footnote ' + (b.n || "") + "</span>" +
      '<div class="foot-grid"><div class="cell en">' + fen + "</div>" +
      '<div class="cell zh">' + fzh + "</div></div></div></div>"
    );
  }
  if (b.t === "callout") {
    return (
      '<div class="row wide"><div class="lede">' +
      '<div class="lede-grid">' +
      '<div class="cell en"><p class="para">' + sentences(b.s.map((x) => x[0]), rid, false) + "</p></div>" +
      '<div class="cell zh"><p class="para">' + sentences(b.s.map((x) => x[1]), rid, true) + "</p></div>" +
      "</div></div></div>"
    );
  }
  if (b.t === "table") {
    const head = (b.head || [])
      .map((c) => '<th><span class="th-en">' + mdInline(c[0] || "") + '</span><span class="th-zh">' + mdInline(c[1] || "") + "</span></th>")
      .join("");
    const rows = (b.rows || [])
      .map((r) => "<tr>" + r.map((c) => '<td><span class="td-en">' + mdInline(c[0] || "") + '</span><span class="td-zh">' + mdInline(c[1] || "") + "</span></td>").join("") + "</tr>")
      .join("");
    return (
      '<div class="row wide tblrow"><div class="tbl-wrap"><table class="bt"><thead><tr>' +
      head + "</tr></thead><tbody>" + rows + "</tbody></table></div></div>"
    );
  }
  if (b.t === "code") {
    return (
      '<div class="row wide coderow"><details class="code-box"><summary>' +
      esc(b.label_zh || "附录代码（英文原文）") +
      (b.note_zh ? '<span class="code-note">' + esc(b.note_zh) + "</span>" : "") +
      '</summary><pre>' + esc(b.text || "") + "</pre></details></div>"
    );
  }
  return "";
}

function renderFigure(id) {
  const f = figById[id] || {};
  const a = FIG_ASSETS[id];
  if (!a) return "";
  const stillUrl = assetUrl(a.still);
  const animUrl = a.anim ? assetUrl(a.anim) : null;
  const videoSrc = a.video ? assetUrl(a.video) : null;
  const sizeMB = a.video ? (fs.statSync(D("assets/" + a.video)).size / 1024 / 1024).toFixed(1) : null;
  const caption =
    "<figcaption>" +
    '<p class="cap-zh"><b>' + esc(f.title_zh || "") + "</b>　" + esc(f.caption_zh || "") + "</p>" +
    (f.alt_en ? '<p class="cap-en">原文图注：' + esc(f.alt_en) + "</p>" : "") +
    (a.video
      ? (VIDEO_MODE === "external"
          ? '<p class="cap-video">▶ 视频按需加载（' + sizeMB + ' MB，浏览器 Range 请求，点击后才下载）。' +
            (f.video_url ? ' <a href="' + esc(f.video_url) + '" target="_blank" rel="noopener">原站在线版 ↗</a>' : "") +
            "</p>"
          : '<p class="cap-video">▶ 视频已内嵌本页（' + sizeMB + ' MB，base64 编码进 HTML，点开即播、断网可播）。' +
            (f.video_url ? ' <a href="' + esc(f.video_url) + '" target="_blank" rel="noopener">原站在线版 ↗</a>' : "") +
            "</p>")
      : f.video_url
        ? '<p class="cap-video">▶ ' + esc(f.frame_note_zh || "原文此处是演示视频，本图是其中一帧。") +
          ' <a href="' + esc(f.video_url) + '" target="_blank" rel="noopener">在线播放原视频（需联网）↗</a></p>'
        : "") +
    '<details class="howto" open><summary>这张图怎么看（' +
    (f.how_to_read || []).length +
    " 条）</summary><ol>" +
    (f.how_to_read || []).map((x) => "<li>" + x + "</li>").join("") +
    "</ol>" +
    (f.takeaway_zh ? '<p class="takeaway">一句话：' + esc(f.takeaway_zh) + "</p>" : "") +
    "</details>" +
    "</figcaption>";
  if (a.video) {
    const base = a.video.split("/").pop();
    let media;
    if (VIDEO_MODE === "external") {
      media =
        '<div class="fig-media has-video">' +
        '<img class="video-poster" src="' + assetUrl(a.still) + '" alt="' + esc(f.alt_en || id) + '" loading="lazy">' +
        '<button class="video-play" type="button" data-video="' + id + '" data-src="' + MEDIA_BASE + base + '">' +
        "<b>▶ 播放视频</b><small>" + sizeMB + " MB · 按需加载</small></button>" +
        '<div class="fig-bar"><span class="vtag">视频按需加载 · 支持拖动</span>' +
        (f.video_url ? '<a class="vbtn" href="' + esc(f.video_url) + '" target="_blank" rel="noopener">原站播放 ↗</a>' : "") +
        "</div>" +
        "</div>";
    } else {
      const b64 = fs.readFileSync(D("assets/" + a.video)).toString("base64");
      media =
        '<div class="fig-media has-video">' +
        '<img class="video-poster" src="' + stillUrl + '" alt="' + esc(f.alt_en || id) + '">' +
        '<button class="video-play" type="button" data-video="' + id + '">' +
        "<b>▶ 播放视频</b><small>" + sizeMB + " MB · 已内嵌，离线可播</small></button>" +
        '<script type="text/plain" id="vid-' + id + '">' + b64 + "</script>" +
        '<div class="fig-bar"><span class="vtag">内嵌视频 · 离线可播</span>' +
        (f.video_url ? '<a class="vbtn" href="' + esc(f.video_url) + '" target="_blank" rel="noopener">原站播放 ↗</a>' : "") +
        "</div>" +
        "</div>";
    }
    return '<figure class="row wide fig has-video" id="' + id + '" data-cap="' + esc(f.title_zh || "") + '">' + media + caption + "</figure>";
  }
  const media =
    '<div class="fig-media">' +
    '<img class="still" src="' + stillUrl + '" loading="lazy" decoding="async" alt="' + esc(f.alt_en || id) + '">' +
    (animUrl ? '<img class="anim" src="' + animUrl + '" alt="' + esc(f.alt_en || id) + '" hidden>' : "") +
    (animUrl
      ? '<div class="fig-bar"><button data-act="still" class="on">静帧</button><button data-act="anim">动图</button></div>'
      : '<div class="fig-bar">' +
        (f.video_url
          ? '<a class="vbtn" href="' + esc(f.video_url) + '" target="_blank" rel="noopener">看演示视频 ↗</a>'
          : "") +
        '<button data-act="zoom">放大</button></div>') +
    "</div>";
  return '<figure class="row wide fig" id="' + id + '" data-cap="' + esc(f.title_zh || "") + '">' + media + caption + "</figure>";
}

/* ---------------- 正文 ---------------- */
const toc = [];
const body = parts
  .map((sec) => {
    let h = "";
    const gist = sec.gist_zh
      ? '<div class="gist"><span class="gist-label">' + (sec.level === 2 ? "本节要点" : "导读") + '</span><p>' + esc(sec.gist_zh) + "</p></div>"
      : "";
    if (sec.level === 2) {
      h +=
        '<div class="sec-head"><span class="sec-num">' + esc(sec.num) + "</span><h2>" +
        '<span class="h-en">' + esc(sec.head_en) + "</span>" +
        '<span class="h-zh">' + esc(sec.head_zh) + "</span></h2></div>";
      toc.push({ id: "s-" + sec.id, level: 2, text: sec.head_zh });
    }
    const blocks = (sec.blocks || [])
      .map((b, bi) => {
        if (b.t === "h3") toc.push({ id: "h-" + sec.id + "-b" + bi, level: 3, text: b.zh });
        return renderBlock(b, sec.id, bi);
      })
      .join("\n");
    return (
      '<section class="sec" id="s-' + sec.id + '">\n' + h + gist + '\n<div class="reader-body">\n' +
      blocks +
      "\n</div>\n</section>"
    );
  })
  .join("\n");

const tocHTML = toc
  .map(
    (t) =>
      '<a class="l' + t.level + '" href="#' + t.id + '"><span class="dot">●</span>' + esc(t.text) + "</a>"
  )
  .join("");

/* ---------------- 速览 ---------------- */
const cmp = meta.compare_zh;
const overview =
  '<section class="overview" id="overview">' +
  "<h2>" + esc(meta.overview_title_zh) + "</h2>" +
  '<p class="ov-sub">译者所加，不是原文的一部分 —— 读完这 ' + (meta.overview_zh || []).length + " 条，再看原文会快很多。</p>" +
  '<ul class="ov-list">' + (meta.overview_zh || []).map((x) => "<li>" + mdInline(x) + "</li>").join("") + "</ul>" +
  '<div class="compare">' +
  '<div class="cmp"><h3>' + esc(cmp.left_title) + "</h3><ol>" + cmp.left_items.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ol></div>" +
  '<div class="cmp win"><h3>' + esc(cmp.right_title) + "</h3><ol>" + cmp.right_items.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ol></div>" +
  "</div>" +
  (cmp.foot_zh ? '<p class="ov-foot cmp-foot">' + esc(cmp.foot_zh) + "</p>" : "") +
  '<p class="ov-foot">' + esc(meta.overview_foot_zh) + "</p>" +
  "</section>";

/* ---------------- 封面 ---------------- */
const countText = (s) =>
  s.replace(/<sup[^>]*>[\s\S]*?<\/sup>/g, "").replace(/<[^>]+>/g, "").replace(/ {2,}/g, " ").trim();
/* 页面统计：正文句对 + 表格单元 + 附录代码，按页面实际呈现的内容计 */
const extraPairs = [];
parts.forEach((sec) => (sec.blocks || []).forEach((b) => {
  if (b.t === "table") {
    (b.head || []).forEach((c) => extraPairs.push(c));
    (b.rows || []).forEach((r) => r.forEach((c) => extraPairs.push(c)));
  }
}));
const codeWords = parts.reduce(
  (n, sec) => n + (sec.blocks || []).reduce(
    (m, b) => m + (b.t === "code" ? countText(b.text || "").split(/\s+/).filter(Boolean).length : 0), 0),
  0
);
const zhChars =
  allPairs.reduce((n, p) => n + countText(p[1]).length, 0) +
  extraPairs.reduce((n, p) => n + countText(p[1]).length, 0);
const enWords =
  allPairs.reduce((n, p) => n + countText(p[0]).split(/\s+/).filter(Boolean).length, 0) +
  extraPairs.reduce((n, p) => n + countText(p[0]).split(/\s+/).filter(Boolean).length, 0) +
  codeWords;
const hero =
  '<section class="hero">' +
  '<p class="kicker">' + esc(meta.org_en) + " · " + esc(meta.published) + "</p>" +
  '<h1 class="h1-wrap"><span class="h1-en">' + esc(meta.title_en) + "</span>" +
  '<span class="h1-zh">' + esc(meta.title_zh) + "</span></h1>" +
  '<div class="hero-meta">' +
  "<span>原文 " + Math.round(enWords / 10) * 10 + " 词</span>" +
  "<span>中文 " + Math.round(zhChars / 100) * 100 + " 字</span>" +
  "<span>逐句对照 <i>" + allPairs.length + "</i> 句</span>" +
  "<span>预计 " + esc(meta.read_min) + " 分钟</span>" +
  '<span><a href="' + esc(meta.source_url) + '" target="_blank" rel="noopener" class="lnk">原文地址</a></span>' +
  "</div>" +
  "</section>";

/* ---------------- 题图（meta.cover） ---------------- */
const cover = meta.cover && meta.cover.asset
  ? '<figure class="cover"><img src="' + assetUrl(meta.cover.asset) + '" alt="' + esc(meta.cover.alt || "") + '">'
    + (meta.cover.caption_zh ? '<figcaption>' + esc(meta.cover.caption_zh) + "</figcaption>" : "")
    + "</figure>"
  : "";

/* ---------------- 附录：延伸阅读 ---------------- */
function tierRank(t) {
  return t === "必读" ? 0 : t === "背景" ? 1 : 2;
}
function linkStatsText(m, n) {
  const s = (m && m.link_stats) || {};
  if (!s.refs) return "原文的引用合并后指向 " + n + " 个不同目的地。";
  return (
    "原文 " + s.refs + " 处正文引用，指向 " + n + " 个不同链接" +
    (s.images ? "；另有 " + s.images + " 张配图未计入" : "") + "。"
  );
}
const linkList = (links.links || []).slice().sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || (a.order || 99) - (b.order || 99));
const linkCards = linkList
  .map((L) => {
    const cls = L.tier === "必读" ? " must" : L.tier === "背景" ? " bg" : "";
    const anchors = (L.anchors_zh || []).map((x) => "<em>" + esc(x) + "</em>").join(" ");
    return (
      '<div class="lnk-card" id="link-' + esc(L.id) + '">' +
      '<div class="lnk-top"><span class="lnk-id">' + esc(L.id) + "</span>" +
      '<span class="chip' + cls + '">' + esc(L.tier || "可选") + "</span>" +
      '<span class="chip">建议第 ' + esc(L.order || "-") + " 个读</span>" +
      (L.access === "region_blocked" ? '<span class="chip">本区域受限</span>' : "") +
      "</div>" +
      "<h4>" + esc(L.title_zh || L.title_en) + "</h4>" +
      '<p class="lnk-site">' + esc(L.site) + " · " + esc(L.title_en || "") + "</p>" +
      (anchors ? '<p class="lnk-anchors">正文对应：' + anchors + "</p>" : "") +
      (L.what_zh ? "<p><b>这是什么：</b>" + esc(L.what_zh) + "</p>" : "") +
      (L.why_zh ? "<p><b>为什么值得点：</b>" + esc(L.why_zh) + "</p>" : "") +
      (L.access_note_zh ? "<p><b>访问说明：</b>" + esc(L.access_note_zh) + "</p>" : "") +
      ((L.digest_zh || (L.key_points_zh || []).length)
        ? "<details" + (L.tier === "必读" ? " open" : "") + "><summary>不点开也能拿到的重点</summary>" +
          (L.digest_zh ? "<p style='margin:8px 0 0;font-size:12.5px;line-height:1.8;color:var(--ink-2)'>" + esc(L.digest_zh) + "</p>" : "") +
          ((L.key_points_zh || []).length ? "<ul>" + L.key_points_zh.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "") +
          "</details>"
        : "") +
      '<a class="lnk-open" href="' + esc(L.url) + '" target="_blank" rel="noopener">打开原文 ↗</a>' +
      "</div>"
    );
  })
  .join("");

/* ---------------- 附录：术语表 ---------------- */
const glossItems = (glossary.terms || [])
  .map(
    (t) =>
      '<div class="gl-item"><div class="gl-head"><span class="gl-en">' + esc(t.en) +
      '</span><span class="gl-zh">' + esc(t.zh) + "</span></div>" +
      '<p class="gl-def">' + esc(t.def_zh) + "</p>" +
      (t.analogy_zh ? '<p class="gl-ana">' + esc(t.analogy_zh) + "</p>" : "") +
      "</div>"
  )
  .join("");

/* ---------------- 附录：译注 / 笔误 ---------------- */
const noteItems = (meta.notes || [])
  .map(
    (n, i) =>
      '<div class="note-item"><div class="note-n">' + String(i + 1).padStart(2, "0") + "</div><div>" +
      "<h4>" + esc(n.title_zh) + "</h4><p>" + esc(n.body_zh) + "</p></div></div>"
  )
  .join("");
const typoItems = (meta.typos || [])
  .map(
    (t) =>
      '<div class="typo-item"><code>' + esc(t.quote_en) + "</code><p>" + esc(t.body_zh) + "</p></div>"
  )
  .join("");

const typoSection =
  (meta.typos || []).length
    ? '<div class="app-sect" id="typos"><h3>原文笔误与图文问题</h3>' +
      '<p class="desc">原文有 ' + (meta.typos || []).length + ' 处笔误或图文问题，中文按语义翻译、英文照录原文，并在此备案，方便对照核查。不在正文里改动原文。</p>' +
      typoItems + "</div>"
    : "";

const appendix =
  '<section class="appendix" id="appendix">' +
  '<div class="app-head"><h2>补充材料</h2></div>' +
  '<p class="app-sub">下面几块都是译者所加，用来补上原文没展开的部分。正文里的虚线链接、虚线术语、上标数字，都能悬停看卡片；这里给出完整的清单，方便你事后再回头查。</p>' +

  '<div class="app-sect" id="links">' +
  "<h3>延伸阅读地图</h3>" +
  '<p class="desc">' + linkStatsText(meta, (links.links || []).length) + "按「不读会不会误解本文」分成三档：必读 / 背景 / 可选，建议顺序即卡片上标注的数字。每条都写了「不点开也能拿到的重点」，所以你可以完全不跳转地读完这篇文章。</p>" +
  '<div class="lnk-grid">' + linkCards + "</div></div>" +

  '<div class="app-sect" id="glossary">' +
  "<h3>术语表</h3>" +
  '<p class="desc">正文里带虚线底线的词，悬停即出解释；这里是完整 ' + (glossary.terms || []).length + " 条，可当速查用。</p>" +
  '<div class="gloss">' + glossItems + "</div></div>" +

  '<div class="app-sect" id="notes">' +
  "<h3>译者注</h3>" +
  '<p class="desc">正文中上标数字对应这里，解释的是「直译会看不懂」或「原文本身含糊」的地方。</p>' +
  noteItems + "</div>" +

  typoSection + "</section>";

const footer =
  "<footer><p>" + esc(meta.foot_zh) + "</p>" +
  '<p>原文：<a href="' + esc(meta.source_url) + '" target="_blank" rel="noopener">' + esc(meta.title_en) + "</a>　·　" +
  "本页由译文与补充材料构成，供学习阅读使用。</p></footer>";

const MAIN = hero + cover + overview + '<div class="colheads"><span>English original</span><span>中文译文</span></div>' +
  '\n<div id="reader">\n' + body + "\n</div>\n" + appendix + footer;

/* ---------------- 客户端卡片数据 ---------------- */
const CARDS = {
  links: Object.fromEntries(
    (links.links || []).map((l) => [
      l.id,
      { title_zh: l.title_zh, title_en: l.title_en, site: l.site, what_zh: l.what_zh, why_zh: l.why_zh, tier: l.tier, order: l.order, url: l.url },
    ])
  ),
  terms: Object.fromEntries(
    (glossary.terms || []).map((t) => [t.key, { en: t.en, zh: t.zh, def_zh: t.def_zh, analogy_zh: t.analogy_zh }])
  ),
  notes: Object.fromEntries((meta.notes || []).map((n) => [n.id, { title_zh: n.title_zh, body_zh: n.body_zh }])),
  typos: (meta.typos || []).map((t) => ({ quote_en: t.quote_en, body_zh: t.body_zh })),
};

/* ---------------- 组装 ---------------- */
const DESC = meta.title_zh + "｜" + meta.title_en + "：英文原文 + 中文逐句对照，附术语卡、图片解读与延伸阅读地图。";
const rep = (str, token, value) => str.split(token).join(value);
let html = read("src/template.html");
html = rep(html, "{{TITLE}}", esc(meta.title_zh + "｜" + meta.title_en));
html = rep(html, "{{DESC}}", esc(DESC));
html = rep(html, "{{CSS}}", read("src/style.css"));
html = rep(html, "{{TOC}}", tocHTML);
html = rep(html, "{{MAIN}}", MAIN);
html = rep(html, "{{CARDS}}", JSON.stringify(CARDS));
html = rep(html, "{{JS}}", read("src/app.js"));

fs.mkdirSync(path.dirname(D(OUT_FILE)), { recursive: true });
fs.writeFileSync(D(OUT_FILE), html, "utf8");
console.log("[build] " + OUT_FILE, (Buffer.byteLength(html) / 1024 / 1024).toFixed(2), "MB");
console.log("[build] 段落块:", parts.reduce((n, s) => n + s.blocks.length, 0), "句对:", allPairs.length);
console.log("[build] 链接:", (links.links || []).length, "术语:", (glossary.terms || []).length, "图:", (figures.figures || []).length);
