# Status

- 当前阶段：`superseded`
- 当前结论：本旧版 v3 顶层协议设计已被 `rebuild-specnfc-canonical-control-plane-and-nfc-runtime` 主线正式取代，当前仅保留作历史归档。
- 已完成：
  - 现状阅读与证据归纳
  - 真正问题定义
  - 顶层架构、目录、对象 schema、阶段状态机、skill-pack、命令矩阵、迁移策略设计
  - deep-interview 规格沉淀
- 未完成：
  - 不再继续沿本 dossier 推进评审、实现与发布
- 下一步：
  - 统一转到 `docs/08-顶层重构/specnfc-v3-nfc/`
  - 统一转到 `specs/changes/rebuild-specnfc-canonical-control-plane-and-nfc-runtime/`

## 设计自检
- [x] 是否基于当前仓库现状，而不是重写一套新世界？
- [x] 是否明确了 `.specnfc/`、`.omx/`、入口投影层三者边界？
- [x] 是否定义了 team/project/repo/change/integration 多层对象和索引？
- [x] 是否把 `init` 提升成“项目协议接管动作”？
- [x] 是否定义了阶段状态机、文档位置、门禁、next-step protocol？
- [x] 是否避免把方案做成重型 runtime 或审计平台？
- [x] 是否给出现有命令面、旧仓升级链路的兼容方案？
- [x] 是否给出可直接进入下一轮实现的文档与 schema？
