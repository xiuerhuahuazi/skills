# Changelog

## v1.0.0-dsh.1 — 2026-11-16

首个入库版本，基于 npm `modern-web-guidance@1.0.0`（技能快照 `2026_11_09-5bcc021b`）。

- 全量分发：`SKILL.md` + 209 篇 `guides/` + `gen/` 本地检索索引 + CLI（`search` / `retrieve` / `list` / `legacy-scan`）。
- DSH 接线补丁：本地执行方式与边界裁定；`description` 精简到 488 字符（防 catalog 500 字符截断切掉排除条款）；
  所有命令统一加 `DISABLE_TELEMETRY=1`（上游默认上报查询词到 Google Clearcut）。
- 保留 `SKILL.md.upstream`（上游原文基线）与 `local-overrides.md`（补丁正文），使升级可重建而不丢补丁。
- 修复项：`description` 单行裸值里的 `: ` 会让 YAML 非法、导致宿主静默跳过技能，改为双引号包裹并加解析校验。
