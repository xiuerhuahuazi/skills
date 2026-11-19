# 09 · 站点外壳与深色主题

> 写给"下次要把精读页接进自己站点"的 agent。
> 工具：`tools/inject-shell.mjs`（v2.2.0 起）· 自检：`tools/check-shell.mjs`（v2.2.1 起）· 配置模板：`templates/shell.config.example.json`
> 写完这个文件之前的版本，技能只会产出**孤立的**单文件 HTML——没有导航、没有品牌、没有深色模式。

## 1. 为什么需要外壳，以及取舍

精读页是"单个离线 HTML"：双击就开、断网能读、不依赖任何外部资源。这是它的优点，也带来两个问题：

1. **读者落在页面里出不来**——没有返回站点的入口，没有站内导航。
2. **和站点割裂**——读者点进你的博客，深色模式下是一张白纸，和站点两个世界。

### 三条路，取舍如下

| 做法 | 结果 | 判断 |
|---|---|---|
| 改 `templates/style.css` / `build.mjs`，让精读页天生带站点头 | 每个站点都要改一次模板，模板被污染；离线单文件交付时带着用不上的导航 | ❌ 不做 |
| 在站点仓库里写一个一次性脚本（`import_readers.py` 那种） | 每个站点重复造轮子；品牌和配色写死在脚本里；没幂等保障 | ⚠️ 只作为参考 |
| **往成品页里注入式外壳**（本文件） | 精读页本身不动，站点侧一条命令接入；换站点只换一份 config | ✅ 采用 |

**注入式外壳的边界**：只加，不改。精读页自己的排版、配色（浅色下）、文案、交互一律不碰；外壳要做的只是"加一条导航条"和"多一套深色皮肤"。

代价说清楚：
- 成品 HTML 变大（本例 160 KB → 172 KB，+7%）。
- 页面里多了 5 块标记，页面不再是"纯净"的精读页——所以**单文件分发版应该注入后再分发**，或分发前跑一次 `--check` 确认状态。
- 浅色下**不覆盖**精读页自己的配色（那是它设计并 QA 过的），所以站点品牌色和正文强调色可能不完全一致；把 config 的 `accent` 设成与精读页 `--accent` 相同的值（默认 `#b0512b`）就一致了。

## 2. 怎么用

```bash
# 1) 复制配置模板，改成自己站的信息
cp templates/shell.config.example.json /tmp/site.json
$EDITOR /tmp/site.json

# 2) 注入（默认就地写回）
node tools/inject-shell.mjs path/to/index.html --config /tmp/site.json

# 3) 只看会改什么，不写盘
node tools/inject-shell.mjs path/to/index.html --config /tmp/site.json --dry-run

# 4) 只检测状态（0=已注入且配置一致，1=未注入 或 配置已变，2=出错）
node tools/inject-shell.mjs path/to/index.html --config /tmp/site.json --check

# 5) 外壳自检（工具改了、样式表改了都跑这个；零依赖、无浏览器、不联网）
node tools/check-shell.mjs
```

`check-shell.mjs` 是**机器能验**的那道门：它把 §5 的「写死浅色清单」逐条拿去
`templates/style.css` 和注入产物的 `[data-theme="dark"]` 规则里找，缺一条就 FAIL 并退出 1。
改了样式表里的颜色，改完清单就回来跑它——**文档说覆盖、代码没做会红**。

> `--check` 只看**这一个页面**的状态；`check-shell.mjs` 看的是**工具 + 清单 + 样式表**整体有没有脱节。
> 两者都要跑：一个查现场，一个查地基。

配置只有 5 组字段，多一个都不要：

```json
{
  "siteUrl": "https://example.com/",
  "brand": { "text": "example", "href": "/" },
  "nav": [
    { "text": "首页", "href": "/" },
    { "text": "双语书架", "href": "/readers/", "current": true }
  ],
  "accent": "#b0512b",
  "dark": { "bg": "#15130f", "fg": "#efe9dd" }
}
```

- `siteUrl`：站点根 URL；`brand.href` 和 `nav[].href` 写相对路径时按它拼成绝对地址。
- `brand.text`：导航条左侧的品牌文字；左侧那个方框里的字母取它的首字符。
- `nav[].current: true`：给当前页面的那一项标 `aria-current="page"`（下划线 + 深色字）。
- `accent`：站点强调色。**深色模式下如果它在深底上对比度不足 4.5，工具会自动往前景色方向提亮**，本来就亮的 accent 不动。
- `dark.bg` / `dark.fg`：深色底的底色与字色。其余深色变量（paper-2 / card / ink-2 / ink-3 / rule / rule-2 / accent-2 / accent-soft / hl / term）由工具按这两个值推算，不用配。

**深色里没有配置的项**：`--term`（术语色）浅色下是橄榄绿，深色下由"前景色 + accent"混出暖色，色相和浅色不一致——想要一致的术语色，在注入后的 CSS 里改 `--term` 一行即可。

## 3. 注入点与标记表

一共 5 块，每块都带**成对的 HTML 注释标记**和**一个唯一 id**：

| # | 标记 | 元素 id | 位置 | 干什么 |
|---|---|---|---|---|
| 1 | `<!-- shell:theme-boot:begin/end -->` | `<script id="shell-theme-boot">` | `<head>` 尾部 | 首帧前读 `localStorage['site-theme']`，是 dark 就立刻给根元素打上 `data-theme="dark"`；顺手同步 `meta theme-color` |
| 2 | `<!-- shell:style:begin/end -->` | `<style id="shell-style">` | `<head>` 尾部 | 导航条样式、布局偏移（`--shell-h`）、`scroll-padding-top`、跨文档 `@view-transition`、打印规则、换肤过渡 |
| 3 | `<!-- shell:dark:begin/end -->` | `<style id="shell-dark">` | `<head>` 尾部 | `[data-theme="dark"]` 下换掉精读页的配色变量 + 逐条换掉写死的浅色 |
| 4 | `<!-- shell:nav:begin/end -->` | `<header id="shell-nav">` | `<body>` 开头 | 站点导航条：品牌方框 + 品牌文字 + 导航项 + 主题切换按钮 |
| 5 | `<!-- shell:script:begin/end -->` | `<script id="shell-script">` | `</body>` 前 | 主题切换：改 `data-theme`、写 `localStorage`、同步 `aria-pressed` 与 `aria-label`、同步 `meta theme-color` |

`<head>` 里三块的顺序是 **dark → style → boot**：引导脚本最后跑，能读到已经解析好的 `--paper`，`meta theme-color` 才写得准。

### 配置指纹（`<!-- shell:config:xxxxxxxx -->`）

第 1 块（`theme-boot`）里还多一条**配置指纹**注释：

```html
<!-- shell:config:360e3dc6 -->
<script id="shell-theme-boot">…</script>
```

它是**规范化后 config 的 sha1 前 8 位**——字段顺序、缩进、URL 拼法差异都不影响，
但改一个导航项、改一个 accent 就会变。它放在标记区里，**随整块替换**，所以幂等不受影响。

作用只有一个：让 `--check` 认得出**配置漂移**。

| 页面状态 | `--check` 退出码 | 打印 |
|---|---|---|
| 一块都没注入 | **1** | 未注入外壳 |
| 5 块都在，指纹与当前 config 不同 | **1** | 配置已变，需重跑注入（旧 xxx / 新 yyy） |
| 5 块都在，指纹一致 | **0** | 已注入外壳 + 配置指纹 |
| 标记半残 / config 读不了 / 其它错 | **2** | 报错 |

> 退出码集合没变（还是 0/1/2），只是 1 多了一个理由。
> v2.2.0 注入的页面没有指纹（判为「旧 无」），`--check` 会返回 1 —— **重跑一次注入即可**，不是坏了。

### 为什么幂等

- 每块用 `<!-- shell:<key>:begin -->` / `<!-- shell:<key>:end -->` 成对标记圈起来。
- 再次运行时：找到成对标记 → **整块替换**（内容由 config 重新生成）；没找到 → 按锚点插入；**只找到半个标记 → 报错退出 2**（页面被改坏了，不要猜）。
- 整块替换而不是"再插一份"，所以：**同一份 config 跑两次，字节完全相同**；换了 config 再跑，导航/配色会跟着更新，不会叠加成两层导航条。
- 锚点分别是 `</head>`、`<body ...>` 的开标签之后、`</body>` 之前——都不依赖精读页内部结构，模板改版也不容易失配。

实测（160,634 字节的真实成品页，用 `templates/shell.config.example.json` 的示例配置）：

```
第一次注入：字节 160634 → 172022   md5 变了
第二次注入：字节 172022 → 172022   md5 与第一次完全相同
```

注入体积随配置变化（导航项多少、accent 不同都会影响内联色值）：换一份仿博客的配置实测是 172,004 字节。
按 +7% 估算即可，别把这里的字节数当断言。

## 4. 布局偏移

外壳高 52px，页面里本来就有两条吸顶件（`.topbar` 46px、`.colheads`），所以要往下让位：

| 元素 | 原本 | 接外壳后 |
|---|---|---|
| `.shell-nav` | — | `position:sticky; top:0; height:var(--shell-h,52px)` |
| `.topbar` | `top:0` | `top:var(--shell-h,52px)` |
| `.colheads` | `top:var(--bar)` | `top:calc(var(--shell-h,52px) + var(--bar,46px))` |

**下移量由 CSS 变量控制**：`--shell-h`，默认 52px。外壳**只在一处**定义它——`≤640px` 媒体查询里的
`html{--shell-h:48px}` 移动端默认；其余地方一律用 `var(--shell-h, 52px)` 的回退写法。
站点想改成 56px，在页面自己的 `<style>` 里加一行：

```css
:root{--shell-h:56px}
```

`:root` 特异性（0,1,0）高于 `html`（0,0,1），所以这一行**会同时压过移动端的 48px**。
想移动端继续用 48px 就别覆盖，或者写成 `@media (min-width:641px){:root{--shell-h:56px}}`。

**不要**把高度写进 config：外壳的高度属于站点自己的设计，不属于"接站"这件事。

### 锚点别被吸顶栏挡住

```css
html{scroll-padding-top:calc(var(--shell-h,52px) + var(--bar,46px) + 12px)}
```

两条吸顶栏一共 98px，再留 12px 余量。少了这一行，点目录跳到某节时，标题会正好压在栏下面。

### 移动端

- `≤900px`：隐藏导航项（`.shell-links`），只留品牌和主题按钮——横排 4 个链接在窄屏会挤爆。
- `≤640px`：导航条高度降到 48px（`html{--shell-h:48px}`）。
- `≤359px`：品牌文字也隐藏，只留那个方框标记。

## 5. 写死的浅色清单

深色主题要干两件事，缺一不可：

1. **换变量**：精读页的 `--paper / --card / --ink / --ink-2 / --ink-3 / --rule / --rule-2 / --accent / --accent-2 / --accent-soft / --hl / --term` 全部换成深色值。
2. **换写死的浅色**：精读页有一批颜色是**直接写死的十六进制/rgba**，不跟变量走，必须逐条覆盖。

下面这份清单是从 `templates/style.css` 里逐条抠出来的（类名都是真实存在的，见 §10 的自检清单）：

| 选择器 | 写死的浅色 | 为什么必须换 |
|---|---|---|
| `::selection` | `rgba(176,81,43,.18)` | 选中态是半透明浅橙，深底上几乎看不见 |
| `.topbar` | `rgba(251,248,243,.88)` | 页面自己的吸顶工具条，浅色半透明叠在深色正文上就是一条白带 |
| `.gist p` | `color:#4a3a2e` | 速览正文写死深棕字，深底上读不清 |
| `.cell.en` | `color:#2a251f` | 英文列写死墨色 |
| `.cell.zh` | `color:#332c25` | 中文列写死墨色 |
| `.cmp.win` | `background:#fdf3ea;border-color:#eccdb8` | "5 层 vs 1 循环"对比卡胜出侧的奶油底 + 浅描边 |
| `.fig-media` | `background:#fff` | 图片容器白底，深色下每张图外面套一个白框 |
| `.s.pin` | `rgba(203,124,66,.10)` + `inset 2px 0 0 rgba(176,81,43,.55)` | 点一下钉住的那句，底色和左侧竖线都是浅橙 |
| `a.lnk` | `border-bottom:1px solid rgba(176,81,43,.42)` | 正文里延伸阅读链接的下划线 |
| `a.lnk:hover` | `background:rgba(176,81,43,.09)` | 链接悬停底色 |
| `.term:hover` | `background:rgba(125,106,60,.1)` | 术语悬停的橄榄色底 |
| `sup.tn` | `border:1px solid #eccdb8` | 译注角标的描边 |
| `sup.tn:hover` | `color:#fff` | 角标悬停时白字压在 accent 上；深色下 accent 变亮，白字读不出来，改成 `var(--paper)` |
| `.typo` | `border-bottom:1px dotted #c0392b` | 原文笔误标记的红虚线，深底上要更亮才看得见 |
| `.typo:hover` | `background:rgba(192,57,43,.08)` | 笔误悬停底色 |
| `figcaption` | `border-left:2px solid #eccdb8` | 图注的左边框 |
| `.card` | `box-shadow:…rgba(60,40,20,.28)…` | 悬停卡的阴影是棕色的，深底上要换成黑 |
| `.chip.must` | `background:#fbe4d6;color:#8f3f1f;border-color:#eccdb8` | "必读"徽章的浅橙底 + 深橙字 |
| `.chip.bg` | `background:#eaf0e2;color:#4b5c2f;border-color:#d8e0c8` | "背景"徽章的浅绿底 + 深绿字（这组是语义色，深色下另配一套深绿） |
| `.lnk-card:hover` | `border-color:#e0c3ae` + 棕色阴影 | 延伸阅读卡悬停 |
| `table.bt tbody tr:hover td` | `background:#fdf8f1` | 表格行悬停底色 |
| `table.bt code` | `color:#8f3f1f` | 表格里的行内代码色 |
| `.typo-item code` | `color:#8f3f1f` | 附录里笔误引文的代码色 |
| `.fig-bar button` | `background:rgba(255,253,249,.94)` | 图上工具条（静帧/动图切换） |
| `.fig-bar button.on` | `color:#fdfbf7` | 工具条选中态文字 |
| `.fig-bar .vbtn` | `border:1px solid #eccdb8;background:rgba(253,243,234,.96)` | 图上的"视频入口"按钮 |
| `.cap-video a` | `border-bottom:1px dotted #eccdb8` | 视频图注里的链接下划线 |
| `.toc-bg` | `background:rgba(30,25,20,.34)` | 目录抽屉的遮罩层 |
| `.toc-panel` | `box-shadow:-20px 0 50px rgba(40,25,10,.16)` | 抽屉阴影 |
| `.toc-panel a` | `border-bottom:1px solid rgba(230,222,209,.7)` | 目录项之间的分隔线 |
| `.seg button:hover` | `background:rgba(0,0,0,.03)` | 模式/字号分段按钮的悬停底 |
| `.seg button.on` | `color:#fdfbf7` | 分段按钮选中态文字（选中底色是 `var(--ink)`，深色下要跟着反色） |
| `#progress` | `linear-gradient(…, #d99a63)` | 顶部进度条渐变的第二个颜色 |

**不用换的**（深色下本来就对，别多手）：`.lb{background:rgba(30,25,20,.93)}`、`.lb-bar{color:#e9e2d8}`、`.lb-bar button{border:…rgba(255,255,255,.28)}`、`.fig-bar .vtag{background:rgba(20,16,12,.72)}`、`fig.has-video .fig-media{background:#0b0b0b}`、`.fig-video{background:#0b0b0b}`、`.video-play{background:rgba(16,13,10,.72);color:#fbf8f3}`——这些本来就是深底浅字。`.lb img{background:#fff}` 也不换：那是灯箱里照片的衬纸。

> 这份清单会随 `templates/style.css` 变化。改了样式表里的颜色，记得回来核一遍——
> `node tools/check-shell.mjs` 会拿这份清单逐条去 `templates/style.css` 和注入产物的
> `[data-theme="dark"]` 规则里找，**清单说有、代码没有就 FAIL**（见 §10）。

## 6. 打印

```css
@media print{
  .shell-nav{display:none!important}   /* 导航条不该印在纸上 */
  html{scroll-padding-top:0}
  [data-theme="dark"]{ --paper:#fff; --paper-2:#f5f5f5; --card:#fff; --ink:#000; … color-scheme:light; }
  [data-theme="dark"] ::selection{background:transparent}
  [data-theme="dark"] .chip.must{…}   /* 两个徽章的深色版要在这里反回浅色 */
  [data-theme="dark"] .chip.bg{…}
}
```

要点：**深色下打印也必须是浅色**。`[data-theme="dark"]` 的变量块在浅色块之后（`shell-style` 排在 `shell-dark` 后面），所以打印时它赢。徽章那两条是写死的颜色，必须单独在打印里反写回去——变量反不了。

精读页自己的 `@media print` 已经隐藏了 `.topbar/.colheads/.card/.lb/.toc/.fig-bar/#progress`，外壳只需再隐藏 `.shell-nav`。

## 7. 跨文档 `@view-transition` 与叠影规避

外壳会加上：

```css
@view-transition{navigation:auto}
::view-transition-old(root),::view-transition-new(root){mix-blend-mode:normal}
```

- `@view-transition{navigation:auto}` 让**跨文档跳转**（点导航条去别的页面）带过渡，Chrome 126+ 生效；不支持的浏览器照常跳转，无副作用。
- **叠影（重影）从哪来**：浏览器默认给 `::view-transition-old/new` 用 `plus-lighter` 混色做交叉淡入淡出，两帧叠加时中间会出现一层发白的"重影"，页面看着像闪了一下。显式写 `mix-blend-mode:normal` 就回到普通交叉淡入。
- 动画本身用 `shell-vt-out` / `shell-vt-in` 两个 keyframe（淡出 0.14s，淡入 0.22s 延迟 0.08s），并且在 `@media (prefers-reduced-motion:reduce)` 下一律 `animation:none`。

**主题切换本身不走 `document.startViewTransition`**：`startViewTransition(cb)` 的回调在**后续渲染步骤**才执行，不是同步调用；命令跑完立刻 `--dump-dom` / 截图，读到的是变更前的 `data-theme`——看起来像"主题切不动"，其实回调会跑（加 `--virtual-time-budget` 或用真实浏览器点击就能看到变），只是**任何同步快照都只能看到旧状态**（见 `references/05-pitfalls.md` #31）。所以工具用"同步改属性 + CSS 过渡"（`body/.topbar/.shell-nav` 过渡 0.25s，`prefers-reduced-motion:reduce` 下关掉过渡）：同步状态可被任何快照稳定观测、可测。`startViewTransition` 只留给跨文档导航这种真的需要快照的场景。

## 8. 已知坑

1. **幂等靠成对标记**。标记只有 begin 没有 end（多半是手工改坏了）时，工具会**报错退出 2**，不会硬插——宁可停下让人看一眼，也不要把页面叠成两层导航条。改完记得再跑一次 `--check`。
2. **首帧前就要设 `data-theme`**。引导脚本（第 1 块）必须放在 `<head>` 里、且在所有 CSS 之后、`<body>` 之前。放晚了就会先闪一帧白底再变深色——这是"闪白"的唯一成因。实测：在 `<head>` 开头预置 `localStorage['site-theme']='dark'`，`--dump-dom` 出来就是 `<html … data-theme="dark">`。
3. **headless 下 localStorage 残留，两张截图会一模一样**。`localStorage` 在 `file://` 下可能不隔离（见 `references/05-pitfalls.md` #20）：上次截图点是深色，这次以为是浅色，拍出来两张 md5 一样。截图/探针前先清干净：`localStorage.removeItem('site-theme')`，或用独立的 `--user-data-dir`。**比较两张截图的 md5，相同就是没生效。**
4. **深色下 `meta theme-color` 要同步**。移动端 Safari/Chrome 的地址栏配色取 `meta[name=theme-color]`，不换的话深色页面顶上一条浅色地址栏。工具在引导脚本和切换脚本里都同步它：深色用 config 的 `dark.bg`，浅色读页面的 `--paper`。**页面里本来没有这个 meta 时**：深色会补一个，浅色只有在能读到 `--paper` 时才补（读不到就不凭空造，免得写个错的颜色进去）。
5. **CSS 过渡在 headless 的 virtual-time 下不推进**。`getComputedStyle` 会卡在过渡的起点值上——测深色配色时看起来"没生效"，其实是过渡没跑。测的时候加 `--force-prefers-reduced-motion`（外壳在 reduce 下把过渡关掉），别用截图里的像素下结论。
6. **`color-mix()` 只用在导航条背景**上，并配了 `var(--paper)` 兜底，老浏览器退化成不透明底色，不影响可读性。其余颜色全部是工具算好的十六进制/rgba，没有浏览器兼容问题。
7. **改完 config 不重跑注入，`--check` 以前照样说「已注入」**。以前 `--check` 只看 5 个标记在不在，
   配置改了（导航项、accent、深色底）它返回 0，人就以为没事——其实外壳还是旧的。
   现在靠**配置指纹**认（见 §3）：指纹与当前 config 不同 → exit 1 并打印新旧指纹。
   同理，**改了 `templates/style.css` 里的颜色也要回来核 §5 清单**，用 `node tools/check-shell.mjs` 守住。

## 9. 与博客实现的关系

`~/Documents/project/blog-xiuerhuahuazi/tools/import_readers.py` 是这个模式的**站点特化版**：品牌写死成 `xiuerhuahuazi`、导航写死成"双语书架/技术手记/关于"、深色配色写死成一组 hex、还要顺手塞 canonical、og 标签、`lang="en"`、键盘可达性补丁。它同时还负责"把精读项目搬进站点仓库"这件事——那部分跟外壳无关，是站点自己的导入逻辑。

**新站点不要照抄它，也不要改它**：直接用 `tools/inject-shell.mjs` + 一份自己的 config。区别：

| | `import_readers.py` | `tools/inject-shell.mjs` |
|---|---|---|
| 品牌/导航/配色 | 写死在脚本里 | config |
| 作用范围 | 导入 + 注入（还管 og/canonical/a11y） | **只注入** |
| 幂等 | 按 `id="site-mast-style"` 等标记判断 | 成对 begin/end 标记，整块替换 |
| 退出码 | 抛异常 | 0 / 1（`--check` 未注入 或 配置已变）/ 2（出错） |
| 干跑 | 无 | `--dry-run` |

博客仓库要迁到这个工具，是把 `import_readers.py` 里 `MAST_*` 那几段换成"调用 `node <skill>/tools/inject-shell.mjs <page> --config site.json`"，其余导入逻辑照旧。**注意**：博客站点自己的浅色底是 `#fbf8f3`、accent `#b0512b`，和精读页一致，所以 config 直接写这两组值即可；深色那组沿用博客现用的 `#15130f / #efe9dd`。

## 10. 自检清单（接站前跑一遍）

**先跑这一条**——它把 §5 清单、`templates/style.css`、注入产物三者对着验，缺一条就红：

```bash
node tools/check-shell.mjs      # 期望 6 项全 PASS，exit 0
```

它断言 6 项：文档 ↔ 代码对齐（§5 的 33 条逐条找）、幂等、退出码（未注入=1 / 已注入=0 /
config 缺失=2 / 配置漂移=1）、零外部资源、结构（`</html>` 收尾、`<body>` 各一次）、深色覆盖命中率（33/33）。
零依赖、无浏览器、不联网；全部在临时目录里跑，跑完清理。

**想手工复核某一个页面时**，再跑这几条：

```bash
node tools/inject-shell.mjs page.html --config site.json --check   # 期望 exit 0（配置一致）；配置变了是 1
node tools/inject-shell.mjs page.html --config site.json --dry-run # 期望「文件未改动」
md5 page.html; node tools/inject-shell.mjs page.html --config site.json; md5 page.html
# 两次 md5 相同 = 幂等
```

再人眼过一遍：浅色 / 深色各一张截图，导航条在位、两条吸顶栏不重叠、目录抽屉和灯箱在深色下不刺眼、打印预览是浅色。
