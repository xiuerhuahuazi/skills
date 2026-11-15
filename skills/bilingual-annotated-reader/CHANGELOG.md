## [2.1.0] — 2026-11-12

### Added

- **视频点播（单文件）**：`figureAssets[id].video` → mp4 以 base64 存进 `<script type="text/plain">`，
  页面显示末帧海报 + 播放按钮，点击才 `atob → Blob → createObjectURL`。走 Blob 而不是 `data:` URI，
  因为 Safari 对 data URI 视频不稳（WebKit #232076）。
- **题图**：`meta.cover`（asset / alt / caption_zh），渲染在标题与速览之间；不进 figures、不计入配图数。
- **云端版**：`VIDEO_MODE=external IMAGE_MODE=external MEDIA_BASE=media/` 构建 `cloud/index.html`，
  媒体全部外置；`tools/publish.mjs` 一条命令产出「单文件 + cloud/ 」并打印体积。
- `build.mjs` 支持 `node build.mjs <out>` 指定输出文件。
- 模板支持有序列表（`{"t":"ul","ol":true}`）。
- 新参考 `references/08-media-cloud.md`：压缩参数（`-crf 30 -tune animation`，实测 8.8→3.2 MB、SSIM≥0.989）、
  体积预算、Range/206、nginx/Caddy 缓存头、HLS 时机、媒体坑位。

### Changed

- `scaffold.mjs` 版本 2.1.0，tools 增加 `publish.mjs`；`--refresh --src` 会覆盖 `src/` 与 `build.mjs`。
- `smoke` 的「视频播放入口」仍数 `.fig-bar .vbtn`：视频图必须保留原站链接。
- 图片默认加 `loading="lazy" decoding="async"`。

### Migration

已有项目：`node scaffold.mjs --refresh <项目> --src` → `node tools/publish.mjs` → `node tools/gate.mjs --shots`。
自定义改动（如 sdlc 的「耐久原则」标签、code-review 的 ol）已并进模板或改用 `meta.principle_label_*`。

# Changelog

本文件记录 `bilingual-annotated-reader` 自身的改动。项目级的改动写在项目里，不写这里。

## [2.0.0] - 2026-11-10

从「一份靠 AI 自觉执行的说明」改成「有工具、有证据、有反馈入口的工作系统」。动机：5 篇成品的实测
——校验报 ✓ 但退出码恒为 0、macOS 上冒烟脚本默认跑不起来、3/5 项目还在用旧脚本、没有任何一处留下证据。

### Added

- `tools/gate.mjs`：一条命令跑构建 + 保真/闭合/结构 + 标签 + 冒烟，写 `QA.md` / `QA.json`；
  退出码 0/1/2（**没跑过的层不算绿**；确属有意跳过加 `--allow-partial`）；`--confirm` 登记人工确认并绑定 `index.html`、`data/` 的 sha256（内容一改即失效）。
- `tools/chrome.mjs`：三平台自动探测 Chrome，找不到 exit 2 并提示 `CHROME=`。
- `tools/survey.mjs`：阶段 0 用原始 HTML 数图/表/视频/代码/外链，写 `data/survey.json`。
- `check-content` 新增 [S] 结构对账（配图引用=定义、原文图数、表格行数、survey 对比）
  与 [W] 漂移扫描（程度词 / 数字 / 术语首次译法，警告级，可 `--strict-drift`）。
- `scaffold.mjs --refresh <项目>`：旧项目同步 `tools/`；`--src` 才覆盖 `src/` 与 `build.mjs`。
  scaffold 写入 `data/skill.json`（skill 版本）。
- `references/06-feedback.md`：反馈入口（工具 / 样例 / 文档三选一）、单次 vs 长期规则、台账。
- `references/07-cases.md`：真实好坏译对照（含「警告不是判决」的反例）。
- `references/05-pitfalls.md`：新增「由谁兜住」归因表 + #23 Chrome 路径、#24 假绿、#25 工具快照。

### Changed

- `check-content` 退出码：0 通过 / 1 内容错误 / 2 环境错误；缺 `index.html` 报错（`--allow-no-html` 可跳过）。
- 差异判定从「≤1 处放行」改为「任何非空白差异都必须备案」；纯空白差异自动识别，不再需要手配。
- `check-content` 把 `<br/>` 换成空格再比对（原 #17 的绕法不再需要）。
- `smoke` / `shots` 删除写死的 Windows Chrome 路径。
- `SKILL.md`：阶段 5 改为 `gate.mjs`；补「交付四态」；修正「项目差异只进两个文件」的错误说法
  （实际还有 `part-*.json` 等 `data/` 文件）；补「项目里别手改 tools」。

### Fixed

- 以前 `check-content` 恒返回 0，且单条差异仍打印「✓」（实测注入 4 句伪造英文仍 exit 0）。
- 以前没有 `index.html` 时 D–H 静默跳过、仍报通过。
- 以前笔误「标记数 ≠ 备案数」不提示，现在给警告。
- 以前 `check-tags` 与 `check-content` 的差异从不写入任何可复核的文件。
- `--confirm` 被拒时，旧的「已确认」不再留在 `QA.md` 里。
- `[S]` 表格行对账把表头算进页面侧（原来有表头必误报）。

### Known limits

- 语义层（译得对不对、外行读不读得懂）仍靠 AI 审校 + 人眼；漂移扫描只给候选清单。
- 模板 `build.mjs` 未加断言（`claude-code-review` 的 `<ol>` 支持尚未回灌模板，待定是否通用）。
- `shots.mjs` 只产出截图，不做断言。
