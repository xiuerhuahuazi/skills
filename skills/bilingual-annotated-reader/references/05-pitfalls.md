# 已知坑：症状 → 原因 → 修法

按"踩中的概率"排序。每条都是真实踩过的，不是假设。

**谁兜住**（改版后：能自动判的不再靠人）：`gate`=一条命令跑全部自动层，`check`=check-content，`smoke`/`shots` 见文末；
「纪律」= 只能靠写的人记住，这类条目越多，说明越该工具化。

| # | 坑 | 由谁兜住 |
|---|---|---|
| 1 | 图片渲染两份 | `smoke`「每图只渲染一份」 |
| 2 | 窗口最小宽 512 假溢出 | `shots`（窄屏用 600 + 探针） |
| 3 | 悬停卡截图空白 | 只用 computed style 判断，不靠截图 |
| 4 | 负 margin 深部白屏 | `shots` 的 `isolate()` |
| 5 | `String.replace` 吃 `$` | `build.mjs` 已改 split/join |
| 6 | shell 里正则转义 | 纪律（不在命令行拼 JSON） |
| 7 | 中文栏漏链接 | `check` D |
| 8 | 术语标注错位/嵌链接 | `build` 深度计数 |
| 9 | 锚点 + 平滑滚动截歪 | `shots` `--force-prefers-reduced-motion` |
| 10 | curl 静默不写文件 | 用 node fetch |
| 11 | defuddle 吃 inline SVG | `survey.mjs` |
| 12 | 导读与正文矛盾 | AI 审校第 5 条 |
| 13 | 吞空格 / 拼脚注编号 / 链接残渣 | `check` A/B + SPEC 备案 |
| 14 | 审校跑在数据落地前 | `gate` 重跑 build + 哈希绑定 |
| 15 | 页头统计虚高 | `build.mjs` 统计算法（已修） |
| 16 | 丢图、吞表格列 | `survey.mjs` + `check` [S] |
| 17 | `<br/>` 把词拼在一起 | `check` 已把 `<br>` 换成空格 |
| 18 | 术语复数陷阱 / 全在外链里 | `build` 已处理（跳过外链）+ `check` [W] |
| 19 | 单语模式漏藏标题 | `style.css` 已修 + 截图 |
| 20 | headless localStorage 让截图同上 | `smoke`/`shots` 注入 clear |
| 21 | 版本演进型导读陷阱 | AI 审校第 5 条 |
| 22 | 关系型短语塌缩 | 人工/审校（脚本判不了） |
| 23 | Chrome 路径写死，macOS 假失败 | `tools/chrome.mjs` 自动探测 |
| 24 | 校验「报 ✓ 却 exit 0」的假绿 | `check` 退出码 0/1/2 + `gate` |
| 25 | 项目里的 tools 是快照，skill 修了传不下去 | `scaffold.mjs --refresh` |
| 26 | data URI 视频在 Safari 播不了 | 纪律：用 Blob（08 §4） |
| 27 | 含视频项目跑截图后目录暴涨 | 纪律：删 `shots/_*.html` |
| 28 | 云端视频不能拖动 / 起播慢 | 服务器 Range/206 + `+faststart` |
| 29 | base64 页面丢上云 | 纪律：云端用 `publish.mjs` 外置 |
| 30 | `assetUrl` 缺 MIME 生成 `data:undefined` | 纪律：新格式先查 MIME 表 |
| 31 | 状态写进 view transition 回调，快照读到旧值 | 纪律：状态同步改，过渡交给 CSS |
| 32 | 深色漏掉写死的浅色 | `check-shell.mjs`（对照 §5 清单） |
| 33 | 覆盖 `--shell-h` 压掉移动端默认 | 纪律：媒体查询里改（09 §4） |

---

## 1. 图片渲染了两份（最容易漏掉）

**症状**：一张图在页面上出现两次，上下叠着；或者"静帧/动图"切换后两张都在。

**原因**：`hidden` 属性靠 UA 样式表 `[hidden]{display:none}` 生效，而作者样式 `.fig-media img{display:block}` 的优先级更高，把 `hidden` 覆盖了。

**修法**：
```css
[hidden]{display:none!important}
```
**永远**在基础层加上这一条。别只给某几个选择器打补丁。

**为什么难发现**：首屏一般看不到图；`check-tags` 不查这个；只有截图或冒烟测试能抓。所以 `smoke.mjs` 里有一条断言叫"每句只渲染一份图"。

---

## 2. 用 `--window-size=430` 截图，发现"移动端溢出"

**症状**：窄屏截图上文字被右边裁掉，看起来像横向溢出。

**原因**：Windows 上 Chrome 窗口有最小宽度（约 500px，实测 innerWidth=512）。你给 430，它按 512 布局，却按 430 截图 → 右边被裁。

**修法**：先探 `innerWidth` 再判断：
```js
document.title = String(innerWidth)   // 若 > 你给的宽度，说明被抬到最小值
```
验证窄屏用 **600px**，不要用 430。真正的横向溢出用探针查：
```js
[...document.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+1&&r.width>0})
```

---

## 3. 悬停卡片在截图里永远空白

**症状**：DOM 里 `class="card show"`、`opacity` 计算值是 1、位置也对，截图就是没有。

**原因**：CSS `transition` 在 `--virtual-time-budget` 下不推进（合成器动画不走虚拟时间）。卡片 opacity 从 0 开始过渡 → 截图停在 0。同理，用 `--force-prefers-reduced-motion` 也不一定生效。

**修法**：
- 判断功能是否正常：用 `--dump-dom` + 把 `getComputedStyle` 结果写进 `<title>`，**不要**用截图判断。
- 判断外观是否正常：单独渲染一张"卡片标本页"（同样的 `<style>` + class="card show" 的静态 div），不依赖交互。

**教训**：截图只能验证"静态布局"和"布局类 bug"；过渡/动画类效果要用 computed style 验。

---

## 4. 负 margin 切片在深处白屏

**症状**：用 `body{margin-top:-Npx}` 模拟滚动，N 小于约 20000 正常，超过就整片白（纯白，不是纸色）。

**原因**：超出 Chromium 的绘制范围/层上限。

**修法**：把附录这类尾部区域**单独渲染**——取出 `<section class="appendix">` 到 `</main>` 之间的 HTML，套同一个 `<head>` + 一个 `main` 容器，从 0 偏移截图。`tools/shots.mjs` 已内置这个兜底。

---

## 5. `String.replace` 吃掉模板里的 `$`

**症状**：构建出的页面里，CSS/JS 出现莫名其妙的替换，或整段消失。

**原因**：`str.replace(needle, replacement)` 的 replacement 里 `$$`、`$&`、`$'`、`` $` `` 有特殊含义。样式表/脚本里很容易出现 `$`（比如 `$$('.s')`、`$&`）。

**修法**：
```js
const rep = (s, token, value) => s.split(token).join(value);  // 不用 replace
```

---

## 6. shell 里写正则，`\b` 变成退格符

**症状**：`new RegExp("\\bfoo\\b")` 匹配不到任何东西；JSON 里存成了 `"\bfoo\b"`（控制字符）。

**原因**：bash 双引号 → JS 字符串 → JSON 三层转义，少一层就掉成 `\b`（退格）。

**修法**：**别在命令行里拼含反斜杠的 JSON。** 用 `write` 直接写文件，或写一个 `.mjs` 脚本再跑。写完必须验一次：
```js
const re = new RegExp(cfg.termPatterns[0].en, cfg.termPatterns[0].enFlags);
console.log(re.toString(), re.test("..."));
```

---

## 7. 中文栏漏了链接（左右不对称）

**症状**：英文里有链接，中文对应句没有；读者在右栏点不了。

**原因**：手写 JSON 时，英文句抄了 `<a>` 标记，中文句忘了。

**修法**：build 里加对称性断言（每个 `data-k` 恰好 2 个 span），并在 `check-content.mjs` 里统计每个 `data-link` 出现次数——**单数就是漏了一边**。

---

## 8. 术语标注错位 / 标注到链接里

**症状**：术语卡出现在奇怪的位置，或者 `<a>` 里面又套了 `<span class='term'>`。

**原因**：正则直接替换整串 HTML，命中了标签内部或已包裹的链接。

**修法**：切词替换——按 `/(<[^>]+>)/` 拆成文本段与标签段，只在**文本段**里替换，并且维护 `<a>`、`<span>`、`<sup>` 的深度计数，深度 > 0 时跳过。每术语全文只标一次（第一次命中即从待办里移除）。

---

## 9. 锚点跳转 + `scroll-behavior:smooth` 导致截图截在顶部

**症状**：`file:///...index.html#s-fold` 截出来的还是页头。

**原因**：平滑滚动在截图前没跑完。

**修法**：`--force-prefers-reduced-motion` 让 CSS 里的 reduced-motion 分支关掉平滑滚动；或者干脆别用锚点，用负 margin 定位（见坑 4）。

---

## 10. `curl -o file` 在某些沙箱里静默不写文件

**症状**：`curl -sL ... -o page.html` 之后 `wc -c page.html` 说文件不存在。

**修法**：改用 node 的全局 `fetch` 写文件；或检查是否被沙箱拦了出站/落盘。

---

## 11. defuddle 会把行内 SVG 解析掉

**症状**：用户说"文章里有 SVG 图"，但抓下来的 markdown 里没有。

**原因**：很多站点把装饰性图标做成 inline SVG 或 `assets/*.svg`，正文图其实是 gif/png。

**修法**：抓一次原始 HTML 数 `<figure>` 与 `img` 的 src，确认正文图到底是哪几个；别把站点 logo / 卡片缩略图当配图。

---

## 12. 导读（速览）与正文各写一遍，容易互相矛盾

**症状**：首屏「60 秒速览」把某项机制总结成一句话，和正文、配图对不上。审校一眼就抓出来，但读者先看到的是错的。

**原因**：导读是缩写，缩写靠记忆写；而正文是逐句译的。两处不是从同一份事实派生的。

**修法**：
- 导读每条**只写正文逐字支持的内容**，宁可短。
- 涉及「数量、权限、顺序」的清单（三项权限、五个阶段、四类威胁）写完**回查原文那一句**，逐项对。
- 审校提示词里明确加一条：「专门核对导读与正文是否矛盾」。

**这次的实例**：速览写成「告警 agent 只有『写』的权限、没有『发』的权限」，正文是「三项权限：写文档、发消息、读生产日志，但不能部署修复」——速览把「三项」压成了「一项」，还压反了一个。

---

## 13. defuddle 会悄悄吞空格、拼脚注编号、留下链接残渣

**症状**（三种同时出现，且 check-content 会报 1–2 条「找不到/缺失」）：
- 原文 `Scion<em> </em>and` → 抽成 `Scionand`，看起来像原文笔误；
- 脚注正文 `[^1]: 01Storing…`，把页面上的编号徽标 `01` 拼进了句子；
- URL 里的转义括号 `[Piper](https://…/Piper_\(source_control_system\))`，让 check-content 的链接正则只吃到一半，原文里留下一个孤立的 `)`。

**修法**：
1. 抓一次原始 HTML，按 `<p class="…post-text">` 逐段与 markdown 对比（40/40 段一致才继续）。
2. 这是**抽取瑕疵，不是原文笔误**：在 `data/article.md` 里修掉（空格、编号、残渣），并在项目 SPEC 里单独备案；不要塞进 `meta.typos`，否则读者会以为原文写错了。
3. `meta.typos` 为空时让 build 不渲染该附录小节（本 skill 的 build.mjs 已支持），避免交付一个空壳版块。

**教训**：check-content 报「1 处差异」时，先怀疑抓取，再怀疑笔误。

---

## 14. 审校跑在数据落地之前，会报假严重问题

**症状**：审校报告第一条是「外链全部缺失、links.json 是空壳」，而实际上队友 10 分钟前刚交付；report 里还会出现「与 meta.link_stats 矛盾」这类二次推断。

**原因**：Lead 想省时间，在 links/glossary/figures 还没齐时就派审校。审校读到的是上一版构建和空数据文件。

**修法**：
- 派审校前先做一个「数据落地门禁」：`ls` 四个 json 的字节数 + `grep` 构建时间 + 条数（links/terms/figures 是否等于预期），全齐再派。
- 审校提示词开头加一句：「先报告你读到的 data/links.json 条数与 index.html 的 mtime，再开始审」。
- 若审校已基于旧构建，收到报告先核对：报告里的事实性问题是否只源于数据未落地；是则剔除，不当作译文问题。

---

## 15. 页头统计数字虚高（词数/字数）

**症状**：页面写「原文 3,690 词」，check-content 说 3,658 词；中文「8,100 字」vs 实际 8,282 字。

**原因**：build 用 `p[0].replace(/<[^>]+>/g," ")` 再 split，孤立标点（如 `,`）会被算成一个词；中文用 `join(" ")` 后又按整串长度算，空格误差被百位取整掩盖。

**修法**：先去掉 `<sup>…</sup>` 的内容，再把标签替换成**空串**，最后才统计；中文对每对分别求长度再相加，不要 join 后取长度。

---

## 16. defuddle 静默丢图、吞表格列

**症状**：`data/article.md` 里 `![](` 数远少于原始 HTML 的 `<figure>` 数；表格只剩第一列、后面几列凭空消失；图注不见了。
**原因**：没有 `alt` 的懒加载图片、`div[role=table]` 布局表格、`<br/>` 多行结构，defuddle 的 markdown 输出处理不了。
**修法**：抓一次原始 HTML，数 figure / img / table / video / pre；对不上就按 DOM 顺序逐元素重建 `article.md`（见 `01-pipeline.md`「原始 HTML 对账」）。**不要**拿残缺的 defuddle 输出当权威去翻译。2026-10 实测：Anthropic 长文 8 张图只留 2 张、3 张表全吞。

## 17. 句对里的 `<br/>` 让 check-content 把词拼在一起

**症状**：`[A]` 报「Remaining gaps:- Audio…找不到」，人眼比对原文一模一样。
**原因**：`check-content` 的 `stripTags` 把标签替换成**空串**，`gaps:<br/>- Audio` 成了 `gaps:- Audio`，与原文 `gaps: - Audio` 差一个空格。
**修法**：`<br/>` 前留一个空格（`gaps: <br/>- Audio`），或不用 `<br/>`；改完重跑 [A]。

## 18. 术语正则的复数陷阱 / 全在外链里

**症状**：build 日志「已标注」比预期少；某术语正文没下划线。
**原因 a**：复数写错——`harnesses?` 实际匹配 "harnesse(s)"，正确是 `harness(es)?`。
**原因 b**：该术语所有出现都嵌在 `<a>` 里（如 `Claude Agent SDK`），wrapFirst 会跳过。
**修法**：a 改正则并重跑 build 看「已标注」数；b 可接受（术语表仍收录，check-content 会列「未标注」），不要为了标注把它从链接里拆出来。

## 19. 单语模式漏隐藏封面标题与补充层

**症状**：切到 EN 模式，中文大标题还挂在英文标题下面；中文速览 / 附录整块还在。
**原因**：模式规则只藏了 `.cell.zh`、`.h-zh`，没藏 `.h1-zh`（封面标题）和 `.overview`、`.appendix`（纯译者补充层）。
**修法**：模板 `style.css` 已修（见 `03-page-spec.md` 第 5 节）；改完实际截 EN / 中 两张图看。

## 20. headless Chrome 的 localStorage 让两张模式截图一模一样

**症状**：同一页面渲染 `<body data-mode="en">` 和 `zh` 两个副本，截图却字节级相同。
**原因**：Chrome 的 `--user-data-dir` 有时并不隔离 file:// 页面的 localStorage；上次冒烟点过「双语」被 restore，页面加载后又回到 both。
**修法**：截图/探针前在 `<body` 之前注入 `<script>try{localStorage.clear()}catch(e){}</script>`；并比较 EN / 中两张截图的 md5，相同就是没生效。
**附**：`execFileSync` 调 Chrome 偶发挂起时，拆两步——node 写临时 HTML → bash 直接调 `chrome --dump-dom/--screenshot` → node 解析，别在 node 里死等子进程 pipe。

## 21. 版本演进型文章的导读陷阱

**症状**：速览写「作者用重置上下文替代压缩」，正文却说「最终把这套 harness 的上下文重置整个删掉、改用自动压缩」——读者进 §03 就发现前后打架。
**原因**：文章讲 v1→v2 演进，而导读把「早先 harness 的做法」当成了「本文最终做法」。
**修法**：导读 / 对比卡**按版本写**（前作 / 完整版 v1 / 更新版 v2），每个机制标注属于哪一代；审校提示词里加「按版本核对导读与正文」，并核对口径——`over 20x` 只指成本，时间只有约 18 倍。

## 22. 关系型短语塌缩导致自相矛盾

**症状**：`relative to` 译成「之外的哪个位置」，下一句却说「边界之内的任务评估器是多余开销」，两句打架。
**原因**：把「A 相对于 B 的关系」译成「A 在 B 之外」的单侧判定。
**修法**：关系型短语（relative to / compared with / beyond / depending on）译成关系本身：「取决于任务相对『模型能独立可靠完成的范围』落在哪一侧」。改完回读相邻两句是否自洽。

---

## 23. Chrome 路径写死，macOS / Linux 上直接 ENOENT

**症状**：`node tools/smoke.mjs` 抛 `ENOENT ... C:/Program Files/Google/Chrome/...`，堆栈指向 `execFileSync`；
或者 `shots` 什么都没生成。文档写着「直接跑」，实际跑不起来。

**原因**：`smoke.mjs` / `shots.mjs` 里 `const CH = process.env.CHROME || "C:/..."`——默认值是 Windows 路径。
2026-11-10 实测：5 篇成品里 5 份拷贝都带着这个默认值，而 `claude-code-review/.tmp/qashots.mjs` 里手写了 macOS 路径，
说明当时是**绕过工具**干活的。

**修法**（已并入 skill）：`tools/chrome.mjs` 按 `CHROME` → 各平台常见安装位置 → `which/where` 的顺序探测；
找不到就 `exit 2` 并提示 `CHROME=/path/to/chrome`。
**教训**：默认值里出现某一个平台的绝对路径，就是「只在我机器上能跑」的定时炸弹。

## 24. 校验脚本「报 ✓ 却 exit 0」的假绿

**症状**：`check-content` 打印「✓ 保真度检查通过」，但把 4 句英文改成不存在的句子、甚至删掉 `index.html`，
退出码依然是 0。闸门（CI、`&&` 串联、同事的检查习惯）全部失效。

**原因**：旧版最后只 `console.log`，没有 `process.exit`；而且阈值写成 `notFound.length > 1`，
**单条差异被故意放行**，所以 1 处真实差异会打印「✓」。

**修法**（已并入 skill）：退出码 0/1/2 三态；任何非空白差异都算错误（除非在 `meta.typos` / `allowed_diffs` 备案）；
缺 `index.html` 直接 exit 2（阶段 3 校对时加 `--allow-no-html` 明确跳过）。
**教训**：**「✓」必须有退出码背书**。没有退出码的检查只能当提示，不能写进交付门槛。

## 25. 项目里的 tools 是快照，skill 修好了旧项目也不受益

**症状**：skill 发了新版，5 篇成品里有 3 篇还在跑缺 `[T]` 表格检查、缺 localStorage 清理的旧脚本；
再在上面跑 checker，得到的是旧结论。

**原因**：`scaffold` 把 `tools/` 复制进项目后就是快照，没有任何回灌机制；也没有版本号，事后无法判断谁新谁旧。

**修法**（已并入 skill）：`data/skill.json` 记录版本；`scaffold.mjs --refresh <项目>` 只覆盖 `tools/`
（`src/` 默认只报差异，加 `--src` 才覆盖，避免冲掉文章专属改动）。
**教训**：**复制即冻结**。凡是会被多次复制的东西，都要给一条「刷新」的路。

## 26. 内嵌视频用 data URI，Safari 播不了

**症状**：Chrome 正常，Safari 黑屏；或 iOS 直接不播。
**原因**：WebKit 对 `data:video/mp4;base64` 支持不稳（iOS 明确不支持）。云端还会放大 base64 的缺点（无法缓存/Range）。
**修法**：单文件把 base64 放进 `<script type="text/plain">`，点击时 `atob → Blob → createObjectURL` 再赋给 `video.src`；
云端直接用文件 URL（`publish.mjs`）。

## 27. 含视频的项目一跑截图，目录涨到几百 MB

**症状**：`shots/` 突然 200 MB。**原因**：`shots.mjs`/`smoke.mjs` 把整页复制成 `_*.html`，页面里带内嵌视频就一起复制。
**修法**：跑完 `rm -f shots/_*.html`（保留 PNG）。别把 `_*.html` 存档。

## 28. 云端视频不能拖动、起播慢

**症状**：进度条拖不动、要等整段下完。**原因**：服务器不支持 Range（返回 200 而不是 206），或 mp4 没做 `+faststart`。
**修法**：静态服务器返回 `206 + Content-Range`（nginx 默认支持；代理加 `proxy_force_ranges on;`）；转码加 `-movflags +faststart`。

## 29. 把 base64 页面直接丢上云

**症状**：首屏 6-14 MB、每次访问重下、无法单独缓存视频。
**修法**：云端一律 `node tools/publish.mjs`，用 `cloud/index.html` + `cloud/media/`；HTML `no-cache`，媒体 `immutable`。

## 30. `data:undefined;base64,...` 的假图

**症状**：图片在某些解析器里整块消失。**原因**：`build.mjs` 的 `MIME` 表缺扩展名（历史上 jpg、后来 mp4 都踩过）。
**修法**：新格式先加 MIME；改完 `grep MIME build.mjs` 复核，并跑 `publish.mjs` 看体积是否符合预期。

## 31. 把状态变更放进 `document.startViewTransition` 的回调里

**症状**：自动化检查里主题切不动——`--dump-dom` 拿到的还是旧 `data-theme`；但人工点击是好的。
**原因**：`startViewTransition(cb)` 的 `cb` 在**后续渲染步骤**才执行，不是同步调用。命令跑完立刻抓 DOM/截图，
读到的是变更前的状态。（不是"headless 不执行回调"——加 `--virtual-time-budget` 或用真实浏览器点击，回调会正常跑；
我们曾按这个错误归因写进文档，审计阶段实测复盘后订正。）
**修法**：状态（`data-theme`）**同步**改，过渡交给 CSS（如 `transition: background-color .25s`），
`prefers-reduced-motion: reduce` 下关掉过渡；`startViewTransition` 只留给跨文档导航这种真的需要快照的场景。
理由不是"headless 不支持"，而是同步状态可被任何快照稳定观测、可测。

## 32. 深色只覆盖「记得的」类，漏掉写死浅色

**症状**：深色下某几张卡还是奶油底（`.cmp.win`），图容器发白（`.fig-media`），选中态几乎看不见。
深色模式"看起来做了"，实际只换了配色变量。

**原因**：精读页有一批颜色是**写死的十六进制 / rgba**，不跟 `--paper / --ink` 这类变量走；
深色主题只换了变量，忘了逐条覆盖这些写死值。凭印象覆盖必漏——漏哪条取决于当时记得哪条。

**修法**：反扫 `templates/style.css` 里所有写死的颜色，逐条判定**换 / 不换**，清单落进
`references/09-site-shell.md` §5；然后用 `node tools/check-shell.mjs` 守住——
**文档说覆盖、代码没做会红**（它把 §5 的选择器逐条拿去 `[data-theme="dark"]` 规则里找，找不到就 FAIL）。
**教训**：清单和代码要有一条机器能验的链路，否则清单会随时间腐坏，变成骗自己的文档。

## 33. 站点覆盖 `--shell-h` 连移动端默认一起盖掉

**症状**：桌面 56px 生效了，手机上也变 56px，吸顶区多占 8px，导航条和页头挤在一起。

**原因**：站点在页面自己的 `<style>` 里写 `:root{--shell-h:56px}`。
`:root` 的特异性是 **(0,1,0)**，外壳里移动端默认 `html{--shell-h:48px}` 是 **(0,0,1)**——
前者赢，于是 `≤640px` 的移动端默认被压掉。

**修法**：只想改桌面就写

```css
@media (min-width:641px){:root{--shell-h:56px}}
```

想全局改就接受移动端一起变（并把移动端那一条也重写，别让两套默认值打架）。
**教训**：覆盖别人的 CSS 变量前先看它的特异性来源——`html` vs `:root` 差着一个类，媒体查询里的值不一定守得住。

