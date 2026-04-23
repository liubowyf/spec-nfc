# migration from legacy runtime

## 目标
把 legacy `.omx/` 中仍有价值的上下文迁到 `.nfc/`，但不把历史噪音全部原样复制。

## 迁移建议
- `.omx/context/*` -> `.nfc/context/legacy/`
- `.omx/interviews/*` -> `.nfc/interviews/archived/`
- `.omx/plans/*` -> `.nfc/plans/archived/`
- `.omx/logs/*` -> `.nfc/logs/legacy/`
- `.omx/state/*` -> 提炼必要状态进入 `.nfc/state/`，其余生成 migration report

## 保守规则
- 不删除 `.omx/` 历史目录，先保留一个迁移窗口
- 不可自动覆盖已有 `.nfc/` 新文件
- 无法判定归属的 legacy 文件，只登记，不自动迁移
