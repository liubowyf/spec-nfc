# Decisions

## 决策 1：`.specnfc/` 是仓级 canonical control plane
- 背景：当前仓已有 `.specnfc/`、入口投影、规则快照和项目记忆基础。
- 结论：不另起新目录作为仓内真相源，直接把 `.specnfc/` 提升为 control plane。
- 影响：后续所有入口、索引、skill-pack、next-step protocol 都从 `.specnfc/` 派生。

## 决策 2：`.omx/` 仅作为兼容运行时层
- 背景：当前仓已明显受 oh-my-codex 影响，但用户明确不允许 `.omx/` 反定义项目规范。
- 结论：保留 `.omx/` 的 interviews/plans/state/logs 用途，但不让其成为协议源。
- 影响：任何仓级正式门禁必须可在没有 `.omx/` runtime 的情况下成立。

## 决策 3：保留旧命令面，重写语义
- 背景：用户长期要求命令收敛、避免复杂化。
- 结论：保留 `init/change/integration/status/doctor/upgrade` 等顶级命令，优先改语义与输出 contract。
- 影响：兼容性更强，迁移成本更低。

## 决策 4：多层索引采用 ref + snapshot manifest，而非跨仓全文复制
- 背景：用户明确不做跨仓全文镜像系统。
- 结论：team/project 层以 ref/schema 为主，repo 层只保留引用、摘要与必要快照。
- 影响：跨仓协作可持续，但仓内负担受控。
