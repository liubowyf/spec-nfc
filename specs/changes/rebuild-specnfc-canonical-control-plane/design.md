# Design — Spec nfc v3 顶层架构

## 1. 设计原则
1. **复用现有能力，不推倒重来**：`change/integration/status/doctor/upgrade/release`、项目记忆、入口投影、文档门禁全部保留并提升。
2. **`.specnfc/` 是 canonical control plane**：仓内项目协议、文档合同、索引、技能快照、下一步建议全部从这里派生。
3. **`.omx/` 只是 runtime compatibility layer**：用于深访、计划、会话状态、日志，不定义项目协议。
4. **结果门禁硬，过程引导强**：不强制使用同一 Agent runtime，但要求最终文档、阶段状态和门禁符合仓内合同。
5. **少命令、重语义**：重点改写现有命令含义，而不是扩顶级命令面。

## 2. 目标分层
- Team persistent space：团队长期协议源、skill-pack 源、共享治理与术语。
- Project layer：跨仓项目合同、项目级共享事实、repo 注册表。
- Repo layer：`.specnfc/`，仓内 canonical control plane。
- Change layer：`specs/changes/<change-id>/`，单项变更 dossier。
- Integration layer：`specs/integrations/<integration-id>/`，多人接口/service 对接 dossier。

## 3. 核心边界
### `.specnfc/`
承载仓内正式合同：
- repo contract
- stage machine
- doc index
- skill-pack snapshot
- projection config
- runtime-derived status artifact

### `.omx/`
承载运行时暂态：
- interviews/specs/plans/context/logs/state
- 可用于 Codex/OMX 兼容，但不能反向定义项目规范

### 入口投影层
- `AGENTS.md`
- `CLAUDE.md`
- `.trae/rules/project_rules.md`
- `opencode.json`

这些文件是**投影**，不是源；其内容由 `.specnfc/` 派生并由 `upgrade`/`init` 刷新。

## 4. 统一阶段机
canonical phase：`clarify -> design -> plan -> execute -> verify -> accept -> archive`

旧阶段保留兼容映射：
- `draft -> clarify`
- `design -> design`
- `ready -> plan`
- `in-progress -> execute`
- `verifying -> verify`
- `handoff -> accept`
- `archived -> archive`
