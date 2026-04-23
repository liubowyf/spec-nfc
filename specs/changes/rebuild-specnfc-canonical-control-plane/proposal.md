> **归档说明**
>
> 本 proposal 已被 `specs/changes/rebuild-specnfc-canonical-control-plane-and-nfc-runtime/proposal.md` 正式取代。
> 当前仅保留作历史设计归档，不再作为当前实现主线。

# Proposal — 重建 Spec nfc 的 canonical control plane

## 背景
当前 `specnfc` 已经真实具备仓级初始化、change/integration 生命周期、项目记忆摘要、入口投影、模板升级与发布闭环等能力，但这些能力仍主要表现为“仓内规范脚手架 + 文档门禁工具”，尚未升级为团队协作中的项目默认协议系统。

## 要解决的问题
1. 规范存在，但不同模型/不同 Agent/不同个人工具进入项目后不会默认进入同一流程。
2. `.specnfc/` 已承载规则与文档模板，但尚未成为明确的 canonical control plane。
3. 当前有项目记忆与状态摘要，但 team / project / repo / change / integration 尚未形成完整分层对象模型。
4. `init` 仍偏目录初始化，未升级为“项目接入协议”的明确动作。

## 目标
- 把 `.specnfc/` 提升为仓级 canonical control plane。
- 把现有命令面升级为协议化命令，而不是新增大量新命令。
- 把 team / project / repo / change / integration 串成多层索引与阶段协议。
- 保持旧仓可通过 `upgrade` 渐进迁移。

## 非目标
- 不复制完整 oh-my-codex runtime。
- 不引入重型 team runtime 或行为审计平台。
- 不做跨仓全文镜像。
- 不以新增大量顶级命令为主路径。
