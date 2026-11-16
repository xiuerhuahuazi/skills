## 本机执行方式(DSH 接线, 本地补丁)

- **安装位置**: DSH 没有官方 install 目标(官方 install 委托第三方 skills CLI, 只有 claude/codex/cursor/gemini/kimi/copilot 宿主)。本 skill 直接放在 `~/.agents/skills/modern-web-guidance/`，由 `dsh-skill-filesystem` 插件扫描热加载，无需注册。
- **telemetry 默认是开的**(实测): CLI 默认起 detached `watchdog/main.js` 子进程，把查询词、命中 id、OS、agent 名上报 Google Clearcut。本机**一律加 `DISABLE_TELEMETRY=1`**，检索结果完全不受影响。
- **命令优先用本地副本**(0.2 s 级, 检索索引在本地 `gen/`, 不依赖网络):
  ```sh
  DISABLE_TELEMETRY=1 node ~/.agents/skills/modern-web-guidance/modern-web.mjs search "<query>"
  DISABLE_TELEMETRY=1 node ~/.agents/skills/modern-web-guidance/modern-web.mjs retrieve "<id>"
  DISABLE_TELEMETRY=1 node ~/.agents/skills/modern-web-guidance/legacy-scan.mjs <path> --json
  ```
- 本地执行不通(文件缺失/报错)时才退回官方写法(首次需联网): `DISABLE_TELEMETRY=1 npx -y modern-web-guidance@latest <cmd>`。
- **查询词用英文**: 索引只有英文, 中文查询返回 `[]`。
- **边界裁定**: 纯内容排版 / 文案搬运 / 中文长文页面(不新增或改动交互逻辑与 CSS 布局机制)不强制跑 search; 一旦涉及交互组件(dialog / popover / 表单 / 动画 / view transitions / 容器查询 / a11y / 性能)，先 search 再写。
- **升级**: 跑 `~/.agents/scripts/update-mwg.sh`(默认 dry-run, 加 `--apply` 才覆盖; 会重建本段与精简后的 frontmatter description)。
