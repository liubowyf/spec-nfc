# `governance` 模块使用说明

这个目录定义高风险改动下的边界、裁决和交接要求。

## 文件

- `decision-gates.md`：裁决点规则
- `release-handoff.md`：发布交接规则
- `security-boundaries.md`：安全边界
- `multi-repo.md`：多仓协作规则
- `risk-matrix.md`：风险等级矩阵
- `review-checklist.md`：评审检查清单
- `personal-skills.md`：个人 Skills 兼容规则
- `AGENT.md`：给 AI 直接使用的治理规则

## 作为项目长期记忆的职责

本目录承担**高风险边界、裁决点、发布边界与协作边界**的长期记忆，主要回答：

- 什么场景必须停下并升级处理
- 哪些风险、发布和安全边界不能被当前 change 私自突破
- 多人、多工具协作时，哪些规则不能被个人习惯覆盖

## 使用时机

- 高风险改动
- 需要人保留关键裁决点
- 多仓或多团队联动
- AI 参与但发布仍由人接手
- 团队成员混用不同 skills、提示词和本地工作流
