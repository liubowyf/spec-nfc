# 对接契约模块使用说明

当同一仓内有双人或多人接口 / service 对接时，使用本模块。

它的目标不是替代 `change`，而是把多人协作里的接口约定、责任分工、阻塞状态和联调进展，变成正式工程对象。

## 什么时候该用

出现下面任一情况时，建议启用：

- 同一个 change 内，provider 和 consumer 分属不同人
- 不同 change 之间存在接口依赖
- 需要把“接口已对齐”作为进入实现的前置条件
- 联调状态不能只留在聊天里

## 最低要求

- 先创建 integration 实体
- 先写契约和责任分工
- 先明确联调前置和验收标准
- integration 至少达到 `aligned` 才能进入 `in-progress`

## 正式文件结构

每条 integration 固定落在：

```text
specs/integrations/<integration-id>/
├─ meta.json
├─ contract.md
├─ decisions.md
└─ status.md
```

重点要求：

- `contract.md`：写接口定义、责任分工、前置条件、验收标准
- `decisions.md`：写确认项、拒绝项、待裁决项，作为对接局部决策记忆
- `status.md`：写当前状态、阻塞、下一步、验证结论，作为联调进展记忆

## 作为过程记忆的职责

`specs/integrations/` 承担**integration 级过程记忆**，主要记录：

- 接口 / service 已对齐的正式事实
- 被拒绝或待裁决的对接结论
- 当前联调状态、阻塞与验证结果

这些内容必须回写正式文件，不能只存在于聊天记录。

## 常用命令

```bash
specnfc integration create <integration-id> --provider <provider> --consumer <consumer> --changes <change-id,...>
specnfc integration list
specnfc integration check
specnfc integration stage <integration-id> --to aligned
```

## 推荐流程

```bash
specnfc change create risk-score-upgrade --title "风险评分升级"
specnfc integration create account-risk-api --provider risk-engine --consumer account-service --changes risk-score-upgrade
specnfc integration check account-risk-api
specnfc integration stage account-risk-api --to aligned
specnfc change stage risk-score-upgrade --to in-progress
```

## 固定状态

- `draft`
- `aligned`
- `implementing`
- `integrating`
- `blocked`
- `done`

## 关键规则

- `draft` / `blocked` / 不存在的 integration，不允许其依赖 change 进入 `in-progress`
- 进入 `blocked` 前，必须在 `status.md` 写清阻塞原因
- 进入 `done` 前，必须在 `status.md` 写清验证结论
