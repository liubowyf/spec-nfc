# Proposal

## 背景

当前 `specnfc` 已经具备仓级初始化、模块化骨架、`change / integration / status / doctor / upgrade` 命令骨架，以及多工具入口投影能力，但这些能力仍主要表现为“仓内模板 + 文档门禁 + 入口适配”。证据来自：

- 命令实现：`src/commands/*.mjs`
- 仓级骨架与规则：`src/kernel/config.mjs`、`src/kernel/scaffold.mjs`、`src/kernel/rules.mjs`
- 变更与对接对象：`src/workflow/changes.mjs`、`src/workflow/integrations.mjs`
- 状态与检查：`src/workflow/status.mjs`、`src/commands/status.mjs`、`src/commands/doctor.mjs`
- 发布与安装：`scripts/bootstrap.mjs`、`scripts/release.mjs`
- 既有产品文档：`README.md`、`docs/01-产品总览/`、`docs/02-命令说明/`、`docs/06-新手入门/`、`docs/07-完整示例/`

同时，仓内仍残留 `.omx/` 运行时痕迹，正式设计也已存在一版以“兼容 runtime 层”为中心的顶层重构稿：

- `.omx/`：当前保存访谈、计划、状态、日志
- `docs/08-顶层重构/specnfc-v3/`：既有顶层设计草案
- `specs/changes/rebuild-specnfc-canonical-control-plane/`：既有 change dossier

本轮不是推翻当前仓，而是把这些已存在能力进一步收敛为：

1. 项目级 canonical control plane
2. 团队协作可复用的 Spec Coding 协议系统
3. `specnfc` 自有、中文化、去 OMX 品牌的 `nfc` 运行时与 skills 体系

## 当前问题

### 现有能力
- `specnfc init` 已能安装 profile/modules，并生成 `.specnfc/` 与入口文件（`src/commands/init.mjs`、`src/kernel/scaffold.mjs`）
- `change` 已具备 create/list/check/stage/handoff/archive（`src/commands/change.mjs`）
- `integration` 已具备 create/list/check/stage（`src/commands/integration.mjs`）
- `status` 已能输出仓状态、change 汇总、readingPath、projectMemory 摘要（`src/commands/status.mjs`、`src/workflow/status.mjs`）
- `doctor` 已能检查仓库完整性、运行规则、项目记忆与发布就绪度（`src/commands/doctor.mjs`、`src/kernel/scaffold.mjs`）
- `upgrade` 已具备 managed files、diff 预览、保守升级和 change backfill（`src/kernel/upgrade.mjs`）
- 当前发布链路已覆盖 manifest 校验、打包、安装验证（`scripts/release.mjs`）

### 真正短板
- `.specnfc/` 当前仍偏“模板安装结果”，尚未被严格定义为仓内唯一 control plane
- `.omx/` 当前承载大量运行时事实，但正式设计尚未把这些能力收编为 `specnfc` 自有的中文运行时
- 入口文件目前是 managed files，但未被提升为“由 contract 严格派生的 projection layer”
- `change / integration` 已有阶段与门禁，但 repo/change/integration/project/team 多层对象和索引尚未冻结成统一 schema
- next-step 建议已存在，但还不是统一的 next-step contract
- 运行时中间产物与正式 dossier 的强回写机制仍不清晰

## 目标

把 `specnfc` 从“仓内规范脚手架 + 文档门禁工具”升级为：

- 以 `.specnfc/` 为仓内唯一正式 control plane
- 以 `.nfc/` 为 `specnfc` 自有中文运行时与协作层
- 以 `specs/changes/`、`specs/integrations/` 为正式工作对象域
- 以 `AGENTS.md / CLAUDE.md / .trae/rules / opencode.json` 为严格投影层
- 以阶段状态机、文档合同、治理模式、next-step protocol 为统一协议

## 非目标

- 不复制完整 oh-my-codex runtime 平台
- 不把 `.nfc/` 设计成新的正式真相源
- 不引入大量新顶级命令
- 不做全量行为审计平台
- 不要求 team/project 外部宿主在第一期就全部到位
- 不封禁个人 agent / 私有 skills，只限制其不能覆盖仓内正式合同
