# `specs` 目录

`specs/` 存放当前业务仓的变更规格。

## 目录结构

- `changes/`：进行中的 change
- `archive/`：已完成归档的 change

## `change` 最小结构

```text
specs/changes/<change-slug>/
├─ meta.json
├─ spec.md
├─ plan.md
├─ tasks.md
├─ decisions.md
└─ status.md
```

## 文件职责

- `meta.json`：给工具读取的结构化事实源
- `spec.md`：变更背景、范围、完成口径
- `plan.md`：方案、边界、技术路线
- `tasks.md`：执行任务拆分
- `decisions.md`：当前 change 的局部决策记忆
- `status.md`：当前状态、阻塞、下一步与交接前进展记忆

## 作为过程记忆的职责

`specs/changes/` 承担**change 级过程记忆**，主要记录：

- 当前变更为什么做、做到哪里
- 已经确认了哪些局部决策
- 当前卡在哪、下一步是什么

这类信息不应只留在聊天里，也不应误写到仓级长期上下文中。

## 常用命令

```bash
specnfc change create <change-id> --title "变更标题"
specnfc change stage <change-id> --to in-progress
specnfc change handoff <change-id>
specnfc change archive <change-id>
specnfc change list
specnfc change check
```
