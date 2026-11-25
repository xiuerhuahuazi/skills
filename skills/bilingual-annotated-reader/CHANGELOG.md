## [2.3.2] — 2026-11-25

### Added

- `references/03-page-spec.md` 新增 §4.1「单图卡 / 叠卡轮播」与 §4.2「点图之后去哪：提示词框 or 看图器」：
  按图内容分流（有提示词进提示词框，无提示词只进看图器）、看图器独立成层与 Esc 分层、
  方向键作用于最上层、单图隐藏箭头圆点、箭头只在左右 16% 以 0.75 透明度出现、叠卡主卡按图 `ar` 实时算尺寸与 14px 间距。
- `references/05-pitfalls.md` 新增 35–37：按钮居中 + 固定比例造成上下空白（含 `ar` 数据核错）、侧卡百分比宽度被主卡压住、
  硬切与键盘只切错层。
- `SKILL.md` 反模式新增四条对应项。

### Notes

- 无工具/模板改动，不触发 gate 回归；来源是 2026-11-25 技术手记的图片呈现迭代（空白 → 重叠 → 硬切 → 单图控件 → 看图器键盘）。
- 版本号 `2.3.1` → `2.3.2`（`scaffold.mjs` 的 `VERSION` 同步）。

## [2.3.1] — 2026-11-20

### Fixed

- **正文图不再用 `loading="lazy"`（inline 模式）**：单文件交付里图片本来就是 data URI，lazy 只会让首屏与截图晚一拍。
  `build.mjs` 现在只在 `IMAGE_MODE=external`（云端版）时才给 `<img class="still">` 加 `loading="lazy"`。
  来源：2026-11-20 做 Anthropic《The components of agent memory》，15 张图在分区截图里全是空白。
- **`shots.mjs` 补 `--run-all-compositor-stages-before-draw`**：截图一直带 `--force-prefers-reduced-motion`，
  而页面 CSS 里有 `@media (prefers-reduced-motion:reduce){*{transition/animation:none!important}}`；
  这个组合下，data URI 大图在 8s 虚拟时间预算内来不及上屏，截出空白。实测把预算提到 30s 能出图，但 31 张太慢；
  加这个 flag 后 8s 稳定出图（同一页 110 KB 空白 → 432 KB 实图）。

### Changed

- 版本号 `2.3.0` → `2.3.1`（`scaffold.mjs` 的 `VERSION` 同步）。

## [2.3.0] — 2026-11-19

### Added

- **图片瘦身工具** `tools/slim-media.py`：把 `config.figureAssets`（still / anim）与 `meta.cover.asset`
  指向的 jpg / png 转成 WebP、按显示尺寸收敛，并回写这两个 JSON。支持 `--all` / `--dry` / `--backup` / `--gif`；
  原图留在 `assets/` 不动，回滚只需改 JSON。依赖 Pillow，缺依赖退出 2 并给安装命令。
  - 参数是实测定的：照片长边 1600、图稿 2000，质量阶梯 78/74/70 与 84/80/76，单图目标 ≤ 260 KB，收益 < 8% 不换名。
  - `--gif` 走 ffmpeg 重做调色板（12fps / 1200px / 128 色）；**不要**用 Pillow 存 animated WebP 作为替代路径。
  - `scaffold.mjs` 把新工具纳入 `TOOLS` 快照，`--refresh` 会一起同步。
- `references/08-media-cloud.md` 新增 §0「图片瘦身（发布前必做）」：体积预算表、一条命令、参数依据、实测对照、
  五条坑（PNG 不降尺寸会变大 / 调色板对照片一般 / JPEG 压不动彩铅插画 / animated WebP 反而更大 / 换素材不重建等于没换）。
- `SKILL.md` 阶段 5 加上发布前瘦身步骤；反模式新增两条（原始 3840px PNG 直接入 assets、只压 quality 不收敛尺寸）。

### Changed

- 版本号 `2.2.2` → `2.3.0`（`scaffold.mjs` 的 `VERSION` 同步）。

### Notes

- 来源：博客第十五篇上线后，用户实测 Grok 精读页 4 张图 1.3 MB、加载慢。全站 15 篇处理后图片 13.6 MB → 4.5 MB（−67%），
  单篇最重 1.3 MB → 0.82 MB；样本 PSNR 34–45 dB，人眼对比无可察差异。
  （2026-11-19 更正：1.3→0.82 MB 的是 Grok 页，并非「单篇最重」；最重页实为 harness-reader 1.83→0.28 MB，grok 仅排第 5。）
- 视频不在此列：这些页的视频都是按需加载（先出海报），fable/harness 的 mp4 已是 ~216 kb/s，再压收益有限。

## [2.2.2] — 2026-11-16

### Fixed

- **坑 31 的机制写错了**（`references/05-pitfalls.md` #31，同源订正 `references/09-site-shell.md` §7）：
  原文说「headless 下 `startViewTransition` 的回调不执行」，实测（Chrome 157）是**回调会执行**——
  `--dump-dom` 无虚拟时间时看不到 `data-theme` 变化，加 `--virtual-time-budget=2000` 或用真实浏览器点击都会变。
  真实机制是回调在**后续渲染步骤**才跑，任何**同步快照**（`--dump-dom`、立刻截图）读到的都是变更前状态。
  #31 与 §7 按此改写：状态同步改、过渡交给 CSS、`startViewTransition` 只留给跨文档导航。
- **`check-shell.mjs` 的假绿通道**：`parseMustChange()` 只认带反引号的表格行，其余行**静默跳过**——
  往 §5 表里插一行不带反引号的 `.fake-hardcoded`，自检仍然 `ALL PASS`。现在统计 §5 表从表头到表尾的**数据行数**
  （不计表头与 `|---|` 分隔行），与解析条数不等即 FAIL 并退出 1：
  `§5 表格有 N 行数据，只解析出 M 条（检查表格格式：选择器要用反引号包住）`。
- **`SKILL_ROOT` 只写在提示里、代码没实现**：`findSkillRoot()` 现在先读 `process.env.SKILL_ROOT`
  （存在且含 `references/09-site-shell.md` 就用它），再走原来的候选路径——脚本拷到别处、或在项目里跑都能指定 skill 根。

## [2.2.1] — 2026-11-16

### Added

- **外壳自检工具** `tools/check-shell.mjs`（零依赖、无浏览器、不联网、无参数运行）：
  把「深色覆盖」从**文档里的说法**变成**机器能验的事实**。断言 6 项并逐行打印 `PASS/FAIL`：
  1. **文档 ↔ 代码对齐**——从 `references/09-site-shell.md` §5 抽出选择器清单，逐条在 `templates/style.css`
     （按 CSS 规则块解析，不靠全文 substring）与注入产物的 `[data-theme="dark"]` 规则里找得到；
     §5 列为「不用换的」的选择器不要求有深色规则，但必须在 `style.css` 里存在。
  2. **幂等**——同一 fixture 注入两次字节相同。
  3. **退出码**——未注入=1 / 已注入=0 / config 缺失=2 / 配置漂移=1。
  4. **零外部资源**——注入新增块里没有 `src="http`、`href="http`（`<a>` 导航不算）、`@import`、`url(http`。
  5. **结构**——注入后以 `</html>` 收尾；`<body`、`</body>` 各一次。
  6. **深色覆盖实测**（无浏览器）——从注入产物抽出 `[data-theme="dark"]` 选择器集合，
     确认 §5「必须换」清单 100% 命中，打印命中率（当前 **33/33**）。
  全部在临时目录里跑，跑完清理；用自己构造的 synthetic fixture，不依赖任何真实成品页。
- `scaffold.mjs` 版本 2.2.1，tools 增加 `check-shell.mjs`（十个脚本）。
- `references/05-pitfalls.md` 新增 #31–33：`document.startViewTransition` 吞掉主题切换（机制已在 2.2.2 订正）、深色漏掉写死浅色、
  站点覆盖 `--shell-h` 连移动端默认一起盖掉。
- `references/09-site-shell.md` §2 / §10：自检入口改为 `node tools/check-shell.mjs`，原来那几条手动命令降为「想手工复核时」。

### Fixed

- **`--check` 认配置漂移**：以前改完 config 再 `--check` 一律返回 0（「已注入」），
  用户以为没事，其实外壳还是旧导航项。现在注入时把**配置指纹**（规范化 config 的 sha1 前 8 位）
  写进标记区 `<!-- shell:config:xxxxxxxx -->`（放在第 1 块 `theme-boot` 里，随整块替换，保持幂等），
  `--check` 改成三种结果：
  - 未注入 → exit **1**，打印「未注入」
  - 已注入但指纹与当前 config 不同 → exit **1**，打印「配置已变，需重跑注入（旧 xxx / 新 yyy）」
  - 已注入且一致 → exit **0**
  - 标记半残 / config 读不了 / 其它错 → exit **2**

  **退出码集合不变**（仍是 0/1/2），只是 1 多了一个理由。
  旧版（v2.2.0）注入的页面没有指纹，`--check` 会按「旧 无」判为配置已变 → exit 1，**重跑一次注入即可**。

## [2.2.0] — 2026-11-16

### Added

- **站点外壳 + 深色主题**：`tools/inject-shell.mjs`，把成品页接进自己的站点——注入导航条（品牌 + 导航项 + 主题切换按钮）、
  深色皮肤、跨文档 `@view-transition`，以及精读页自己写死的浅色（表格、chip、目录抽屉、图注边框、选中态等；灯箱本身就是深底浅字，已排除（无需覆盖））在
  `[data-theme="dark"]` 下的逐条覆盖。配置 `templates/shell.config.example.json`（站点 URL / 品牌 / 导航项 / accent / 深色底字色）。
  - 5 处注入（head 3 + body 2），每块带成对 begin/end 标记与唯一 id：**重复运行整块替换，字节完全相同**。
  - `--check` 只检测（0=已注入，1=未注入，2=出错），`--dry-run` 只打印变动摘要不写盘。
  - 注入内容零 http(s) 资源引用（图标全内联 SVG）；内容下移量由 CSS 变量 `--shell-h` 控制（默认 52px，站点可在页面里覆盖），并注入 `scroll-padding-top`；
    `@media print` 隐藏导航栏并强制浅色。
- 新参考 `references/09-site-shell.md`：外壳的必要性与取舍、注入点与 marker 表、布局偏移、**写死浅色清单**（逐个类名 + 理由）、
  打印、跨文档过渡与叠影规避、已知坑、以及与博客 `import_readers.py`（站点特化版）的关系。
- `scaffold.mjs` 版本 2.2.0，tools 增加 `inject-shell.mjs`。

### Migration

已有项目想把成品页接进站点，只有一条命令（不改 `src/`、不改 `build.mjs`、不用重新 `gate`）：

```bash
node tools/inject-shell.mjs index.html --config /path/to/site.json
```

站点配置照 `templates/shell.config.example.json` 改 5 组字段即可。`--dry-run` 先看变动，`--check` 查状态。
**同一页重复注入是幂等的**；改了配置再跑一次会整块替换，不会叠成两层导航条。

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
