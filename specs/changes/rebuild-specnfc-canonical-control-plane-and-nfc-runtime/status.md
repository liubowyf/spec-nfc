# Status

- 当前阶段：`v3-gap-closure-step-5-complete`
- 当前结论：v3-nfc 顶层重构设计已完成，且 V3 五条需求补齐的 Step 1-5 与最后一块 skills 治理收口已完成当前版本要求；Step 5 已补齐 `specs/project/summary.md` 的实例级内容门禁、`release / bootstrap / upgrade` 的高价值失败路径 schema 回归，以及空白 `project summary` 的实例级回归。随后已完成一次真实 `v2.0.0` 发布重建与本地安装验证，并补齐 skills 官方上游源、runtime mirror、external imports 治理与对应回归。剩余尾部 advisory / manual-action 分支不再阻塞 V3 发布判断，转入后续版本 backlog。
- 已完成：
  - 当前现状确认
  - 已有能力 / 短板 / 保留资产归纳
  - `.specnfc/` control plane 设计
  - `.nfc/` runtime 设计
  - 阶段状态机、文档合同、治理模式、命令矩阵、迁移策略设计
  - `init / status / doctor / change / integration / upgrade` 的首轮 control-plane 实现改造
  - `status / doctor / change check / integration check` 的 JSON 输出 contract 冻结
  - `init / create / stage` next-step contract 统一
  - success / error JSON schema 已纳入 protocol plane 下发与检查
  - `version / explain` success output schema 已补齐，read-only 命令面也进入统一 output contract
  - `add` success output schema 已补齐，轻量模块扩展命令也进入统一 output contract
  - `release` 脚本级 JSON output schema 已补齐，并明确与主 CLI envelope 分层
  - `demo` success output schema 已补齐，示例仓生成命令进入统一 output contract
  - `bootstrap` 脚本级 JSON output schema 已补齐，安装脚本的失败步骤与证据字段被正式冻结
  - 已增加 schema 实例级回归校验，覆盖 `bootstrap / release / status / doctor` 的真实输出
  - `upgrade` success output schema 已补齐，并补上 `upgrade / add / demo` 的实例级 schema 回归校验
  - schema 读取与实例校验已提炼为通用测试 helper，并补上 `init / change / integration` 主路径实例级回归校验
  - 通用 error schema 的实例级回归校验已覆盖 `init / add / upgrade / change / integration / explain` 典型失败场景
  - 通用 error schema 已继续覆盖 `PATH_CONFLICT / PRECONDITION_FAILED / WRITE_DENIED` 等边界失败场景
  - skills 官方上游源、active snapshot、runtime mirror、external imports 治理与发布门禁已完成收口
- 未完成：
  - 团队评审
  - 低优先级 advisory / manual-action 分支的进一步自动回归扩展

- 本轮 Step 1 新增：
  - 已新增 `docs/08-顶层重构/specnfc-v3-nfc/12-V3需求补齐达成矩阵.md`，冻结 V3 五条需求的唯一完成判定
  - 已新增 `.specnfc/design/project-index.schema.json`，冻结项目层索引的最小对象模型
  - 已新增 `specs/project/README.md` 与 `specs/project/summary.md`，冻结 project-level canonical path
  - 已把 `project-index / project-summary` 缺失纳入治理设计与文档合同

- 本轮 Step 2 新增：
  - `init / upgrade` 已真实生成 `.specnfc/indexes/project-index.json`、`specs/project/README.md` 与 `specs/project/summary.md`
  - `updateRepositoryIndexes()` 已汇总 `teamContextRefs / changeRefs / integrationRefs / latestIterations`，形成项目层机器可读索引
  - `status --json` / `doctor --json` 已新增 `projectIndex` 摘要，`readingPath` 已优先带出 `specs/project/summary.md`
  - `doc-index`、项目记忆索引、OpenCode 指令与四类入口必读路径已纳入项目层索引路径
  - `doctor` 已能把 `project-index` 缺失识别为 advisory，并给出明确修复建议
  - 已新增自动回归覆盖 `project-index` 缺失的 advisory 边界，以及 `status` / `doctor` 的项目层索引输出

- 本轮 Step 3 新增：
  - `change check / status / doctor` 已读取 `.specnfc/contract/repo.json` 中的真实 `governanceMode`
  - `strict / locked` 模式下，`change stage --to in-progress` 会把 `.specnfc/indexes/project-index.json` 与 `specs/project/summary.md` 缺失视为 execute gate
  - `release` 已把 `PROJECT_INDEX_* / PROJECT_DOC_*` advisory 升级为发布门禁，缺失 project-level canonical path 时拒绝发布
  - `AGENTS.md`、`CLAUDE.md`、`.trae/rules/project_rules.md` 已补齐 canonical phases、project summary 优先读取和“不得跳过 clarify/design/plan”的强指导
  - workflow skill 文档与 stage-gate playbook 已补齐全局阶段顺序与 project-level preflight 说明
  - 已新增自动回归覆盖 strict governance mode 读取、execute gate project-level 阻断、release project summary 阻断

- 本轮 Step 4 新增：
  - `inspectEntryPolicies()` 已把 canonical phase、`specs/project/summary.md`、`不得进入 execute` 等关键指导纳入 `AGENTS.md / CLAUDE.md / .trae` 的 projection drift 检查
  - `opencode.json` 已把 `AGENTS.md`、`.specnfc/indexes/project-index.json`、`specs/project/**/*.md`、`specs/changes/**/*.md` 纳入完成态指令检查
  - `inspectControlPlane().projectionStatus` 已改为基于真实 projection health 计算，避免“有 drift 但未体现在 status/compliance”的漏报
  - 已新增 `tests/projection-skillpack-v3.test.mjs`，覆盖四工具完成态同源证据、入口缺少 canonical phase / project summary 漂移、OpenCode 缺少 project-level 指令漂移，以及 clean release preflight 通过

- 本轮 Step 5 新增：
  - `inspectProjectIndex()` 已把 `specs/project/summary.md` 从“只检查存在性”升级为“内容级门禁”，可识别空文档、必填章节缺失与初始化占位内容
  - `projectIndex.summaryContract` 已输出 `requiredSections / missingSections / placeholderMarkers`，供 `status / doctor` 与 AI agent 读取
  - `buildComplianceRecommendedActions()`、`status next`、`nextStepProtocol` 已补齐针对 `PROJECT_SUMMARY_*` 的具体修复建议
  - 已新增回归覆盖：
    - 初始化默认 summary 的 `PROJECT_SUMMARY_PLACEHOLDER` advisory；
    - 空白 summary 的 `PROJECT_SUMMARY_EMPTY` advisory；
    - 缺少必填章节时 `status` 的 next-step / missing 提示；
    - `bootstrap INVALID_PACKAGE_JSON` 的 schema 实例；
    - `upgrade` 配置损坏时 `WRITE_DENIED` 的 schema 实例；
    - `release INVALID_VERSION` 的 schema 实例；
    - `release REQUIRED_FILES_MISSING` 的 schema 实例；
    - `release ARCHIVE_VALIDATION_FAILED` 的 schema 实例；
    - `release RELEASE_DIR_EXISTS` 的 schema 实例；
    - `release TOOL_MISSING` 的 schema 实例；
    - `bootstrap NODE_VERSION_UNSUPPORTED` 的 schema 实例；
    - `upgrade` 遇到损坏的 legacy change / integration `meta.json` 时的 backfill 风险与人工动作实例；
    - `release` 安装验证链路中的 `demo` 失败实例；
    - `release` 安装验证链路中的 `doctor` 失败实例；
    - `release` 安装验证链路中的 `bootstrap` 失败实例；
  - 最新定向验证 `node --test tests/verification-regression.test.mjs` 已通过（`39/39`）
  - 最新全量 `node --test` 已通过（`159/159`）

- 本轮新增：
  - `doctor` 已新增中文“协议合同健康摘要”输出块
  - `doctor --json` 已新增 `data.contractHealthSummary`，在不改动既有英文字段名的前提下补充中文摘要对象
  - `doctor` 非 JSON 输出中的 `Control Plane / Compliance / Next-step Protocol / Profile` 等标题与标签已完成中文化
  - `status` 已新增中文“协议合同健康摘要”输出块
  - `status --json` 已新增 `data.contractHealthSummary`，在不改动既有英文字段名的前提下补充中文摘要对象
  - `status` 非 JSON 输出中的 `Control Plane / Compliance / Next-step Protocol / Profile` 等标题与标签已完成中文化
  - `change check / integration check` 已新增中文“协议合同健康摘要”输出块与 `data.contractHealthSummary`
  - 已抽取 `src/cli/contract-formatters.mjs`，统一 `status / doctor / change check / integration check` 的中文合同摘要 builder、阶段/协议文本翻译与人类可读输出格式，降低后续输出漂移风险
  - 共享 formatter 抽取后的静态导入检查、`tests/verification-regression.test.mjs` 与全量 `node --test` 已验证通过
  - 已把中文 workflow skills / support skills / prompt catalog 从 manifest 与设计稿落为仓内可执行文件，并纳入 `init / upgrade` 共用的 protocol artifact 生成链路
  - 已新增 `.specnfc/skill-packs/active/workflow/*.md`、`.specnfc/skill-packs/active/support/*.md`、`.specnfc/skill-packs/active/prompts/*.md`
  - 已新增 `.nfc/skills/workflow/*.md`、`.nfc/skills/support/*.md`、`.nfc/skills/prompts/*.md` 与 `.nfc/skills/playbooks/*.md` 运行时镜像
  - `inspectControlPlane()` 已把 skill-pack / runtime skills 实体文件纳入 control-plane 完整性检查
  - `init --profile enterprise`、`upgrade` control-plane 回填场景与全量 `node --test` 已验证通过
  - 已新增 `src/kernel/waivers.mjs`，统一读取 `.specnfc/governance/waivers/*.json` 并判断有效 / 过期 / 无效状态
  - `inspectRepository()` / `buildComplianceReport()` 已接入 waiver 链路，可把 `projectionStatus`、`skillPackStatus` 等 advisory 按有效 waiver 覆盖，并把 `WAIVER_INVALID / WAIVER_EXPIRED` 升级为 blocking
  - `summarizeReleaseReadiness()` 已把未豁免的 `PROJECTION_DRIFT` 与 `SKILL_PACK_*` 纳入仓级发布阻断
  - `doctor` 已新增“豁免摘要”，可直接看到 waiver 数量、状态和已覆盖问题
  - `upgrade` 已把 `WAIVER_INVALID / WAIVER_EXPIRED / PROJECTION_DRIFT_REVIEW / SKILL_PACK_DRIFT_REVIEW` 纳入风险摘要与人工动作
  - `scripts/release.mjs` 已新增仓级发布门禁：已初始化仓若存在 blocking issues 或未豁免的 projection / skill-pack drift，将直接阻断发布
  - 已新增针对性测试覆盖 doctor waiver、upgrade drift 风险、release gate；最新全量 `node --test` 已通过（`121/121`）
  - 已继续补失败路径回归，覆盖 `WAIVER_INVALID` 的 `doctor / upgrade` 分支，以及 `release --dry-run` 在 skill-pack drift 被有效 waiver 覆盖时的放行分支
  - 已继续补 `waiver JSON 解析失败` 与 `过期 waiver 阻断 release` 的异常分支回归
  - 已完成旧版 `specnfc-v3` 设计稿与旧 change dossier 的 superseded / archive 标记，降低新旧双轨文档误读风险
  - 已细化 `doctor / status` 在 projection drift、无效/过期 waiver、skill-pack drift、runtime writeback pending 等场景下的 `recommendedActions / next`，输出更具体可执行的修复动作
  - 已新增针对性回归，覆盖 `doctor` 的 projection drift 建议、invalid waiver 建议，以及 `status` 在 drift 场景下带出具体 next
  - 已继续补回归，覆盖 `SKILL_PACK_*`、`WAIVER_EXPIRED` 与 `RUNTIME_WRITEBACK_PENDING` 的具体修复建议输出
  - 已继续补回归，覆盖 `PROJECT_MEMORY_*` 与 `REPOSITORY_DOC_*` 的具体修复建议输出
  - 已开始进入“更多失败路径 / 非常规异常分支的 schema 与实例回归”阶段，新增脚本级阻断与异常分支 schema 回归
  - 已补 `release gate blocked`、`release expired waiver gate blocked`、`release invalid waiver gate blocked`、`bootstrap invalid root json` 与 `bootstrap verify-local-cli failed` 的 schema 实例校验
  - 已收紧 `bootstrap` human 模式伪源码仓拦截的错误文案回归，固定失败前缀、细节块与 `--dry-run` 建议提示
  - 最新定向验证 `node --test tests/verification-regression.test.mjs` 已通过（`26/26`）
  - 已新增 `skill-packs/specnfc-zh-cn-default/` 官方上游源，并将 workflow / support / governance / prompts / playbooks 全量纳入 manifest 管理
  - 已新增 `src/kernel/skill-pack-source.mjs`，统一从官方上游源读取 skill-pack 定义与源文件
  - `src/kernel/scaffold.mjs` 已改为从官方上游源真实生成 `.specnfc/skill-packs/active/*`、`.nfc/skills/*`、`.nfc/imports/` 与 governance/playbooks 目录
  - 已新增 `.specnfc/design/external-skill-adapter.schema.json`，并扩展 `skill-pack-manifest.schema.json` 覆盖 governance skills、playbooks、external skill policy 等字段
  - 已新增 `src/kernel/external-skill-imports.mjs`，把外部 skill imports 的结构校验、安全留存、待写回状态与 trust tier 汇总接入 `status / doctor / compliance`
  - `status / doctor / release` 已能把 `EXTERNAL_SKILL_IMPORT_INVALID / EXTERNAL_SKILL_GOVERNED_PENDING_WRITEBACK / EXTERNAL_SKILL_RETENTION_EXPIRED / EXTERNAL_SKILL_SECURITY_POLICY_VIOLATION` 作为治理结果消费
  - 已新增 `tests/external-skill-imports.test.mjs`，并完成 `tests/projection-skillpack-v3.test.mjs`、`tests/governance-records.test.mjs` 的收口验证
  - 最新定向验证 `node --test tests/project-index.test.mjs tests/phase-gate-v3.test.mjs tests/projection-skillpack-v3.test.mjs tests/doc-contract-v3.test.mjs tests/verification-regression.test.mjs tests/external-skill-imports.test.mjs tests/governance-records.test.mjs` 已通过（`63/63`）
  - 当前最新全量 `node --test` 已通过（`182/182`）
- 下一步：
  - 清理工作区并完成 Lore 提交
  - 在干净工作区上重跑 `node --test` 与 `node ./scripts/release.mjs --dry-run --json`
  - 进入正式发布与对外分发阶段，并把剩余低优先级 advisory / manual-action 异常分支整理为后续 backlog

## V3 补齐主线进度

- Step 1：冻结验收矩阵与 canonical path → **100%**
- Step 2：补齐分层记忆与项目总索引 → **100%**
- Step 3：补齐阶段强制模型与 AI agent 指导 → **100%**
- Step 4：补齐中文 skill-pack 与四工具完成态证据 → **100%**
- Step 5：补齐文档合同实例级门禁与回归 → **100%**

> 按 V3 五条需求补齐主线计算：当前版本目标已达 **100%**。剩余尾部 advisory / manual-action 异常分支属于后续质量增强，不再阻塞本轮发布判断。

## 当前改造完成度评估

> 说明：`tasks.md` 早期清单已落后于真实实现，当前百分比以**实际代码、schema、测试与脚手架落地情况**为准，而不是只按最初待办勾选。

- 总体完成度（按“v3-nfc 顶层重构 + 首轮实现”口径）：**约 95%**
- 其中：
  - **设计与 schema 层：约 95%**
  - **核心命令与 control-plane 首轮落地：约 92%**
  - **完整治理闭环与运行时产品化：约 80%**

## 最新发布验证补充

- 已修复 `scripts/release.mjs` 在 macOS 环境下打包时混入 `._* / __MACOSX` 元数据文件的问题：
  - 发布拷贝阶段显式排除 `._* / __MACOSX / .DS_Store`
  - 归档命令显式注入 `COPYFILE_DISABLE=1`
- 已新增回归，要求 `release` 产物内不得出现 macOS 元数据条目
- 已执行真实发布：`node ./scripts/release.mjs --force --json`
  - 版本：`2.0.0`
  - 目录：`dist/release/v2.0.0`
  - tar/zip 安装验证：通过
  - 产物显式检查：`tar_has_mac_metadata=false`、`zip_has_mac_metadata=false`

### 按 Phase 评估

1. **Phase 1：冻结合同对象与 schema** → **95%**
   - 已完成：`.specnfc/design/*.schema.json`、设计文档包、JSON output contract、实例级 schema 回归。
   - 未完成：团队评审后的正式冻结结论还未补。
   - 当前判断：**未正式收口，但已具备进入 Phase 2 的条件**。差的是冻结结论落文，不是主功能缺口。
   - 进入 Phase 2 的条件：schema 已落仓；设计文档与 schema 对齐；不再继续改 schema 语义。

2. **Phase 2：重做 `init / status / doctor`** → **90%**
   - 已完成：`init` 接入 `.specnfc + .nfc` skeleton、repo contract/indexes/skill-pack snapshot/projection policy；
     `status / doctor` 已输出 controlPlane / compliance / nextStep / projection / runtime sync。
   - 未完成：更细粒度的 schema drift / 实例失配诊断仍可增强。
   - 当前判断：**已满足进入 Phase 3 的条件**。后续增强只属于诊断精度，不再影响阶段推进。
   - 进入 Phase 3 的条件：`init / status / doctor` 主链稳定；对象与输出 contract 不再大改；剩余问题不能是缺主对象。

3. **Phase 3：接入 `.nfc` 运行时与中文 skills** → **85%**
   - 已完成：`.nfc` skeleton、runtime.json、pending-writeback、writeback history、next-step protocol、运行时设计稿、中文 workflow/support skills、prompt catalog 与 runtime playbooks 的仓内可执行文件。
   - 未完成：更细的 runtime 锁、handoff 编排和更强的 writeback 自动化仍可继续增强。
   - 当前判断：**已满足进入 Phase 4 的条件**。runtime 已形成从属层，不再反向定义 control plane。
   - 进入 Phase 4 的条件：structured next-step / writeback 队列已可被 `change / integration` 消费；不再新增会改变正式对象边界的 runtime 能力。

4. **Phase 4：改造 `change / integration / projection`** → **90%**
   - 已完成：canonical phase / legacy mapping、`meta.json`、`runtime-links.json`、writeback target、projection drift / skill-pack drift 可见化、`change/integration` gate 与 check/stage 首轮接入。
   - 已补齐：waiver validity、projection drift、skill-pack drift 的 `doctor / upgrade / release` 阻断与豁免链路。
   - 未完成：projection/skill-pack 漂移的自动修复建议仍可继续细化。
   - 当前判断：**主链已完成，当前只是在补异常分支与修复建议精度**。
   - 进入 Phase 5 的条件：`change / integration / projection` 主链稳定；剩余问题只允许是异常分支覆盖率或修复建议精度，不能再是主流程缺口。

5. **Phase 5：`upgrade` 迁移旧仓并发布** → **88%**
   - 已完成：legacy `.omx -> .nfc` 最小迁移报告、schema backfill、change/integration meta/runtime-links 回填、保守升级策略、发布与安装校验主链路。
   - 已补齐：发布前 compliance / waiver / projection / skill-pack 门禁串联。
   - 未完成：更广覆盖的旧仓迁移校验与更多异常分支校验仍需补强。
   - 当前判断：**已进入发布与迁移完善阶段**。是否继续补细节，应只看是否影响发布门禁、安装验证或旧仓升级可靠性。

## 阶段推进结论（后续统一按此执行）
- **不再因为低价值尾部细节阻止阶段推进。**
- 进入下一阶段只看：
  1. 当前 Phase 的主链是否完成；
  2. 是否仍存在新的主流程缺口；
  3. 是否影响发布门禁、安装验证、旧仓升级可靠性。
- 仅属于异常分支覆盖率、修复建议精度、可视化增强的事项，一律进入 backlog，不再作为阶段阻断条件。

## 待处理改造点（按优先级）

### P1：高优先级，建议先做
- 继续扩展 JSON output contract 的实例级回归，覆盖更多脚本失败路径和异常分支。
- 让 skill-pack / runtime artifact 缺失时的修复建议更具体，而不只是报告缺失。
- 说明：**P1 是后续增强优先级，不等于仍停留在 Phase 1。**

### P2：中优先级，影响长期可维护性
- 让 `doctor / status` 输出更细粒度的 schema 漂移、实例失配与修复建议。
- 补更完整的发布前 `install verify + compliance` 串联，减少“发布后才发现包缺文件”的风险。
- 说明：进入 P2 的前提是 P1 的高价值异常分支补强已达到“不会再新增发布主风险”的程度，而不是所有细节全补完。

### P3：低优先级，可在后续版本继续
- 继续细化 `.nfc` runtime 的状态锁、handoff、writeback history 可视化。
- 继续扩大 release/bootstrap/manual path 的自动校验覆盖率。
- 说明：P3 / P4 类事项默认不阻断当前版本收口与发布，除非重新暴露主流程缺口。

## 自检结论
- [x] 是否真的基于当前仓库与上下文，而不是新造世界？
- [x] 是否明确了 `.specnfc/`、`.nfc/`、正式 dossier、入口投影层之间的边界？
- [x] 是否把 oh-my-codex 的参考点改造成了去品牌化、中文化的 `nfc` 体系？
- [x] 是否定义了 team/project/repo/change/integration 多层对象与索引？
- [x] 是否把 `init` 提升成“项目协议接入动作”？
- [x] 是否定义了 canonical phase、legacy mapping、门禁、next-step contract？
- [x] 是否定义了 document contract 与 required sections？
- [x] 是否定义了 governance mode、execution gate、waiver、compliance model？
- [x] 是否定义了 `.nfc` runtime、writeback、sync、locks、handoff？
- [x] 是否设计了 projection policy 与 drift handling？
- [x] 是否给出了旧仓升级与 `.omx -> .nfc` 迁移策略？
- [x] 是否给出了足够具体、可执行的文件级交付？
