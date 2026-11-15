# 数据契约

> 所有内容都在 `data/*.json`，页面由 `build.mjs` 静态渲染成 HTML（不在浏览器里拼 DATA）。
> 好处：可 grep、可 diff、可批量改、打印友好。

---

## 目录

```
data/article.md       defuddle 抓下来的原文（权威）
data/config.json      项目差异：术语正则 + 图片映射
data/meta.json        标题/速览/译注/笔误/页脚
data/part-1..N.json   正文，按小节切分，parts 按文件名排序拼接
data/links.json       外链调研
data/glossary.json    术语表
data/figures.json     配图解读
```

---

## 媒体字段（v2.1.0）

- `config.figureAssets[id]`：`still`（静态图）/ `anim`（gif 等动图）/ `video`（mp4，走「点播」）。
- `config.videoMode`：`inline`（默认，mp4 base64 内嵌）/ `external`（媒体外置，云端版用）。
  也可用环境变量临时覆盖：`VIDEO_MODE=external IMAGE_MODE=external MEDIA_BASE=media/ node build.mjs cloud/index.html`。
- `config.imageMode`：`inline`（默认）/ `external`（图片也外置）。
- `meta.cover`：`{ asset, alt, caption_zh }`，渲染在标题与速览之间；不进 `figures.json`、不计入配图数。
- `build.mjs` 支持第一个位置参数指定输出文件（`node build.mjs cloud/index.html`）。
- `node tools/publish.mjs` 一次产出单文件 + 云端版，规则见 `08-media-cloud.md`。

## config.json

```json
{
  "termPatterns": [
    { "key": "eval", "en": "\\bevals?\\b|\\beval set\\b", "enFlags": "i", "zh": "评测" }
  ],
  "figureAssets": {
    "fig1": { "still": "fig1-still.png", "anim": "fig1.gif" },
    "fig2": { "still": "fig2.png", "anim": null }
  }
}
```

- `key` 必须与 `glossary.json` 的 key 完全一致，否则该术语不会标注。
- `en` 是**正则字符串**（JSON 里反斜杠要写两次）。`zh` 也是正则。
- `zh` 用于在同一句对的中文里找对应词；找不到就只标英文，不报错。
- 每个术语**全文只标第一次命中**，由 build 保证，不需要在数据里控制。
- `zh` 正则写**中文短名**即可（`智能体`、`运行框架`），与 glossary 的 `zh` 保持一致；不要带「（agent）」这种英文括号，否则下划线会标到括号上、和术语卡对不上。
- 复数写法：harness 的复数是 `harness(es)?`；写成 `harnesses?` 实际匹配 "harnesse(s)"，永远标不到单数。
- 某术语的所有出现都嵌在 `<a>` 里时 build 会跳过（如 Claude Agent SDK），check-content 会列为「术语表未标注」——可接受，术语表仍收录。
- ⚠️ 不要在 shell 里拼这个文件（见 05-pitfalls 第 6 条）。

---

## meta.json

```json
{
  "title_en": "", "title_zh": "", "subtitle_zh": "",
  "source_url": "", "published": "", "org_en": "", "read_min": 14,
  "overview_title_zh": "60 秒速览：这篇文章在说什么",
  "overview_zh": ["**一句话结论**：…", "…"],
  "overview_foot_zh": "读法建议：…",
  "compare_zh": {
    "left_title": "常见搭法：5 层结构", "left_items": ["…"],
    "right_title": "本文建议：1 个循环", "right_items": ["…"],
    "foot_zh": "…"
  },
  "notes":   [ { "id": "N1", "title_zh": "…", "body_zh": "…" } ],
  "typos":   [ { "quote_en": "…", "body_zh": "…" } ],
  "foot_zh": "版权与说明",
  "link_stats": { "refs": 19, "images": 3 }
}
```

- `overview_zh` / `compare_zh` 是**译者加的速览**，不是原文；渲染时会明确标注"译者所加"。
- `link_stats.refs` 填**正文锚点总数**（同一链接出现两次算两处）；「指向 N 个不同链接」由 build 按 links.json 条数自动算。封面词数/字数由 build 自动统计（含表格单元与代码块），不用手填。
- `notes` 的**数组顺序 = 正文上标编号**。若在中间插入新译注，后面的编号全部顺移——记得同步改 `data-note` 的数字标签。
- `typos` 也按数组下标被 `data-typo='0'` 引用。

---

## part-N.json（正文）

```json
{
  "id": "fold", "num": "03", "level": 2,
  "head_en": "How to fold subagents into the main agent loop",
  "head_zh": "怎样把子智能体折叠进主循环",
  "gist_zh": "本节要点（译者所加，2-3 句）",
  "blocks": [
    { "t": "p", "s": [["English 1", "中文 1"], ["English 2", "中文 2"]] },
    { "t": "ul", "items": [ [["EN","ZH"],["EN","ZH"]], [["EN","ZH"]] ] },
    { "t": "ul", "depth": 1, "items": [ [["EN","ZH"]] ] },
    { "t": "h3", "en": "Task-completion evals", "zh": "任务完成度评测" },
    { "t": "fig", "fig": "fig1" },
    { "t": "principle", "s": [["EN","ZH"]] },
    { "t": "callout", "s": [["EN","ZH"]] }
  ]
}
```

- `level: 0` = 无标题的引言段（不生成 h2、不进目录）；`2` = h2 小节。
- **每个数组元素都是一对 [英文, 中文]**，这是"逐句"的物理保证。段对段不行。
- 块类型：`p` 段落 / `ul` 列表（`depth:1` 为嵌套）/ `h3` 小标题 / `fig` 配图 / `principle` 整宽底色块（`label_zh`/`label_en` 覆盖默认标签「设计原则」，`s` 第一条常放加粗小标题；同一篇里可写「设计原则 3」「经验教训 2」这类编号）/ `callout` 前置提示框、更新说明、引文 / `foot` 原文脚注条（`n` 为脚注号，`s` 为句对，渲染成窄幅双栏）。
- 新增块类型：`table` 数据表（`head` / `rows` 都是 `[[英文, 中文], …]`，渲染成双语表格，**不参与句对系统**，由 check-content 的 [T] 单独校验）、`code` 附录代码块（`label_zh` / `note_zh` / `text`，默认折叠、保留英文原文不翻译）。
- 块顺序即渲染顺序。

---

## 行内标记（写在 en / zh 字符串里）

| 用途 | 写法 | 说明 |
|---|---|---|
| 外链 | `<a data-link='L3'>锚文本</a>` | build 自动补 `class='lnk' href target rel`；**两栏都要写** |
| 术语 | `<span class='term' data-term='eval'>eval</span>` | 一般由 build 自动加，手写只在特殊位置补救 |
| 译注 | `<sup class='tn' data-note='N2'>2</sup>` | 数字=阅读顺序，须与 `meta.notes` 顺序一致 |
| 原文笔误 | `<span class='typo' data-typo='0'>the dozen of</span>` | 索引进 `meta.typos` |
| 加粗 / 斜体 | `<b>` `<i>` | 不要用 `**`，那是 markdown，不会渲染 |

**属性一律用单引号。** 因为整段是 JSON 字符串，双引号要转义成 `\"`，127 个句对里漏一个就整份解析失败。
同理：中文标点用「」，英文引号用 `“ ”`，**不要出现裸的 ASCII `"`**。

---

## links.json

```json
{ "links": [ {
  "id": "L1", "anchor_en": "migration kit", "anchors_zh": ["迁移工具包（开头提示框处）"],
  "url": "https://…", "site": "github.com",
  "title_en": "…", "title_zh": "…",
  "what_zh": "这是什么：一句话（30-60 字）",
  "why_zh": "为什么值得点：它补足了本文哪句话（40-90 字）",
  "tier": "必读", "order": 3, "access": "ok",
  "digest_zh": "不点开也能拿到的重点（2-4 句）",
  "key_points_zh": ["…"], "access_note_zh": ""
} ] }
```

- `tier` ∈ 必读 / 背景 / 可选；`order` 是建议阅读顺序，1 起、连续不重复。
- `access` ∈ ok / region_blocked / redirect —— 区域受限**不是链接失效**，要如实区分。
- `anchors_zh` 必须**照抄正文里那段链接文字**，否则文末"正文对应"对不上（审校会抓）。
- 每条都必须有 `digest_zh`：让"一次都不跳转"的读者也不吃亏，这是这套方案成立的前提。

---

## glossary.json

```json
{ "terms": [ { "key": "harness", "en": "harness", "zh": "harness（运行框架）",
  "def_zh": "30-70 字，先讲是什么", "analogy_zh": "可选，≤40 字" } ] }
```

- `key` 与 `config.termPatterns[].key`、正文 `data-term` 三处必须一致。
- **`zh` 必须与正文首次出现时的译法逐字一致**——否则悬停卡显示的是另一套名字，读者会以为是两个概念（这是审校必抓项）。

---

## figures.json

```json
{ "figures": [ { "id": "fig1", "alt_en": "subagent design",
  "title_zh": "常见设计 vs. 本文建议", "caption_zh": "双语图注 60-120 字",
  "how_to_read": ["怎么看 1：落到图上的具体英文标签…", "…"],
  "takeaway_zh": "一句话结论 20-40 字",
  "frame_note_zh": "动图说明（静图留空）" } ] }
```

- `how_to_read` 每条 25-60 字，**必须锚定图上的真实英文标签**——那是读者在图上唯一的抓手。
- 不要写"这张图展示了架构对比"这种对任何图都成立的空话。
- 视频段落用 `video_url` + `frame_note_zh`：从视频抽一帧当 `still` 内联（离线可看），页面在图下给「在线播放原视频」入口。`frame_note_zh` 写「本页展示的是视频中的一帧」，**不要写「首帧」**——混合剪辑视频的首帧往往和正文无关；选帧选信息量最大的一帧，并在 note 里说明。
