# `delivery` 模块使用说明

这个目录定义 Git 提交、推送和交付约束。

## 文件

- `branch-policy.md`：分支约束
- `commit-policy.md`：提交约束
- `push-policy.md`：推送约束
- `delivery-checklist.md`：交付前自检清单
- `commit-template.md`：提交内容模板
- `AGENT.md`：给 AI 直接使用的交付规则

## 与 `change` 的关系

启用 `delivery` 模块后，`specnfc change create` 会额外生成：

- `commit-message.md`
- `delivery-checklist.md`

这两份文件放在当前 `change` 目录下，作为本次变更自己的提交说明草稿和交付自检文件。
