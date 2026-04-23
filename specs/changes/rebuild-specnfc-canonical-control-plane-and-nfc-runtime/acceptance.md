# Acceptance

## 验收范围
- 顶层架构是否完成从 `.omx compatibility design` 到 `.nfc native runtime design` 的切换
- 是否完成 `.specnfc/` control plane 与 `.nfc/` runtime 的边界冻结
- 是否给出 team/project/repo/change/integration 多层对象与 schema
- 是否给出 canonical phase、document contract、governance mode、waiver、next-step、compliance 设计
- 是否已冻结 V3 五条核心需求的唯一验收矩阵与 project-level canonical path

## 验收方式
- 核查 `docs/08-顶层重构/specnfc-v3-nfc/`
- 核查 `.specnfc/design/*.schema.json`
- 核查 `.nfc/specs/*`
- 核查 `specs/project/README.md`、`specs/project/summary.md`
- 核查本 change dossier 各文档内容是否一致

## Step 1 验收标准（V3 补齐冻结）
1. 已新增 `docs/08-顶层重构/specnfc-v3-nfc/12-V3需求补齐达成矩阵.md`；
2. 已新增 `.specnfc/design/project-index.schema.json`；
3. 已新增 `specs/project/README.md` 与 `specs/project/summary.md` 作为固定路径；
4. `acceptance/tasks/status` 已同步切换到 V3 五条需求补齐口径。

## Step 5 验收结果（文档合同实例级门禁）
1. `doctor --json` / `status --json` 已能识别 `specs/project/summary.md` 的空文档、必填章节缺失与初始化占位内容；
2. `projectIndex.summaryContract` 已输出 required sections、missing sections 与 placeholder markers；
3. 已有针对性回归覆盖：
   - 初始化默认 summary 占位 advisory；
   - 空白 summary 的 `PROJECT_SUMMARY_EMPTY` advisory；
   - 缺少必填章节时的 next-step / compliance 输出；
   - `release / bootstrap / upgrade` 高价值失败路径与安装验证链路 schema 实例；
4. 最新全量 `node --test` 已通过（`182/182`）；
5. 尾部 advisory / manual-action 异常分支转入后续 backlog，不阻塞 V3 当前版本验收。

## Skills 治理收口验收结果
1. 官方 skill-pack 上游源已固定到 `skill-packs/specnfc-zh-cn-default/`，并包含 `workflow / support / governance / prompts / playbooks` 全量中文对象；
2. `init / upgrade` 已从上游源真实生成 `.specnfc/skill-packs/active/*` 与 `.nfc/skills/*`，不再依赖脚手架内硬编码 skills 清单；
3. 已新增 `.specnfc/design/external-skill-adapter.schema.json`，并扩展 `skill-pack-manifest.schema.json` 覆盖 governance skills、playbooks、external skill policy 等字段；
4. 外部 skill imports 已纳入 `status / doctor / compliance / release` 治理链，能够识别未写回、保留期过期与安全违规；
5. 已通过定向回归：
   - `tests/external-skill-imports.test.mjs`
   - `tests/projection-skillpack-v3.test.mjs`
   - `tests/governance-records.test.mjs`
   - 上述定向组合回归共 `63/63` 通过。

## 验收结论
- 当前状态：**Step 1-5 与 skills 治理收口均已完成当前版本验收目标**。V3 五条需求的验收矩阵、project-level canonical path、`project-index` 真实生成、正式 gate、AI 入口阶段指导、官方 skill-pack 上游源、四工具完成态证据，以及 `specs/project/summary.md` 的实例级内容门禁均已落地。
- 后续动作：清理工作区、完成 Lore 提交、在干净工作区上重跑发布前验证，然后进入正式发版。
