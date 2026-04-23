# Spec

## 变更标识
- ID：`rebuild-specnfc-canonical-control-plane-and-nfc-runtime`
- 类型：`design-system`
- 范围：`specnfc` 顶层协议与运行时设计

## 目标
1. 明确 `.specnfc/` 作为仓内唯一正式 control plane 的对象、目录、schema、阶段机与治理模式。
2. 明确 `.nfc/` 作为 `specnfc` 自有中文运行时与技能体系的承载模型。
3. 明确 team/project/repo/change/integration 五层对象与索引关系。
4. 重写 `init / change / integration / status / doctor / upgrade / explain / release` 的协议语义。
5. 明确 `.omx -> .nfc` 迁移策略与旧仓兼容方式。

## 范围
### 本次包含
- 顶层架构定稿
- 目录与对象模型
- schema 草案
- 阶段状态机与文档合同
- 中文 skills / prompt / skill-pack 设计
- governance / gate / waiver / compliance 设计
- 命令重构矩阵
- 迁移与升级策略

### 本次不包含
- 立刻重写全部实现代码
- 立刻删除 `.omx/` 既有历史文件
- 立刻引入 team/project 外部宿主服务
- 立刻实现重型 team runtime / tmux orchestration

## 验收标准
- [x] 已形成新的 change dossier
- [x] 已形成新的顶层设计包 `docs/08-顶层重构/specnfc-v3-nfc/`
- [x] 已给出 `.specnfc/design/*.schema.json` 草案
- [x] 已给出 `.nfc/specs/*` 运行时设计草案
- [x] 已明确 `.specnfc/`、`.nfc/`、正式 dossier、projection layer 的边界
- [x] 已定义 canonical phase、legacy mapping、gate、next-step contract
- [x] 已定义 governance mode、waiver、compliance report
- [x] 已给出旧仓升级与 `.omx -> .nfc` 迁移策略

## 约束
- 必须基于当前仓真实实现与文档现状，不得从零编造系统
- 继续保留当前顶级命令面为主，不走“靠新增很多命令解决问题”的路线
- 正式设计不再以 OMX 作为主术语，仅在迁移章节描述 legacy runtime
