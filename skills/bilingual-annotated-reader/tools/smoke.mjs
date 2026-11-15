#!/usr/bin/env node
/* ============================================================
   smoke.mjs — 交互冒烟测试（不需要人看，失败即返回非 0）
   用法：node tools/smoke.mjs [--root <项目目录>]

   用 headless Chrome 跑页面脚本、断言交互结果，把结果写进 <title> 再 dump 出来。
   覆盖：模式切换、字号、目录、句级联动、点击钉住、动图/静帧、放大、
        术语卡数据、链接可点、图注折叠、附录卡片数、术语表条数、
        数据表 / 附录代码块 / 视频播放入口（数量从 data/ 动态读取，没有就跳过）。
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
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const rd = (p, d) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", p), "utf8")); } catch (e) { return d; } };
const nLinks = (rd("links.json", { links: [] }).links || []).length;
const nTerms = (rd("glossary.json", { terms: [] }).terms || []).length;
const nFigs = (rd("figures.json", { figures: [] }).figures || []).length;
const nVideo = (rd("figures.json", { figures: [] }).figures || []).filter((f) => f && f.video_url).length;

/* 数据表 / 代码块数量从 part-*.json 动态统计（没有这些块时断言 0 === 0 自动通过） */
const parts = fs.existsSync(path.join(ROOT, "data"))
  ? fs.readdirSync(path.join(ROOT, "data")).filter((f) => /^part-\d+\.json$/.test(f)).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8")))
  : [];
let nTbl = 0, nTd = 0, nCode = 0;
for (const sec of parts) for (const b of sec.blocks || []) {
  if (b.t === "table") { nTbl++; nTd += (b.rows || []).reduce((n, r) => n + r.length, 0); }
  if (b.t === "code") nCode++;
}

const test = `<script>window.addEventListener('load',function(){setTimeout(function(){
  var R=[];
  function t(n,f){ try{ R.push(n+'='+(f()?'PASS':'FAIL')); }catch(e){ R.push(n+'=ERR:'+e.message); } }
  t('模式EN', function(){ document.querySelector('#modeSeg [data-mode="en"]').click(); return document.body.getAttribute('data-mode')==='en'; });
  t('模式ZH', function(){ document.querySelector('#modeSeg [data-mode="zh"]').click(); return document.body.getAttribute('data-mode')==='zh'; });
  t('模式双语', function(){ document.querySelector('#modeSeg [data-mode="both"]').click(); return document.body.getAttribute('data-mode')==='both'; });
  t('字号+', function(){ var a=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs-en')); document.getElementById('fPlus').click(); var b=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs-en')); return b>a; });
  t('目录', function(){ document.getElementById('tocBtn').click(); return document.getElementById('toc').classList.contains('show'); });
  t('目录关闭', function(){ document.querySelector('#toc .toc-bg').click(); return !document.getElementById('toc').classList.contains('show'); });
  t('句级联动', function(){ var s=document.querySelectorAll('.s'); s[3].dispatchEvent(new PointerEvent('pointerover',{bubbles:true})); return document.querySelectorAll('.s.hl').length===2 && document.querySelectorAll('.row.focus').length>=1; });
  t('点击钉住', function(){ var s=document.querySelectorAll('.s'); s[5].click(); return document.querySelectorAll('.s.pin').length===2; });
  t('左右句对平衡', function(){ var m={}; document.querySelectorAll('.s').forEach(function(e){var k=e.getAttribute('data-k'); m[k]=(m[k]||0)+1;}); return Object.keys(m).every(function(k){return m[k]===2;}); });
  t('动图切换', function(){ var b=document.querySelector('[data-act="anim"]'); if(!b) return true; b.click(); var f=b.closest('.fig'); return !f.querySelector('img.anim').hidden && f.querySelector('img.still').hidden; });
  t('静帧切回', function(){ var b=document.querySelector('[data-act="still"]'); if(!b) return true; b.click(); var f=b.closest('.fig'); return f.querySelector('img.anim').hidden && !f.querySelector('img.still').hidden; });
  t('图片放大', function(){ var m=document.querySelector('.fig-media'); if(!m) return true; m.click(); return document.getElementById('lb').classList.contains('show'); });
  t('放大关闭', function(){ var b=document.getElementById('lbClose'); if(!b) return true; b.click(); return !document.getElementById('lb').classList.contains('show'); });
  t('链接可点', function(){ var a=document.querySelector('a.lnk'); if(!a) return true; return /^https?:/.test(a.getAttribute('href')) && a.getAttribute('target')==='_blank'; });
  t('每句只渲染一份图', function(){ var bad=0; document.querySelectorAll('.fig').forEach(function(f){ var v=[].filter.call(f.querySelectorAll('img'),function(i){return !i.hidden && i.offsetHeight>0}); if(v.length!==1) bad++; }); return bad===0; });
  t('图注折叠', function(){ return document.querySelectorAll('details.howto').length===${nFigs}; });
  t('延伸阅读卡', function(){ return document.querySelectorAll('.lnk-card').length===${nLinks}; });
  t('术语表条数', function(){ return document.querySelectorAll('.gl-item').length===${nTerms}; });
  t('数据表', function(){ return document.querySelectorAll('table.bt').length===${nTbl}; });
  t('表格单元数', function(){ return document.querySelectorAll('table.bt td').length===${nTd}; });
  t('附录代码块', function(){ return document.querySelectorAll('details.code-box').length===${nCode}; });
  t('视频播放入口', function(){ return document.querySelectorAll('.fig-bar .vbtn').length===${nVideo}; });
  t('无模板残留', function(){ var el=document.querySelector('main')||document.body; var s=el.innerHTML; return s.indexOf('{{')<0 && s.indexOf('PLACEHOLDER')<0; });
  document.title=R.join(' | ');
},600);});</script>`;

const tmp = path.join(ROOT, "shots", "_smoke.html");
fs.mkdirSync(path.dirname(tmp), { recursive: true });
/* 关键：先清 localStorage 再跑页面脚本。headless Chrome 的 --user-data-dir 有时不隔离，
   上一次冒烟点过的「双语」会被 restore，导致模式断言假失败/假通过。 */
const cleared = html.replace("<body", "<script>try{localStorage.clear()}catch(e){}</script><body");
fs.writeFileSync(tmp, cleared.replace("</body>", test + "</body>"));
const fileUrl = (p) => "file:///" + p.replace(/\\/g, "/");
const profile = path.join(ROOT, "shots", "_ch-smoke");

const out = execFileSync(CH, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-crash-reporter", "--disable-breakpad",
  "--hide-scrollbars", "--allow-file-access-from-files", "--window-size=1400,900",
  "--virtual-time-budget=9000", "--user-data-dir=" + profile,
  "--dump-dom", fileUrl(tmp),
], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/* 冒烟用的 Chrome profile 往往 5-10MB，跑完就删，别把工程目录撑大 */
try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

const m = out.match(/<title>([\s\S]*?)<\/title>/);
if (!m) { console.error("没能读到测试结果（Chrome 没跑起来？）"); process.exit(1); }
const lines = m[1].replace(/&quot;/g, '"').split(" | ");
lines.forEach((l) => console.log("  " + l));
const fails = lines.filter((l) => !l.endsWith("PASS"));
console.log(fails.length ? "\n✗ " + fails.length + " 项失败" : "\n✓ " + lines.length + " 项全过");
process.exit(fails.length ? 1 : 0);
