---
name: bilingual-annotated-reader
description: 把一篇英文长文（论文、博客、官方文档）做成「左英文原文、右中文译文、逐句悬停联动」的可读网页，配术语悬停卡、译者注、配图逐条解读、外链延伸阅读地图，产出单个离线可双击打开的 HTML。当用户给出英文文章链接/长文并要求「双语对照 / 精读 / 翻译并注解 / 让小白看懂 / 做成可读页面 / 英中对照」时使用。Use when turning an English article into a sentence-aligned bilingual reading page with hover-linked sentence pairs, glossary tooltips, figure walkthroughs, and a curated link map.
---

# 双语对照精读页

> 当前版本 **v2.3.2**（2026-11-25）。改动记录见 `CHANGELOG.md`；收到反馈怎么进下一版见 `references/06-feedback.md`。

## 这套 skill 交付的不是"译文"，是"一页能读完的东西"

用户说"翻译"时，真正要的往往是：**一个外行把这篇专业长文读完并且看懂**。所以成品是网页，不是译文；质量重心在三处——**逐句对齐、原文保真、补充层不打断阅读**。

一句自检：**把页面关掉，你能不能凭它复述原文的论证链？** 不能，就是补充层没做好。

## 硬门禁：动手前必须过四问

一次问完（用 `ask_user_question`），每项都给推荐项。**不要自己替用户选**，也不要问了不用。

| 决策 | 选项 | 默认推荐 |
|---|---|---|
| 交付形式 | 单文件 HTML（双击即读） / Markdown 双栏 / HTML+PDF | **单文件 HTML**——只有它能实现句级联动 |
| 外链怎么处理 | 三层渐进（正文极简+悬停卡+文末地图） / 原文式+清单 / 内联展开 | **三层渐进** |
| 图片怎么处理 | 原图+双语图注+"怎么看"+静帧/动图切换 / 再加中文重绘 / 只放原图 | **原图+解读** |
| 视频怎么处理（有视频时加问） | 内嵌点播（压缩后 base64 进单文件，6 MB 级） / 末帧定格+原站链接（2 MB 级） / 外置 `media/`（云端） | **单文件用内嵌点播，云端用外置**（见 `references/08-media-cloud.md`） |
| 小白友好层 | 速览+术语卡+每节要点+译注 / 再加白话版逐段复述 / 只做精准翻译 | **全量（不加白话版）** |

用户答完 = 设计确认，直接开工；**不要**再为"要不要加目录""配色用什么"反复确认。

## 七阶段流程

| 阶段 | 产出 | 关键动作 | 细节 |
|---|---|---|---|
| 0 抓取勘察 | `article.md` + `data/survey.json` | defuddle 抓正文；**`tools/survey.mjs` 对账原始 HTML**（图/表/视频/代码/外链），对不上就重建；逐个 head 请求查外链存活 | `references/01-pipeline.md` |
| 1 四问确认 | 决议 | 见上表 | 本文 |
| 2 数据契约 | `SPEC.md` + 并行分工 | 定 JSON schema，派两名 teammate 分别做外链与术语/图 | `references/02-data-contract.md` |
| 3 逐句对照 | `data/part-*.json` | 手动切句、逐句译；同步埋链接/术语/译注标记 | `references/02-data-contract.md` |
| 4 页面 | `src/{template,style,app}` | 双栏 grid、句级联动、三类悬停卡、数据表/代码块/图（单图卡或叠卡轮播、提示词框、看图器）、题图（`meta.cover`）、视频点播（内嵌/外置） | `references/03-page-spec.md` §4.1–4.2 |
| 5 构建自检 | `index.html` + **`QA.md`** | **一条命令 `node tools/gate.mjs`**：构建 → 保真/闭合/结构 → 标签 → 冒烟，写证据；截图人眼过一遍。交付两种形态用 `node tools/publish.mjs`（单文件 + `cloud/`）。**发布前先跑 `python3 tools/slim-media.py`**：素材转 WebP + 按显示尺寸收敛 | `references/04-qa.md`、`08-media-cloud.md` |
| 6 独立审校 | `QA-review.md` → 修订 | 派 fresh subagent 只挑错不改文件；改完重跑 gate；确认后 `gate.mjs --confirm "…"` | `references/04-qa.md` |

## 三条不可妥协的质量线

1. **英文列逐字保真。** `check-content` 会把每句英文回查原文；差异只允许三种：原文笔误（照录并在"原文笔误"栏备案）、你补的排版空格（自动识别，不用手配）、或 `meta.allowed_diffs` 显式备案。**绝不"顺手润色"原文的限定词**——`often` 不是 `always`，`frequently` 不是 `always`。
2. **层与层不许打架。** 正文只留极轻的虚线；信息只在**悬停**时出现且**不遮挡正文**；完整清单只在**文末**。任何时候都不要为了"让读者看到"而把摘要塞进正文。
3. **每句译文都能指回原文那一句。** 数据里就是句对，不是段落对。段对段会让读者永远在猜"这句对应哪句"。

## 交付四态（每篇都要能回答）

`gate.mjs` 把状态写进 `QA.md` / `QA.json`，这是唯一凭证：

| 状态 | 谁给 | 判据 |
|---|---|---|
| 自动验证 | `gate.mjs` 退出码 | 构建 + check-content + check-tags + smoke 全绿（0）。缺 Chrome 或 `--no-smoke` 时记「部分未验证」，退出码非 0（确属有意跳过才加 `--allow-partial`） |
| AI 评估 | `QA-review.md` | 独立审校的「严重」条目数 = 0 |
| 人工确认 | `gate.mjs --confirm "…"` | 人看过三张截图；登记时绑定 `index.html`/`data` 哈希，内容一改即失效 |
| 尚未验证 | 上面没覆盖的 | 列在 `QA.md` 的「未验证」行 |

**没有 `QA.md` 就不许说「验证通过」。** 这不是格式要求，是防止"改完没重建""审校基于旧构建"这类假通过。

## 复用方式（新建 / 升级已有文章）

```bash
# 新建
node <skill>/tools/scaffold.mjs <目标目录> --article <原文.md>
# 已有项目：只同步 tools/（src/ 默认只报差异，加 --src 才覆盖）
node <skill>/tools/scaffold.mjs --refresh <项目目录>
```

新建生成：`build.mjs` + `src/` 三件套 + `tools/` 十一个脚本（含 `publish.mjs`、`inject-shell.mjs`、`check-shell.mjs`、`slim-media.py`）+ `data/skill.json`（记录 skill 版本）。
**项目差异只进 `data/`**：`config.json`（术语正则、图片映射）、`meta.json`（标题/速览/译注/笔误）、
`part-*.json`（逐句对照）、`links.json`、`glossary.json`、`figures.json`、`article.md`、`survey.json`。
`src/` 与 `tools/` 是模板快照——**不要在项目里手改 tools**，改了用 `--refresh` 会丢；要改就改 skill 再刷新。

两种交付由同一条命令产出（v2.1.0 起）：

```bash
node tools/publish.mjs        # index.html（单文件内嵌）+ cloud/index.html + cloud/media/（外置）
node tools/publish.mjs --no-cloud   # 只出单文件
```

媒体标准（压缩参数、体积预算、Range/缓存、HLS 时机）见 `references/08-media-cloud.md`。

**接进自己的站点**（给成品页加导航条 + 品牌 + 深色主题，不改精读页本身）：

```bash
node <skill>/tools/inject-shell.mjs <成品页.html> --config <站点配置.json>
node <skill>/tools/check-shell.mjs        # 外壳自检：文档↔代码对齐 / 幂等 / 退出码 / 零外链 / 结构 / 深色覆盖
```

配置模板 `templates/shell.config.example.json`；注入点、写死浅色清单、幂等与已知坑见 `references/09-site-shell.md`。
`--check` 现在会认出**配置漂移**（外壳还在、但配置改过了），别再把「已注入」当成「配置是新的」。

## 反模式（做到就是白干）

- **只交译文**。用户要的是读完，不是看字。
- **内联展开摘要**。会撑高行高，直接毁掉左右逐句对齐。
- **每个术语出现都标注**。页面会变成下划线森林。每术语全文只标首次。
- **动图强制播放**。默认静帧，用户点才播。
- **段落级对齐**。看着整齐，实际对不上。
- **修改原文**。哪怕明显笔误，也照录 + 备案，不静默改。
- **替用户补结论**。原文没有的数字、案例、因果，一律不补。
- **只信 defuddle 的 markdown**。它会静默丢图、吞表格列；`survey.mjs` 数不对就按原始 HTML 重建。
- **导读把早期做法写成最终做法**。文章讲版本演进时，速览/对比卡要按版本分别写，否则一进正文就自相矛盾。
- **在项目里手改 `tools/`**（副本会分叉，skill 修了也传不下去）。
- **把视频 base64 塞进要上云的页面**。base64 只适合单文件分发：+37% 体积、无法缓存、无法 Range 拖动、首屏要解析整段。云端一律走 `cloud/` + 外置 `media/`。
- **直接内嵌未压缩的 mp4**。先 `-crf 30 -tune animation -an -movflags +faststart`，8.8 MB 能压到 3.2 MB；不压就把单文件从 6 MB 抬到 14 MB。
- **把 3840px 的原始 PNG 原样放进 `assets/`**。页面只显示一千多像素，多出来的像素全是下载时间：先 `python3 tools/slim-media.py`（转 WebP + 按显示尺寸收敛），实测图片体积能砍 55–85%。
- **只压 quality 不收敛尺寸**。同一张图 3840px → 2000px 再编码，比「原尺寸低质量」又小又清楚；反过来 PNG 只降质量不降尺寸，重编码后经常**比原图还大**。
- **给容器定死比例再 `object-fit:contain`**。比例和图不一致的那一边必然留白；按当前图 `ar` 算容器高。
- **叠卡侧卡按画布百分比写死宽度**。主卡一放大就压住侧卡，宽度要取两侧实际空隙。
- **用 `visibility:hidden` 换卡**。看起来是硬切；用 `opacity` + `pointer-events:none`，位置尺寸上 0.5s 过渡。
- **键盘只绑提示词框的当前组**。看图器打开后 ←/→ 会失效或改错层；方向键要作用于最上层。
- **跳过 gate 直接交**，或拿旧的 `QA.md` 当这次的证据。

## 反馈与版本

- 用户说一句「不对」→ 按 `references/06-feedback.md` 走：能程序判的进工具，能举例的进 `07-cases.md`，纯判断的进文档。
- 单次要求写进该项目的 `SPEC.md`，**不进 skill**；同类第二次出现才升级为规则。
- 改完 skill 跑回归：把 5 篇成品 `cp -R` 到 `/tmp/bil-fixtures/` 再跑 gate（成品目录只读，别在里面构建），别把原来绿的跑红。

## 已知坑（都踩过，直接看修法）

`references/05-pitfalls.md`：`[hidden]` 被 `display:block` 覆盖导致图片渲染两份、headless Chrome 最小窗口 512px 造成"移动端溢出"假象、CSS 过渡在 virtual-time 下不推进导致浮层截图空白、负 margin 切片超过 ~20000px 白屏、`String.replace` 的 `$` 语义吃掉模板、shell 里的正则转义少一层把 `\b` 变成退格符、defuddle 丢图吞表、单语模式漏藏封面标题、headless localStorage 让两张模式截图相同、版本演进文章的导读与正文矛盾、Chrome 路径写死导致 macOS 上假失败、校验"报 ✓ 却 exit 0"的假绿……

视频内嵌/云端相关的坑单列在 `references/08-media-cloud.md`：data URI 在 Safari 不稳（要用 Blob）、base64 与 HTTP 缓存互斥、Range/206、海报懒加载、`shots/_*.html` 在含视频项目里会复制出 200 MB。

**动手前先扫一遍，能省一小时。**
