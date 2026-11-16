# modern-web-guidance

> 给 coding agent 装一份「现代 Web 平台最佳实践」检索库：**250 个 Web 特性 / 203 个真实用例**，
> 带本地索引，离线可查。上游：[GoogleChrome/modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance)。
>
> 这里是**全量分发 + 少量 DSH 接线补丁**，不是重新实现。

## 为什么需要它

模型的训练数据里堆着大量旧写法，遇到「做个弹窗 / 表单校验 / 深色模式 / 滚动动画」时会默认写一堆
JavaScript 或引第三方库，而平台早已有原生方案。这个技能把 Google Chrome / MDN 团队维护的指南
变成可检索的上下文：先 `search` 找到用例，再 `retrieve` 拿到含 Baseline 可用性、替代回退和代码的全文。

## 安装

```bash
git clone https://github.com/xiuerhuahuazi/skills.git
cd skills
./install.sh modern-web-guidance
```

- 需要 **Node ≥ 22**。
- 目录约 **16 MB**：`gen/`（7.1 MB 本地检索索引）与 `legacy-scan.mjs`（4.8 MB）是离线检索的前提，**别删**。
- 默认装到 `~/.agents/skills/modern-web-guidance`；装到别处传第二个参数（如 `~/.claude/skills`）。

## 用法

```sh
# 检索用例（英文查询，约 0.2 秒，检索不联网）
DISABLE_TELEMETRY=1 node ~/.agents/skills/modern-web-guidance/modern-web.mjs search "confirmation modal dialog"

# 取回指南全文（>9.5 KB 时只打印临时文件路径，用读文件工具去读那个路径）
DISABLE_TELEMETRY=1 node ~/.agents/skills/modern-web-guidance/modern-web.mjs retrieve "light-dismiss-a-dialog"

# 列出全部 208 条索引
DISABLE_TELEMETRY=1 node ~/.agents/skills/modern-web-guidance/modern-web.mjs list

# 只在「整体现代化扫描」时用（只覆盖约 20% 语料）
DISABLE_TELEMETRY=1 node ~/.agents/skills/modern-web-guidance/legacy-scan.mjs <path> --json
```

判断标准：结果是 `[{ id, description }]`，按 `description` 选；搜不到就换一次词，再不行直接 `list` 兜底。

## 我们改了什么（与原版的差异）

1. **`description` 精简到 488 字符**：DSH 的技能 catalog 只保留 500 字符，上游 855 字符会被截断，
   正好切掉「DO NOT trigger for: backend/infra/tooling」排除条款，导致任何前台 Web 任务都先触发它。
2. **所有命令加 `DISABLE_TELEMETRY=1`**：CLI 默认会拉起 detached watchdog 子进程，把
   查询词原文、命中 id、OS、agent 名上报 Google Clearcut。检索结果不受开关影响。
3. **顶部补「本机执行方式（DSH 接线）」段**：DSH 没有官方安装目标（官方 install 只认
   claude/codex/cursor/gemini/kimi/copilot），用文件系统技能接入；检索走本地副本；纯中文排版 /
   文案搬运任务不强制检索，涉及交互组件、表单、a11y、性能时才先查。
4. **保留升级基线**：`SKILL.md.upstream` 是上游原文，`local-overrides.md` 是补丁正文。
   升级 = 上游新原文 + 补丁重建 `SKILL.md`，**不要手改正文**。

## 已知坑（都实测过）

- **查询词用英文**：索引只有英文，`search "确认弹窗"` 返回 `[]`。
- **别用死代理验证「有没有外联」**：Node 的 `fetch` 默认不读 `HTTPS_PROXY`，把代理指到死端口也测不出来；
  要看遥测行为就看 `DISABLE_TELEMETRY` 的开关逻辑。
- **别跑 `uninstall`**：按源码逻辑，它会收集 `modern-web.mjs` 父目录下**所有**带 `SKILL.md` 的技能名，
  交给第三方 `skills remove`——装在 `~/.agents/skills/` 时会波及全部技能。要卸载就 `mv` 目录。
- **改 frontmatter 必须过 YAML 解析器**：单行 `description` 里出现 `: ` 会让 YAML 非法，
  宿主会**静默**跳过整个技能（表现为 catalog 不更新、工具报 unknown）。判据：
  `ruby -ryaml -e 'YAML.load_file("SKILL.md")'`。

## 目录

```
SKILL.md              # 给 agent 读的说明（含 frontmatter 与本地补丁段）
SKILL.md.upstream     # 上游原文基线（升级对照用）
local-overrides.md    # 本地补丁正文（升级时重新拼接）
guides/               # 209 篇指南（17 个分类）
gen/                  # 本地检索索引（guides.json + query-words / guide-chunks 向量）
modern-web.mjs        # CLI：search / retrieve / list / legacy-scan
legacy-scan.mjs       # 旧写法扫描（curated 子集）
watchdog/             # 上游遥测 watchdog（本仓库默认环境变量关闭）
skill-version.txt     # 上游技能快照版本
```

## 升级

从 npm 取新版本（`npm pack modern-web-guidance@latest`），用新包覆盖除
`SKILL.md` / `SKILL.md.upstream` / `local-overrides.md` 之外的文件，然后
「新上游正文 + `local-overrides.md`」重建 `SKILL.md` 并跑一次 `search` 冒烟。

## 许可

- 软件代码：**Apache-2.0**（见 [LICENSE](LICENSE)）。
- `guides/` 下的文档内容：**CC-BY 4.0**，署名 GoogleChrome 与 MDN / W3C / WHATWG / IETF 贡献者。
- 本仓库对 `SKILL.md` 与 `local-overrides.md` 的改动同样在这些许可之下分发。
