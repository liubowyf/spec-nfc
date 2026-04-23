# Spec — v3 canonical control plane

## 目标结果
### R1 `.specnfc/` 成为仓级 control plane
初始化或升级后，仓内必须存在清晰的 repo contract、stage machine、索引、skill-pack snapshot 与 entry projection 配置，且这些对象成为仓内唯一正式协议源。

### R2 多层对象有稳定 schema
必须定义 team / project / repo / change / integration 五层最小 schema、引用关系和 canonical path/ref 规则。

### R3 `init` 升级为协议接入动作
`init` 完成后默认成立：
- 项目合同已建立
- 仓内 repo contract 已生成
- 默认 stage machine 已初始化
- 团队 skill-pack 已快照到仓内
- 入口投影文件已从 contract 派生
- next-step protocol 已可输出

### R4 状态输出要能做“下一步引导”
`status` / `doctor` / `change check` / `integration check` 必须统一输出：
- 当前阶段
- 已完成
- 缺失
- 阻断项
- 推荐下一步

### R5 迁移必须渐进
旧仓可先保留现有目录和旧 stage 别名，通过 `upgrade` 分阶段接入新 schema 与投影层。

## 门禁要求
- change / integration 的阻断继续保留，并接入 canonical phase 语义。
- team/project 层缺失默认先 advisory-first，不直接阻断当前 change 实施。
- repo contract 缺失、entry projection 严重漂移、canonical path 被破坏时，由 `doctor` 判为协议异常。
