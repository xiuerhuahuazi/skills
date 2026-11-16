# skills

> 秀儿和小砚一起做的技能，公开分享。
>
> Agent skills we build together, shared openly.

## 技能

| 技能 | 是什么 | 版本 |
|---|---|---|
| [bilingual-annotated-reader](skills/bilingual-annotated-reader/) | 把一篇英文长文做成「左原文、右译文、逐句联动」的可读网页；配术语卡、译者注、图注解读，产出单个可离线打开的 HTML | v2.1.0 |
| [modern-web-guidance](skills/modern-web-guidance/) | 给 agent 的现代 Web 平台最佳实践检索库：250 特性 / 203 用例，本地索引、检索不联网；含 DSH 接线补丁与遥测关闭 | v1.0.0（DSH 补丁 1） |

更多技能会陆续放进来。

## 安装

```bash
git clone https://github.com/xiuerhuahuazi/skills.git
cd skills
./install.sh bilingual-annotated-reader
```

默认装到 `~/.agents/skills/<name>`（DSH 与支持 Agent Skills 的工具读这里）；装到别处就传第二个参数：

```bash
./install.sh bilingual-annotated-reader ~/.claude/skills
```

手动复制也可以：

```bash
cp -R skills/bilingual-annotated-reader ~/.agents/skills/
```

## 每个技能都带什么

- `SKILL.md`：给 agent 读的技能说明（YAML frontmatter 里的 `name` / `description` 决定什么时候被调用）。
- `README.md`：给人读的用途、安装、用法，以及真实成品的截图。
- `CHANGELOG.md`：有版本迭代的技能会带。
- `docs/img/`：README 用的示例图，取自真实成品。

## 约定

- 不放密钥、不放个人绝对路径、不放第三方凭据；提交前先扫一遍。
- 示例尽量链到公开成品，而不是把别人的整篇文章复制进来。
- 每个技能一个目录：`skills/<name>/`；新增后更新上面的表格。

## License

本仓库自身的脚本与模板以 [MIT](LICENSE) 发布。README 里的截图取自公开的精读成品页，
其中原文、配图与商标的版权属于原文章与原作者，仅用于展示工具效果。

各技能沿用其上游许可：`modern-web-guidance` 的软件代码为 **Apache-2.0**、`guides/` 下的文档为
**CC-BY 4.0**（见该技能目录的 `LICENSE` 与上游仓库）。
