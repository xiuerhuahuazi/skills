#!/usr/bin/env node
/* ============================================================
   check-tags.mjs — 校验生成的 index.html 标签是否平衡
   用法：node tools/check-tags.mjs [--root <项目目录>]
   ============================================================ */
import fs from "node:fs";
import path from "node:path";

const i = process.argv.indexOf("--root");
const ROOT = i > -1 ? path.resolve(process.argv[i + 1]) : process.cwd();
const file = path.join(ROOT, "index.html");
if (!fs.existsSync(file)) {
  console.error("找不到 " + file + "，先运行 node build.mjs");
  process.exit(1);
}
const h = fs.readFileSync(file, "utf8");
const body = h.slice(h.indexOf("<body"), h.lastIndexOf("</body>"));
const tags = ["div","p","ul","ol","li","span","a","b","em","i","sup","code","strong",
              "figure","figcaption","details","summary","main","section","nav","button","table","tr","td","th"];
const voids = ["img","br","input","hr","meta","link"];
let bad = 0;
for (const t of tags) {
  const open = (body.match(new RegExp("<" + t + "(?=[\\s>/])", "g")) || []).length;
  const close = (body.match(new RegExp("</" + t + ">", "g")) || []).length;
  const ok = open === close;
  if (!ok) bad++;
  if (!ok || open > 0) console.log(t.padEnd(12), "open=" + String(open).padStart(4), "close=" + String(close).padStart(4), ok ? "OK" : "<<< 不匹配");
}
for (const t of voids) {
  const n = (body.match(new RegExp("<" + t + "(?=[\\s>/])", "g")) || []).length;
  if (n) console.log(t.padEnd(12), "void x", n);
}
if (bad) { console.error("\n" + bad + " 类标签不匹配"); process.exit(1); }
console.log("\n标签全部平衡");
