# Tasks

## 既有完成项
- [x] 阅读当前仓文档、实现、入口层、运行时与既有设计产物
- [x] 基于仓内证据归纳现状、已有能力、短板与不应推倒重来的部分
- [x] 产出新的顶层设计 change dossier
- [x] 产出新的顶层设计文档包 `docs/08-顶层重构/specnfc-v3-nfc/`
- [x] 产出 `.specnfc/design/*.schema.json` 草案
- [x] 产出 `.nfc/specs/*` 运行时设计草案
- [x] 完成 `init / status / doctor` 的首轮 control-plane 实现改造
- [x] 完成 `change / integration / upgrade` 的首轮协议接入改造
- [x] 完成主路径 success / error JSON output contract 冻结与实例级回归校验
- [x] 完成 `status / doctor / change check / integration check` 中文合同健康摘要与共享 formatter 收口
- [x] 把中文 workflow/support skills 与 prompt catalog 从“设计稿 + manifest”落为仓内可执行包
- [x] 把 waiver validity、projection drift、skill-pack drift 的完整阻断/豁免链路补齐到 `doctor / upgrade / release`
- [x] 细化 `doctor / status` 在 drift / waiver / writeback 场景下的修复建议输出，保持现有命令面与 JSON key 不变
- [x] 收口旧版 `specnfc-v3` 设计稿与旧 change dossier 的归档 / superseded 标记，避免双轨文档继续并存
- [x] 把 skills 正式上游源切换为 `skill-packs/specnfc-zh-cn-default/`，不再依赖脚手架内硬编码清单
- [x] 补齐 `.specnfc/skill-packs/active/*` 与 `.nfc/skills/*` 的 governance / playbooks / runtime mirror 生成链路
- [x] 把外部 skill imports 治理接入 `status / doctor / compliance / release`，并补齐对应自动回归

## V3 五条需求补齐（当前主线）
### Step 1：冻结验收矩阵与 canonical path
- [x] 冻结 V3 五条需求达成矩阵
- [x] 冻结 `project-index.json` 的最小 schema
- [x] 冻结 `specs/project/README.md` 与 `specs/project/summary.md` 的 canonical path
- [x] 把 `project summary` 纳入文档合同与治理模型
- [x] 同步更新本 change dossier 的 `acceptance / tasks / status`

### Step 2：补齐分层记忆与项目总索引
- [x] 让 `init / upgrade` 真实生成 `.specnfc/indexes/project-index.json`
- [x] 让 `status / doctor` 输出 project-level 索引摘要与缺口
- [x] 让项目总索引引用 change / integration 结果与团队级上下文 ref

### Step 3：补齐阶段强制模型与 AI agent 指导
- [x] 把 `project-index / project-summary` 缺失纳入正式 gate
- [x] 补齐入口投影与 workflow skills 中的阶段顺序指导
- [x] 串联 active change / phase prerequisite / verify / handoff / release gate

### Step 4：补齐中文 skill-pack 与四工具完成态证据
- [x] 对齐四类入口的同源规则与项目层索引入口
- [x] 为 projection drift / skill-pack drift 补齐完成态验证
- [x] 冻结官方 skill-pack manifest 的 workflow / support / governance / prompt / playbook 元数据
- [x] 建立外部 skill adapter / imports 的 schema、目录与安全/写回治理

### Step 5：补齐文档合同实例级门禁与回归
- [x] 把 `specs/project/summary.md` 纳入实例级门禁
- [x] 扩展 schema 自动校验到高价值脚本失败路径、关键异常分支与发布前校验（低优先级尾部分支转入后续 backlog）

## 当前最小后续实现清单
1. 发布前清理工作区并排除无关未跟踪目录
2. 在干净工作区上重跑 `node --test` 与 `node ./scripts/release.mjs --dry-run --json`
3. 按 Lore 协议提交本轮 skills 治理收口改动
