# Decisions

## 决策 1：`.specnfc/` 是仓内唯一正式 control plane
- 背景：当前 `.specnfc/` 已是规则与模板承载位，但还不是严格定义的协议源。
- 结论：正式协议、阶段机、indexes、skill-pack snapshot、projection policy、governance mode 均从 `.specnfc/` 派生。
- 影响：所有入口文件、next-step、compliance、升级迁移都必须以 `.specnfc/` 为源。

## 决策 2：`.nfc/` 是 `specnfc` 自有中文运行时
- 背景：当前 `.omx/` 已承载访谈、计划、状态、日志，但品牌与主权不属于 `specnfc`。
- 结论：吸收其有价值的 runtime 分层思想，但改造为 `.nfc/` 中文运行时，不再把 `.omx/` 作为正式术语。
- 影响：必须提供 `.omx -> .nfc` 迁移策略与 writeback 规则。

## 决策 3：继续保留当前顶级命令面
- 背景：当前用户已明确要求命令不要变多、不要复杂。
- 结论：优先重写 `init / add / change / integration / status / doctor / upgrade / explain / release` 语义，不靠新增大量命令解决问题。
- 影响：新能力要通过对象、schema、gate、next-step、skill-pack manifest 收敛。

## 决策 4：治理采用“强导向 + 有限强制”
- 背景：团队混用不同模型和工具，不能靠重型审计系统或强制统一工具。
- 结论：过程建议强，结果门禁硬；允许个人工具存在，但项目合规只看仓内 contract、dossier、indexes、gate。
- 影响：需要 governance mode、waiver、compliance report。
