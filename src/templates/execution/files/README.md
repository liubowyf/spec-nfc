# `execution` 模块使用说明

这个目录定义阶段角色、输入输出、派单和交接方式。

## 文件

- `agents.md`：阶段角色、输入、输出、完成标准
- `input-output.md`：AI 输入输出标准
- `handoff.md`：交接规范
- `dispatch.md`：派单与回收规则
- `prompt-templates.md`：常用派单卡与回收卡模板
- `team-runtime.md`：团队运行规则
- `team-recovery.md`：团队卡住时的恢复步骤
- `AGENT.md`：给 AI 直接使用的执行规则

## 什么时候用

- 多人并行协作
- 多个 AI 工具共同参与
- 需要把一个 change 拆给不同角色或不同 Agent

## 最低要求

- 不允许跳过 `change` 直接执行
- 不允许只靠聊天记录交接
- 不允许输出长篇过程流水账给下游
