# 流程详解：七阶段

> 顺序不能乱。阶段 3 之前没定契约、阶段 5 之前没建校验，后面全部返工。

---

## 阶段 0 · 抓取与勘察（30 分钟内完成）

**产出**：`data/article.md`（正文）+ 一份勘察笔记（段落数/图/外链/SVG）。

```bash
# 1. 抓正文（比 WebFetch 干净，省 token）
mkdir -p .tmp
npm_config_cache=<workspace>/.tmp/npmcache npx -y defuddle parse "<url>" --md -o data/article.md

# 2. 抓原始 HTML 存下来（defuddle 会吃掉 inline SVG；survey 与重建都要它）
#    curl 在部分沙箱里会静默不写文件（05-pitfalls #10），用 node fetch 更稳
node -e 'fetch(process.argv[1]).then(r=>r.text()).then(t=>require("fs").writeFileSync(".tmp/raw.html",t))' "<url>"

# 3. 数量对账（一条命令；写 data/survey.json，阶段 5 的 check-content 会再比一次）
node tools/survey.mjs .tmp/raw.html --article data/article.md

# 4. 外链存活与真实标题
#    逐条 fetch，记录 status / redirect / title；区域受限要如实标"链接有效、本区域打不开"
```

**勘察清单**（写进 SPEC.md，后面所有分工都靠它）：

- [ ] 段落数、H2/H3 层级
- [ ] 配图数量与类型（gif/png/svg），每张的原始尺寸；动图要单独看帧（首帧是否含全部信息）
- [ ] 外链总数、唯一目的地数、是否有重复锚文本指向同一页
- [ ] 有没有需要"文化搭桥"的梗（Conway's law、telephone game、Frankenprompt 这类）
- [ ] 原文笔误（拼写、缺空格、语法病句）——**这是加分项，不是挑刺**
- [ ] 原文**提取瑕疵**（被吞掉的空格、拼进正文的脚注编号、URL 转义括号留下的残渣）——与「原文笔误」分开记，见 05-pitfalls 第 13 条
- [ ] 文章日期与产品/模型名，避免把"当时的说法"当成永恒事实
- [ ] **表格**：几张、每张几行几列（defuddle 常吞表格，只留首列）
- [ ] **视频 / 音频**：几段、多长、首帧能不能当静态图（混合剪辑视频的首帧常与正文无关）
- [ ] **代码块**：附录/示例代码要不要保留英文原文（做 `code` 块）而不是硬翻
- [ ] **图组**：正文图是否被放在轮播/标签页组件里（DOM 里是一组 figure，页面要拆成独立图）

### 视频与封面（v2.1.0）

- 先数清 `<video>` 与 `og:image`/`cover_media`：视频要不要内嵌、封面放不放，都问用户（见 SKILL 四问）。
- 下载 mp4 到 `assets/`，用**最后一帧**当海报（`ffmpeg -sseof -0.2 -i in.mp4 -frames:v 1 poster.png`）。
- 压缩参数、内嵌点播、云端外置的完整规则见 `08-media-cloud.md`；这里只负责「素材到手」。
- `data/survey.json` 要记 `video` 数与 `cover` 数，后面 `check-content` 的 [S] 会拿来比。

### 原始 HTML 对账（defuddle 之后必做）

defuddle 的 markdown 会静默丢东西：没有 alt 的 `<img>`、表格除首列以外的列、`<br/>` 分隔的多行引用，都可能在 markdown 里消失。图/表/视频对不上就先别翻译。

**用 `tools/survey.mjs` 一条命令数完**（以前这段是手写 JS，每次重写、每次数错）：

```bash
node tools/survey.mjs .tmp/raw.html --article data/article.md
# 原始 HTML：figure=8 · img=8 · table=3 · video=0 · pre=0 · h2=6 · h3=2 · p=61
# 外链：锚点 19 · 唯一目的地 19
# article.md：img=2 · table=3 · pre=0 · links=19
# ✗ 对不上：图片：原始 HTML 8 个，article.md 2 个
```

它把数量写进 `data/survey.json`；阶段 5 的 `check-content` 的 [S] 会拿这份勘察数再比一次，
所以「阶段 0 数对了、后来数据里又丢了」也会被抓到。数量对不上就写一个临时 extractor，按原始 HTML 的 DOM 顺序逐元素重建（h2/h3/p/blockquote/ul/图+caption/表/视频/pre 依次输出）。重建后 `data/article.md` 才是权威，抽取瑕疵写进 SPEC（**不要**混进 `meta.typos`）。
2026-10 实测（Anthropic 长文）：defuddle 8 张图只留 2 张、3 张表格只剩首列，必须重建；表格在原始 HTML 里常是 `div[role=table]` 而不是 `<table>`，要按 div 行/单元格解析。

**动图处理**：用 Pillow 抽 7 帧看一眼。
```python
from PIL import Image
im = Image.open("fig1.gif"); n = im.n_frames
for i in range(n): im.seek(i); ...
```
大多数"动图"的信息量 ≈ 首帧，动画只是引导视线 → 页面默认显示静帧。

---

## 阶段 1 · 四问确认

见 `SKILL.md` 的硬门禁表。一次问完，四题一起给（`ask_user_question` 支持多题）。
**答完即视为设计确认，直接执行**；不要再问配色、目录、字体这类细节。

---

## 阶段 2 · 数据契约 + 并行分工

**先写 `SPEC.md`**（数据契约），再派活。没有契约就并行 = 三份互不兼容的数据。

分工原则：**译文由一人统一写**（语气/术语一致性最关键，不能拆），
**可分离的素材并行**（外链调研、术语表与图片解读），**页面与构建由 Lead 独占**。

| 角色 | 写什么 | 不碰什么 |
|---|---|---|
| Lead | `data/part-*.json`、`data/meta.json`、`src/*`、`build.mjs` | — |
| 外链侦察 | `data/links.json` | 其余全部 |
| 术语与图 | `data/glossary.json`、`data/figures.json` | 其余全部 |

派活时给**精确的 key 清单**（术语表要逐字给出 24 个 key），否则一定出现"多了/少了/拼错"。
并要求自查：`node -e "JSON.parse(...)"` + 条数核对，把输出贴回来。

给 teammate 的提示词要点（本项目实测有效）：

- 工作目录、任务 id、`team_task_get` → claim → 完成 → `send_message` 回报
- 本机 `curl` 可能不可用 → 用 node `fetch`；把脚本写成 `.mjs` 放临时目录再跑
- 允许用 `defuddle` 读长文，省 token
- **"只写这个文件，不要碰其他文件"** 要写在最前面
- 要求"真读内容，不要只看 title 猜"，并指定最该真读的 3–5 篇
- 要求回报里给"你发现的原文/链接问题"——这一栏经常有意外收获

---

## 阶段 3 · 逐句对照（最耗时，占 40%）

**切句粒度**：一个句号/问号/感叹号 = 一对。分号、破折号**不拆**（拆了中文会碎）。
列表项按"每条 = 一组句对"处理，一条里有几句就几对。
标题不译成句对，单独存 `head_en` / `head_zh`。

**边译边埋标记**（不要事后补，事后补必漏）：
- 外链：`<a data-link='L3'>…</a>`（左右两栏都要写，这是最容易漏的）
- 术语：`<span class='term' data-term='eval'>…</span>` —— **只标首次出现**，由 build 自动处理，手写时留空即可
- 译注：`<sup class='tn' data-note='N2'>2</sup>` —— 数字必须与阅读顺序一致
- 原文笔误：`<span class='typo' data-typo='0'>…</span>` —— 索引进 `meta.typos`

**翻译标准**（决定了成品是不是"高水平"）：

1. **限定词一律译出**：often / frequently / can / tends to / roughly —— 中文里补"经常""往往""大约"。
2. **术语首次出现带英文原形**：`技能（skills）`、`编排器（orchestrator）`。
3. **长定语拆成短句**，但不要拆掉因果与转折的连接。
4. **比喻保留但补一句解释**，放进译注，不要塞进正文。
5. **原文含糊就如实含糊**，并加一条译注说明"这是原文歧义，不是翻译问题"。
6. 不吹捧、不营销、不补原文没有的结论。

---

## 阶段 4 · 页面

见 `references/03-page-spec.md`。核心只有三条：
**双栏 grid 对齐 → 句级 id 双向高亮 → 补充信息只在悬停/文末出现**。

---

## 阶段 5 · 构建与自检

```bash
node tools/gate.mjs          # 构建 + 保真/闭合/结构 + 标签 + 交互冒烟 → 写 QA.md / QA.json
node tools/gate.mjs --shots  # 再加一套分区截图（也要人眼过）
```

`gate` 的退出码就是自动层的结论：0 全绿 / 1 有失败（含 AI 审校有「严重」）/ 2 环境问题（缺 Chrome 等）。
缺 Chrome 时 smoke 记「未验证」而不是「通过」——**没跑过的不许说通过**。

**必须人眼看的三处**：①首屏（标题两栏是否错位）②一张配图区（是否重复渲染）③附录（卡片高度/长文本换行）。
自动检查抓不到"难看"，只抓得到"坏掉"。

---

## 阶段 6 · 独立审校 → 修订 → 重跑

派一个 **fresh subagent**（不要 fork，避免继承你的自我合理化），任务是**只挑错、不改文件**。
提示词模板见 `references/04-qa.md`。

收到清单后按"严重/中等/轻微"分批改，**全部走脚本批量替换**（遍历 part 文件的句对做字符串替换，并把「命中 N 处 / 未命中列表」打出来），
不要手改 127 个句对——手改必漏，且没法复查命中率。审校时把 `references/07-cases.md` 一起给它，避免把正确的改法报成错误。

审校报告存 `QA-review.md`。改完**必须重跑 `node tools/gate.mjs`**：gate 会读这份报告数「严重」条目，
并把新的 `index.html` / `data` 哈希写进 `QA.md`。审校是基于旧构建的，改完要按新文本复核——
old `QA.md` 的哈希和新内容对不上，就说明它不能当这次交付的证据。

人眼确认三处截图后登记：

```bash
node tools/gate.mjs --confirm "看完首屏/配图/附录三张截图，可以交"
```

`--confirm` 会核对哈希：页面或数据改过就拒签，逼你重跑闸门。
