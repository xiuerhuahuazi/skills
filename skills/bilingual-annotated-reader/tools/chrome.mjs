#!/usr/bin/env node
/* ============================================================
   chrome.mjs — 找到本机的 Chrome/Chromium（headless 截图与冒烟都要它）
   用法：import { findChrome, chromeHint } from "./chrome.mjs"

   顺序：环境变量 CHROME → 各平台常见安装路径 → PATH 里的命令。
   旧版把 Windows 路径写死，macOS / Linux 上默认直接 ENOENT（05-pitfalls #23）。
   ============================================================ */
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const CANDIDATES = () => [
  process.env.CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  process.env.LOCALAPPDATA ? process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe" : null,
  process.env.PROGRAMFILES ? process.env.PROGRAMFILES + "\\Google\\Chrome\\Application\\chrome.exe" : null,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/snap/bin/chromium",
];

export function findChrome() {
  for (const c of CANDIDATES()) {
    try { if (c && fs.existsSync(c)) return c; } catch (e) { /* 权限问题就当没有 */ }
  }
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"]) {
    try {
      const p = execFileSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
        .split("\n")[0].trim();
      if (p && fs.existsSync(p)) return p;
    } catch (e) { /* 没这个命令 */ }
  }
  return null;
}

export function chromeHint() {
  return "找不到 Chrome/Chromium：设 CHROME=\"/path/to/chrome\"，或安装 Google Chrome（macOS 默认在 /Applications/）。";
}
