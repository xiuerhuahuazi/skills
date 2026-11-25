# 页面规格：布局、交互、视觉

> 目标：**正文永远是主角**。所有补充信息只在两种时刻出现——鼠标悬停时、以及读者主动滚到文末时。

---

## 1. 骨架

```
<header class=topbar>      固定：模式切换 / 字号 / 目录
<main id=top>               max-width 1420，padding 0 28
  <section class=hero>      两栏标题（EN 左 / ZH 右），meta 一行
  <section class=overview>  60 秒速览 + 5层vs1循环 对比卡（明确标"译者所加"）
  <div class=colheads>      sticky 列头：ENGLISH ORIGINAL / 中文译文
  <div id=reader>           每个 sec 一个 <section class=sec>
  <section class=appendix>  延伸阅读地图 / 术语表 / 译者注 / 原文笔误
<div id=card>               悬停浮层（绝对定位）
<div id=lb>                 图片放大层
<div id=toc>                目录抽屉
```

⚠️ **`<main>` 一定要有**。漏了它，max-width 不生效，双栏会被撑到满屏、中文贴边——这个 bug 看起来很"设计成那样"，其实是容器丢了。

---

## 2. 双栏与句级对齐

```css
.row{display:grid;grid-template-columns:1fr 1fr;column-gap:64px;position:relative}
.row::before{content:"";position:absolute;left:50%;top:0;bottom:0;width:1px;
  background:repeating-linear-gradient(var(--rule) 0 6px,transparent 6px 12px)}
```

- **一行 = 一个块（段落/列表）**，不是一句一行。句级对齐靠 id，不靠行高。
- 每个句对渲染成左右两个 `<span class="s" data-k="p3-7">`，`data-k` 两句相同。
- 悬停任一 span：两侧同时 `.hl`，同 `.row` 加 `.focus`，该块内其余句子降透明度到 0.46。
  **只在块内降透明**，不要全页降——全页降会让读者丢失位置感。
- 点击 span = 钉住（`2` 号键位之外唯一需要的鼠标操作），触屏靠它。

排版经验值（中文友好）：英文 18.5px/1.72 serif；中文 16.5px/1.95 sans，`text-align:justify`。
中文字号比英文**小 2px**、行高**大 0.2** 才不显得笨重。

---

## 3. 三类悬停卡（同一套组件，不同内容）

| 触发 | data 属性 | 卡片内容 |
|---|---|---|
| 外链 | `[data-link='L3']` | 「延伸阅读 · L3」+ 分级 chip + 目标标题 + 站点 + 这是什么 + 为什么值得点 + 页脚提示 |
| 术语 | `[data-term='eval']` | 「术语」+ 英文 · 中文 + 定义 + 打个比方 |
| 译注 | `[data-note='N2']` | 「译者注」+ 标题 + 说明 |
| 原文笔误 | `[data-typo='0']` | 「原文如此」+ 原句 + 说明 |

定位规则（**不遮挡正文**）：
```
vx = rect.right + 14；若溢出右边界 → rect.left - w - 14；再 clamp 到 12
vy = 垂直居中于目标；clamp 到 [12, innerHeight-h-12]
```
用 `position:absolute` + `pageXOffset/pageYOffset` 换算成文档坐标。
（`position:fixed` 在某些无头渲染里会掉层，见 05-pitfalls 第 3 条；绝对定位 + 滚动即隐藏更稳。）

---

## 4. 图片区

```
<figure class="row wide fig">
  <div class="fig-media">
    <img class="still" src=…>              ← 默认显示
    <img class="anim" src=… hidden>        ← 动图，默认隐藏
    <div class="fig-bar">[静帧][动图]</div>
  </div>
  <figcaption> 标题+图注 / 原文图注 / <details>这张图怎么看（N 条）</details> / 一句话 </figcaption>
</figure>
```

- **默认静帧**，用户点"动图"才播。不要让读者在阅读时被迫看动画。
- 点图片任意位置 → 全屏放大（2024px 宽的架构图里有小字，必须能放大）。
- `fig-bar` 默认 `opacity:0`，`figure:hover` 才出现——静止时是干净的一张图。

**必须加 `[hidden]{display:none!important}`**，否则 `.fig-media img{display:block}` 会覆盖 `hidden`，一张图渲染两份。

### 4.1 多图的两种排法：单图卡 / 叠卡轮播

> 2026-11-25 在技术手记里定下来的，读者页同样适用。

| 场景 | 排法 | 不许做 |
|---|---|---|
| 一张图 | 单图卡，正文原位内嵌 | 不给翻页箭头、圆点，滚轮与 ←/→ 一律无效 |
| 同一提示词的多版本、要横向比较 | 叠卡轮播：中间主卡 + 两侧各露一条边 | 不做等宽并排缩略图（细节全丢） |
| 多张图但有明确阅读顺序（步骤 1→2→3） | 单图卡按顺序排下去 | 不塞进轮播（读者会漏看后面几张） |

叠卡轮播的几何约束（都是踩过的）：

- **主卡尺寸按当前图自身的宽高比算**，画布高度 = 当前图高度；不要给容器固定比例再 `object-fit:contain`，否则图上下留出黑/白边。
- **侧卡宽度取主卡两侧的实际空隙**（`gutter`），并强制与主卡保持 14px 间距；按画布百分比写死侧卡宽，主卡一放大就会被压住。
- 切卡补 `width / height / left / top / transform` 的 0.5s 过渡；隐藏侧卡用 `opacity` 淡出 + `pointer-events:none`，不要 `visibility:hidden` 硬消失。
- 图片必须 `display:flex` 铺满按钮/卡片，`<button>` 默认垂直居中会把图顶到中间、上下各留一截空白。

### 4.2 点图之后去哪：提示词框 or 看图器

**按内容分流，不按位置分流**：

- 这张图**有提示词/参数**（生成类、复现类图）→ 打开提示词框：左图 + 圆点，右提示词 + 复制；框内点图再进看图器。
- **没有提示词**（参考图、截图、示意图）→ 只进普通看图器：深色遮罩、原图、图注、组内左右箭头、Esc / 点遮罩关闭。

三条交互硬规则：

1. **看图器独立成层**，层级高于提示词框；Esc 分层退出（先关看图器，再关提示词框）。
2. **←/→ 作用于当前最上层**：看图器开着就切看图器（同时把下层的图与标题同步），看图器关着才切提示词框；组内只有一张时方向键不动。别只绑提示词框的当前组——那样「从页面直接点开看图器」时键盘完全失效。
3. 箭头只在指针进入图片左右各 16% 区域时出现，透明度 0.75；组内仅一张图时箭头与圆点都隐藏（记得配 `.pm-nav[hidden]{display:none}`，否则组件的 `display:grid` 会把 `hidden` 盖掉）。


---

## 5. 模式与字号

- `body[data-mode]` ∈ `both` / `en` / `zh`；单语模式隐藏另一栏、`grid-template-columns:1fr`、
  并且 `.row:not(.wide){max-width:760px;margin:auto}`——否则单栏行长 130+ 字符，眼睛会累。
- 单语模式还要隐藏**纯另一语言的补充层**：EN 模式隐藏 `.h1-zh`、`.overview`、`.appendix`，中模式隐藏 `.h1-en`。只藏 `.cell.zh` 会留下「英文标题下面挂着中文标题」和整块中文速览——模板已修。
- 字号：调 `--fs-en` / `--fs-zh` 两个 CSS 变量，范围 0.85–1.32，存 localStorage。
- 全部交互状态（模式、字号）持久化，读者下次打开还是他习惯的样子。

---

## 6. 视觉基调（可直接复用的 token）

```css
--paper:#fbf8f3;  --card:#fffdf9;  --ink:#241f1a;   --ink-2:#574e45; --ink-3:#8c8175;
--rule:#e6ded1;   --accent:#b0512b; --accent-soft:#f7ebdf;
--hl:rgba(203,124,66,.17);
--serif:"Iowan Old Style",Palatino,Georgia,"Songti SC",serif;
--sans:"Microsoft YaHei","PingFang SC",system-ui,sans-serif;
```

- 暖纸底 + 陶土色强调，比纯白底更适合长读。
- 链接：`border-bottom:1px solid rgba(176,81,43,.42)` + 尾巴一个 `.62em` 的 `↗`，**只用虚线级别**。
- 术语：`border-bottom:1px dotted #7d6a3c`，可悬停时 `cursor:help`。
- 译注上标：小方块，陶土色字 + 浅底，不抢正文。

---

## 7. 打印与无障碍

- `@media print`：隐藏 topbar/card/lb/toc；`.row{page-break-inside:avoid}`；字号换成 pt。
- `[hidden]` 修正、`prefers-reduced-motion` 关掉所有过渡、`aria-hidden` 标在浮层与抽屉上。
- 目录抽屉可点遮罩关闭，ESC 关闭全部浮层。

---

## 8. 单文件交付

`build.mjs` 把 CSS / JS / 数据 / 图片全部内联，产物 `index.html` 约 2–3MB（图多时）。
好处：可邮件、可 U 盘、可离线、十年后还能打开。坏处：`build.mjs` 必须是唯一改动入口，别手改产物。

---

## 9. 数据表 / 代码块 / 视频图（模板已内置）

- **数据表** `table.bt`：每个单元格两行（EN 上、中文下），表头同构；外层 `.tbl-wrap` 横向滚动。单语模式按 `.th-en/.td-en` / `.th-zh/.td-zh` 隐藏另一语言。适合「成本表 / 分阶段耗时表 / 评测发现表」这类原文表格，**不要压成句对**。
- **代码块** `details.code-box`：默认折叠，`summary` 里是中文说明 + 右侧小字注释，`pre` 放英文原文。附录规格 / 示例代码「保留原文不翻译」时用它，不要塞进段落。
- **视频图**：`figures.json` 里带 `video_url` 时，图区右上角出现「看演示视频 ↗」，图注下追加一行播放说明；视频抽一帧内联为 `still`，离线可看，在线播放需联网。
- 这三类块都**不进句对系统**：check-content 用 [T] 单独验表格英文单元，附录代码块整段不参与句子比对；smoke 用 `data/` 里的数量做断言。

## 10. 题图（`meta.cover`）

标题与速览之间的一张整宽图：

```html
<figure class="cover"><img src="…"><figcaption>题图｜…</figcaption></figure>
```

- 封面只作氛围，**不做**「这张图怎么看」；图注里写清它与正文的关系（无关就直说）。
- 单文件模式 base64 内嵌；云端模式 `IMAGE_MODE=external` 时走 `media/`。
- 单语模式下题图保留（它不是语言层内容）。

## 11. 视频点播（内嵌）

`figureAssets[id].video` 存在时，图区变成：末帧海报 + 「▶ 播放（X MB · 已内嵌）」按钮 +
`<script type="text/plain" id="vid-figN">base64</script>`。点击后 app.js 解成 Blob URL 再播。

- **必须走 Blob，不要 data URI**（Safari 不稳）。
- 默认不自动播放；播完不循环。
- 角标「内嵌视频 · 离线可播」常显，不随 hover 隐藏。
- 图注第一条要说明「视频已内嵌 / 末帧停在 …」，且保留原站链接。

## 12. 云端模式（`VIDEO_MODE=external`）

- 视频：`<img class="video-poster" loading="lazy">` + 按钮（`data-src="media/x.mp4"`），点击才设 `src`。
- 图片：`assetUrl()` 直接返回 `media/<file>`，不再 base64。
- 首屏不请求任何媒体；HTML 只留文本。
- 服务器必须支持 Range/206 与 `media/*` 强缓存，见 `08-media-cloud.md`。
