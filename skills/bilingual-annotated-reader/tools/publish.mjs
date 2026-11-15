#!/usr/bin/env node
/* ============================================================
   publish.mjs — 一条命令产出两种交付，并核对体积

   用法：node tools/publish.mjs [--no-cloud] [--no-inline]

   1) index.html
      单文件交付：图片 / 动图 / 视频全部 base64 内嵌，双击即读、断网可播。
      视频按「点播」处理：base64 存在 <script type="text/plain">，点了才解成 Blob URL。
   2) cloud/index.html + cloud/media/
      云端交付：媒体外置成独立文件（浏览器 Range 请求 + 强缓存），HTML 只留文本与小图引用。

   媒体清单来自 data/config.json 的 figureAssets（still/anim/video）与 data/meta.json 的 cover.asset。
   ============================================================ */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const NODE = process.execPath;
const argv = process.argv.slice(2);
const has = (k) => argv.includes(k);
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const mb = (n) => (n / 1048576).toFixed(2) + " MB";

function run(args, env) {
  execFileSync(args[0], args.slice(1), {
    cwd: ROOT, stdio: "inherit",
    env: { ...process.env, ...(env || {}) },
  });
}

function mediaFiles() {
  const cfg = readJSON("data/config.json");
  const meta = readJSON("data/meta.json");
  const files = new Set();
  for (const a of Object.values(cfg.figureAssets || {})) {
    for (const k of ["still", "anim", "video"]) if (a && a[k]) files.add(a[k]);
  }
  if (meta.cover && meta.cover.asset) files.add(meta.cover.asset);
  return [...files];
}

if (has("--no-inline") && has("--no-cloud")) {
  console.error("两个都跳过就没有活干了。"); process.exit(2);
}

const files = mediaFiles();
if (has("--no-inline") === false) {
  run([NODE, "build.mjs"]);
  const p = path.join(ROOT, "index.html");
  console.log("[publish] 单文件  index.html  " + mb(fs.statSync(p).size));
}

if (has("--no-cloud") === false) {
  run([NODE, "build.mjs", "cloud/index.html"], {
    VIDEO_MODE: "external", IMAGE_MODE: "external", MEDIA_BASE: "media/",
  });
  const mediaDir = path.join(ROOT, "cloud", "media");
  fs.rmSync(mediaDir, { recursive: true, force: true });
  fs.mkdirSync(mediaDir, { recursive: true });
  let copied = 0, bytes = 0;
  for (const rel of files) {
    const src = path.join(ROOT, "assets", rel);
    if (!fs.existsSync(src)) { console.warn("  · 缺素材，跳过：" + rel); continue; }
    fs.copyFileSync(src, path.join(mediaDir, path.basename(rel)));
    copied++; bytes += fs.statSync(src).size;
  }

  console.log("[publish] 云端版  cloud/index.html  " + mb(fs.statSync(path.join(ROOT, "cloud/index.html")).size)
    + " · media/ " + copied + " 个文件 " + mb(bytes));
  // 附带一个支持 Range + 缓存头的本地预览服务器（云端目录自带，直接 node cloud/serve.mjs）
  const server = `/* 本地预览：node cloud/serve.mjs → http://127.0.0.1:45990/ */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 45990);
const TYPES = { ".html": "text/html; charset=utf-8", ".mp4": "video/mp4", ".png": "image/png", ".jpg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp" };
http.createServer((req, res) => {
  const u = decodeURIComponent((req.url || "/").split("?")[0]);
  const file = path.join(ROOT, u === "/" ? "index.html" : u);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("404");
  }
  const st = fs.statSync(file);
  const ext = path.extname(file).toLowerCase();
  const isMedia = [".mp4", ".png", ".jpg", ".gif", ".svg", ".webp"].includes(ext);
  const headers = {
    "Content-Type": TYPES[ext] || "application/octet-stream",
    "Cache-Control": isMedia ? "public, max-age=31536000, immutable" : "no-cache",
    "Accept-Ranges": "bytes",
  };
  const range = req.headers.range;
  if (range && isMedia) {
    const m = /bytes=(\\d*)-(\\d*)/.exec(range);
    const start = m && m[1] ? parseInt(m[1], 10) : 0;
    const end = Math.min(m && m[2] ? parseInt(m[2], 10) : st.size - 1, st.size - 1);
    if (start >= st.size) { res.writeHead(416, { "Content-Range": "bytes */" + st.size }); return res.end(); }
    res.writeHead(206, { ...headers, "Content-Range": "bytes " + start + "-" + end + "/" + st.size, "Content-Length": end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, "Content-Length": st.size });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, "127.0.0.1", () => console.log("cloud demo: http://127.0.0.1:" + PORT + "/"));
`;
  fs.writeFileSync(path.join(ROOT, "cloud", "serve.mjs"), server);
  console.log("[publish] 预览服务器 cloud/serve.mjs（node cloud/serve.mjs）");
}
