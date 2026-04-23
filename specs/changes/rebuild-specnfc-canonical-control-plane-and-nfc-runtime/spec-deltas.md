# Spec Deltas

## 相对当前仓现状的关键变化

### 仓级层面
- `.specnfc/` 新增 `contract/`、`indexes/`、`skill-packs/active/`、`projections/`、`execution/` 等明确对象域。
- `config.json` 不再只是模块开关，还要与 repo contract、governance、projection policy、skill-pack policy 协同。

### 运行时层面
- 现有 `.omx/` 不再作为正式设计术语。
- 新增 `.nfc/` 作为中文运行时与协作层。
- 深访、规划、日志、handoff、writeback 均改由 `.nfc/` 体系解释。

### 对象层面
- `change meta` 与 `integration meta` 新增 `canonicalStage + legacyStage/legacyStatus`。
- `status / doctor` 新增 controlPlane / compliance / projection / skillPack / runtimeSync 输出段。

### 治理层面
- 新增 governance mode、waiver、compliance report、writeback gate。
- 入口文件漂移与 skill-pack 漂移从普通提示升级为可配置门禁事件。
