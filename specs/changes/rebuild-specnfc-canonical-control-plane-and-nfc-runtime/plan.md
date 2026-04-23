# Plan

## Phase 1：冻结合同对象与 schema
- 冻结 repo contract、stage machine、governance mode、doc contract、skill-pack manifest、projection policy、next-step、runtime sync、compliance report schema
- 完成 `.specnfc/design/*.schema.json`

## Phase 2：重做 `init / status / doctor`
- `init` 输出 repo contract、indexes、projection policy、skill-pack snapshot、`.nfc/` skeleton
- `status` 输出 control-plane dashboard
- `doctor` 输出 protocol health / compliance report

## Phase 3：接入 `.nfc/` 运行时与中文 skills
- 建立 `.nfc/context / interviews / plans / skills / state / logs / handoffs / sync`
- 固定 workflow skills、support skills、prompt catalog、writeback rules

## Phase 4：改造 `change / integration / projection`
- 接入 canonical phase + legacy mapping
- 接入 writeback queue 与 runtime links
- 接入 projection drift / skill-pack drift / waiver 可视化

## Phase 5：扩展 `upgrade` 与迁移旧仓
- 回填新 schema
- 执行 `.omx -> .nfc` 迁移
- 回填 change / integration meta 与 indexes
- 发布迁移手册与版本说明
