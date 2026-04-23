# Release Handoff

## 交付摘要
- 本次交付不是代码实现，而是 `specnfc v3-nfc` 顶层设计定稿。
- 正式产物包括：新 change dossier、顶层设计包、schema 草案、`.nfc` runtime 设计草案。

## 下游接手建议
1. 先阅读 `docs/08-顶层重构/specnfc-v3-nfc/01-目标架构总览.md`
2. 再阅读 `02-分层模型与对象schema.md`、`03-阶段状态机与文档合同.md`
3. 然后冻结 `.specnfc/design/*.schema.json`
4. 最后进入 `init / status / doctor` 的实现 Phase 1

## 风险提示
- 当前只是设计冻结草案，尚未修改实现代码
- `.specnfc/` 与 `.nfc/` 的真实落地还需要兼容当前 config / scaffold / upgrade 逻辑
- `.omx` 迁移需保守进行，避免覆盖历史上下文
