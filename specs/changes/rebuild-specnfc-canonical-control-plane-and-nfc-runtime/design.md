# Design

## 设计结论

### 1. 正式真相源分层
- **Team Persistent Space**：团队级 policy-pack、skill-pack 源、术语、项目注册表
- **Project Layer**：跨仓项目合同、共享文档、共享验收、仓注册表
- **Repo Layer**：`.specnfc/`，仓内唯一正式 control plane
- **Work Object Layer**：`specs/changes/<id>/`、`specs/integrations/<id>/`
- **Runtime Collaboration Layer**：`.nfc/`，中文运行时与协作层

### 2. `.specnfc/` 与 `.nfc/` 边界

#### `.specnfc/` 负责
- contract 与 schema
- stage machine 与 governance mode
- indexes 与 doc contracts
- skill-pack active snapshot
- projection policy
- compliance / next-step / execution pointers

#### `.nfc/` 负责
- 深访、规划、中间稿、会话状态、日志、handoff、writeback queue
- workflow/support skills 与 prompts 的运行时副本或执行记录
- 不直接替代 change/integration dossier 的正式事实主权

### 3. 投影层边界
`AGENTS.md / CLAUDE.md / .trae/rules/project_rules.md / opencode.json` 均视为 projection layer：
- 源头来自 `.specnfc/contract/*`、`.specnfc/skill-packs/active/*`、`.specnfc/indexes/doc-index.json`
- 只做导航、规则摘录、当前阶段提示、下一步建议
- 不得拥有独立流程真相

### 4. 阶段状态机
canonical phases 固定为：
`clarify -> design -> plan -> execute -> verify -> accept -> archive`

旧阶段仅作为 alias：
- `draft -> clarify`
- `design -> design`
- `ready -> plan`
- `in-progress -> execute`
- `verifying -> verify`
- `handoff -> accept`
- `archived -> archive`

### 5. 强导向 / 有限强制
通过 governance mode 实现四档治理：
- `advisory`
- `guided`
- `strict`
- `locked`

核心原则：
- 过程建议强
- 结果门禁硬
- 不强管个人工具
- 只强管正式文档、阶段推进、索引一致性、投影漂移与 writeback 闭环

## 架构图

```text
Team Persistent Space
└─ team-contract / policy-pack / skill-pack source / project registry

Project Layer
└─ project.ref / shared-docs / shared-acceptance / repo-registry

Repo Layer (.specnfc)
├─ contract/
├─ indexes/
├─ skill-packs/active/
├─ projections/
├─ governance/
├─ execution/
├─ quality/
├─ delivery/
└─ context/

Work Object Layer
├─ specs/changes/<change-id>/
└─ specs/integrations/<integration-id>/

Runtime Collaboration Layer (.nfc)
├─ context/
├─ interviews/
├─ plans/
├─ skills/
├─ state/
├─ logs/
├─ handoffs/
├─ notes/
└─ sync/
```

## 为什么不是推倒重来

保留并上提的现有资产：
- 现有命令骨架：`src/commands/*.mjs`
- 现有 dossier 结构：`src/workflow/templates/change/*`、`src/workflow/templates/integration/*`
- 现有状态聚合：`src/workflow/status.mjs`
- 现有 managed files 与 upgrade：`src/kernel/upgrade.mjs`
- 现有发布/安装闭环：`scripts/bootstrap.mjs`、`scripts/release.mjs`
- 现有项目记忆与入口索引能力：`status / doctor / entry templates`

重构重点不是换对象域，而是把这些对象纳入同一套 canonical contract。
