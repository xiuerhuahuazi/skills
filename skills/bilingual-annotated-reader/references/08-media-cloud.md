# 媒体与云端：视频、题图、两种交付形态

> v2.1.0 起，页面支持视频点播与题图；同一条命令产出「单文件」与「云端版」两种交付。
> 本文件是这块的唯一规则来源；数据和页面契约见 `02-data-contract.md` / `03-page-spec.md`。

---

## 0. 图片瘦身（发布前必做）

> 精读页的图常常是「原始尺寸 + 平台默认质量」直接落到 `assets/`：3840px 宽的 PNG 显示在 1340px 的栏里，
> 一张 344 KB，一页四张就 1.3 MB。读者的感受是"这页打不开"，不是"画质真好"。**先瘦身，再上线。**

### 预算

| 项 | 目标 | 超了怎么办 |
|---|---|---|
| 单张静态图 | ≤ 260 KB（正常落在 20–150 KB） | 降尺寸 → 降 quality → 换 WebP |
| 单页图片合计 | ≤ 1 MB | 回头查是不是有原始尺寸 PNG |
| 单文件 `index.html` | ≤ 3 MB（图多时） | 同左；视频另算 |
| 动图 | ≤ 300 KB / 段 | 帧率 12、色板 128、宽度 1200 |

### 一条命令

```bash
python3 tools/slim-media.py            # 当前项目：转 WebP + 收敛尺寸 + 回写 config/meta
python3 tools/slim-media.py --all ..   # 目录下所有精读项目
python3 tools/slim-media.py --dry      # 只出表格，不落盘
python3 tools/slim-media.py --backup .bak   # 动手前备份 assets
python3 tools/slim-media.py --gif      # 顺带优化动图（需 ffmpeg，FFMPEG= 可指定）
```

它只处理 `data/config.json` 的 `figureAssets`（still / anim）与 `data/meta.json` 的 `cover.asset`，
把 jpg / png 转成同名 `.webp` 并回写这两个 JSON；原图留在 `assets/` **不动**，想回滚就把 JSON 改回去。
转换后要重新 `node tools/publish.mjs`，站点侧再 `import_readers.py --force`。

依赖 Pillow（`python3 -m venv .venv && .venv/bin/pip install pillow`）；缺依赖时退出 2 并给安装命令。

### 参数为什么是这些

- **尺寸**：照片（jpg 来）长边 ≤ 1600、图稿（png 来）长边 ≤ 2000。正文栏宽约 1340px，2 倍屏也就 2680——
  2000 已经够放大看小字，再往上只是给 CDN 交学费。
- **质量阶梯**：图稿 84/80/76，照片 78/74/70，命中 ≤ 260 KB 就停；纹理密的插画（彩铅、纸张噪点）本来就吃字节，
  降到 70 以下才开始看出糊。
- **收益门槛**：转完比原图小不到 8% 就不换名字（避免为几个 KB 改一版 `config.json`）。
- **格式**：WebP。同尺寸下比 JPEG 小 3–5 倍、比调色板 PNG 更干净；`build.mjs` 的 MIME 表已含 `image/webp`，
  单文件内嵌不会出 `data:undefined`。

### 实测（2026-11-19，15 篇 79 张图）

| 图 | 原 | 处理后 | PSNR |
|---|---|---|---|
| anthropic-scm fig6 (3840×4684 RGBA) | 343 KB PNG | 68 KB WebP q80 | 45.2 dB |
| fable-multi-agent fig5 (2560×1336) | 709 KB PNG | 69 KB WebP q80 | 38.6 dB |
| harness vid1 (1920×1080) | 399 KB PNG | 31 KB WebP q80 | 43.0 dB |
| grok fig1 (1400×933 插画) | 388 KB JPEG | 257 KB WebP q78 | 34.7 dB |
| claude-subagent-loop fig1.gif (93 帧) | 820 KB GIF | 122 KB GIF（12fps/1200px/128 色） | 肉眼无差 |

整站精读图片 **13.6 MB → 4.5 MB（−67%）**；单篇最重一页 1.3 MB → 0.82 MB。
（2026-11-19 更正：1.3→0.82 MB 的是 Grok 页；按 git 字节实测最重页为 harness-reader 1.83→0.28 MB，grok 1.36→0.84 仅排第 5。）

### 坑

1. **PNG 只重编码不降尺寸会变大**：3840px 的 PNG 用 sips / Pillow 重存，294 KB → 347 KB。先降尺寸。
2. **调色板量化对线稿很好、对照片一般**：图稿 294 KB → 60 KB 肉眼无损；照片型 PNG 不如直接 WebP。
3. **JPEG 重编码对纹理密的插画几乎无效**：388 KB 的彩铅插画降到 q74 只剩 306 KB，PSNR 已掉到 33 dB——换 WebP，别硬压。
4. **动图别转 animated WebP**：Pillow / ffmpeg 逐帧全编码，820 KB 的 GIF 会变成 3.3 MB。要么用 ffmpeg 重做 GIF 调色板（推荐），
   要么保持原样。
5. **改完必须重建**：只换 `assets/` 里文件、不跑 `publish.mjs`，单文件 `index.html` 里还是旧的 base64。

## 1. 先决定视频怎么放

| 方案 | 单文件 | 体积（3 段 60 s 动画，1280 宽） | 离线 | 适合 |
|---|---|---|---|---|
| 末帧定格 + 原站链接 | 是 | 2.1 MB | 图可看，视频要联网 | 只要「能读到」，不介意跳转 |
| **内嵌点播（推荐给单文件）** | 是 | **6.4 MB**（压缩后） | 全可看 | 存档、发给别人、断网阅读 |
| 外置 `media/`（云端） | 否 | HTML 156 KB + 按需 | 需服务 | 上云、多人访问、要缓存 |

决策：**单文件交付用内嵌点播，云端交付用外置**；两者由 `publish.mjs` 一次产出。
如果文章没有视频，这一节只关系到「题图」（`meta.cover`）与图片是否外置。

## 2. 拿到素材

- HTML 页面：`<video src="…mp4" poster="…png">`；封面在 `og:image` / `cover_media`。
- X Article：正文 `atomic` 块**通常是分隔线（DIVIDER）不是视频**；视频在 `media_entities` 或 html 视频标签里，别想当然。
- 海报优先用**最后一帧**（时间轴动画的末帧信息量最大）；`ffmpeg -sseof -0.2 -i in.mp4 -frames:v 1 poster.png`。
- 下载视频写进 `assets/`，与图一样是构建素材。

## 3. 压缩（必做）

```bash
ffmpeg -i assets/fig4.mp4 -c:v libx264 -crf 30 -preset slow -tune animation \
       -an -movflags +faststart -y assets/slim/fig4.mp4
```

- `-tune animation`：线稿/图表动画比默认参数省 20-40%。
- `-an`：这类演示视频没有音轨，省一点。
- `+faststart`：moov 前置，**云端边下边播**的前提。
- 本 skill 实测（3 段 60 s、1280 宽）：8.76 MB → **3.24 MB**，SSIM 0.989–0.995，肉眼无差。
- 别直接内嵌原片：14 MB 的单文件在低配机器上打开会明显卡。

## 4. 单文件内嵌（点播）

`data/config.json`：

```json
{ "figureAssets": { "fig4": { "still": "fig4.png", "anim": null, "video": "slim/fig4.mp4" } } }
```

`build.mjs` 会把 mp4 读成 base64，写进 `<script type="text/plain" id="vid-fig4">`，页面先渲染
「末帧海报 + ▶ 播放（X MB · 已内嵌）」。点了才 `atob → Uint8Array → Blob → URL.createObjectURL`，再换出 `<video controls autoplay>`。

**为什么不用 `data:video/mp4;base64` 当 src**：桌面 Safari 对 data URI 视频历来不稳（iOS 更明确，见 WebKit #232076），
而 Blob URL 在 macOS/iOS Safari 都能播。本项目本机默认浏览器就是 Safari，必须走 Blob。

注意：
- base64 在 HTML 里会**常驻内存**（6 MB 文件打开后仍在），低端机别堆太多视频。
- 点播有 ~100 ms 解码开销；超过 2-3 段视频就该考虑外置。

## 5. 云端外置

```bash
node tools/publish.mjs            # index.html（内嵌）+ cloud/index.html + cloud/media/
node tools/publish.mjs --no-cloud # 只出单文件
```

`publish.mjs` 做的事：先正常 `build.mjs`，再以 `VIDEO_MODE=external IMAGE_MODE=external MEDIA_BASE=media/`
构建 `cloud/index.html`，然后把 `config.figureAssets`（still/anim/video）与 `meta.cover.asset` 复制到 `cloud/media/`。

页面里：视频是 `<img class="video-poster" loading="lazy">` + 播放按钮（`data-src="media/fig4.mp4"`），
点击后才 `video.src = data-src` 并 `play()`——**首屏 0 个媒体请求**。

### 服务器必须做到

| 项 | 要求 |
|---|---|
| Range | `Accept-Ranges: bytes`，返回 **206 + Content-Range**；拖动进度条靠它 |
| 缓存 | `media/*` → `public, max-age=31536000, immutable`（文件名带内容哈希更稳）；`index.html` → `no-cache` |
| 压缩 | HTML 走 brotli/gzip（156 KB → 约 40 KB） |
| 协议 | HTTP/2 或 HTTP/3；CDN 缓存媒体 |
| MIME | `.mp4` → `video/mp4`（nginx 默认有；自建服务别漏） |

nginx：

```nginx
location = /index.html { add_header Cache-Control "no-cache"; }
location ~* \.(mp4|png|jpg)$ {
  add_header Cache-Control "public, max-age=31536000, immutable";
  add_header Accept-Ranges bytes;
}
```

Caddy（自动 HTTP/3、自动 Range）：

```
@media path *.mp4 *.png *.jpg
header @media Cache-Control "public, max-age=31536000, immutable"
header Cache-Control "no-cache"
```

经反向代理时确认 Range 没被吃掉：nginx 加 `proxy_force_ranges on;`，或让代理透传 `Range` / `If-Range` 头。

### 海报与图片

- 云端海报建议转 JPEG（`fig5.png` 726 KB → 约 90 KB），`<img loading="lazy" decoding="async">`。
- 正文静态图同理：`IMAGE_MODE=external` 会全部外置；`loading="lazy"` 让首屏只拉文本。
- 首屏预算：HTML < 300 KB（brotli 后 < 100 KB），关键图不阻塞 LCP。

## 6. 什么时候上 HLS

| 信号 | 做法 |
|---|---|
| 单段 < 2 min、码率固定、数量 ≤ 3 | mp4 + Range 足够，别上 HLS |
| 视频多 / 长 / 要自适应 / 要秒开 | `ffmpeg -f hls -hls_time 4 -hls_playlist_type vod`，Safari 原生播，其它浏览器 hls.js |
| 只想减首屏带宽 | 先只加载 poster，点击才 `src`（本 skill 的默认） |

## 7. 验证（别只看截图）

1. `node tools/publish.mjs` 打印两个体积；单文件 > 10 MB 就要回头压。
2. headless 探针：视频 `readyState=4`、`duration` 正确、seek 到中段出一帧（截图不是全黑）。
3. 云端版用带 Range 的服务器跑：`curl -H "Range: bytes=0-1023" -I …/media/x.mp4` 必须是 **206**。
4. 首屏请求：打开页面时 `performance.getEntriesByType('resource')` 里**不应有** `.mp4`。
5. 点播后：`video.currentTime` 会前进（headless 需 `Runtime.evaluate` 的 `userGesture: true`，否则自动播放策略会挡住）。

## 8. 媒体相关的坑

1. **`shots/_*.html` 爆炸**：`shots.mjs`/`smoke.mjs` 会把整页复制到 shots 下；含视频的页面一次跑出 200 MB。
   跑完删 `shots/_*.html`（成品只需 PNG）。
2. **data URI 视频在 Safari**：不稳；用 Blob（见 §4）。
3. **base64 与缓存互斥**：上云后每次访问都重下整段；别把单文件直接丢服务器。
4. **忘了 `+faststart`**：云端播放器要等整段下载完才能起播。
5. **海报懒加载过头**：`loading="lazy"` 对视频 poster 是 `<img>`，不是 `<video poster>`；视频元素本身不预加载。
6. **`assetUrl` 的 MIME 表**：新增媒体格式（mp4/webm）必须同时加进 MIME，否则生成 `data:undefined`。
7. **`media/` 相对路径**：云端页在 `cloud/index.html`，媒体在 `cloud/media/`，所有引用必须是 `media/…`；用 `MEDIA_BASE` 统一。
8. **体积失控**：单文件 > 10 MB 或 HTML > 300 KB（未压缩）就停下来重新决策，不要硬交。

## 9. 体积参考（本 skill 实测）

| 形态 | 3 段视频 | 6 张图 | HTML | 备注 |
|---|---|---|---|---|
| 末帧 + 链接 | 0 | 内嵌 | 2.11 MB | 最轻 |
| 内嵌点播（压缩） | 3.24 MB | 内嵌 | **6.43 MB** | 单文件标准 |
| 云端外置 | 3.24 MB（按需） | 外置 | **156 KB** | 首屏 0 媒体请求 |
