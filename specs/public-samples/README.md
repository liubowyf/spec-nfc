# 公开 dossier 样例

这里保留的是适合公开说明的静态样例，而不是当前仓的真实内部演进历史。

推荐按下面顺序阅读：

## 1. init：先理解初始化后的项目骨架

- `init/`：初始化后项目级摘要样例

适合先理解：

- 项目级摘要如何承接长期索引
- `.specnfc/`、`.nfc/`、`specs/` 三层在项目中的角色
- 仓为什么会在初始化后具备后续协作的基础结构

## 2. change-full：再理解一条 change 如何闭环

- `change-full/`：一条完整 change 的四主文档样例

建议阅读顺序：

1. `01-需求与方案.md`
2. `02-技术设计与选型.md`
3. `03-任务计划与执行.md`
4. `04-验收与交接.md`
5. `meta.json`

适合理解：

- 需求边界与方案如何收口
- 什么情况下需要单独补技术设计与选型
- 任务计划、执行状态、验收交接如何一路串起来

## 3. integration-full：最后理解多人接口 / service 对接如何收口

- `integration-full/`：一条完整 integration 的契约 / 决策 / 状态样例

建议阅读顺序：

1. `contract.md`
2. `decisions.md`
3. `status.md`
4. `meta.json`

适合理解：

- provider / consumer / changes 如何建立依赖关系
- integration 如何表达阻断、对齐状态与联调结论
- change 与 integration 如何协同推进，而不是各自分裂演进
