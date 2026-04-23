# Changelog

本文件记录 `spec-nfc` 面向公开发布面的版本演进。

同时可配合查看：

- [GitHub Releases](https://github.com/liubowyf/spec-nfc-cli/releases)
- [npm 包页面](https://www.npmjs.com/package/spec-nfc)

---

## v3.2.1 - 2026-04-23

当前补丁版本，聚焦修复 `clarify / design` 阶段“先确认、再定稿”的实际落地问题。

### 修复
- 修复默认新建 change 时，空白模板字段被误判为“已写当前选择 / 已写选型结论”的问题
- 修复 `change check / status / doctor` 在未确认前未能稳定提示“先提问、再写结论”的问题
- 修复默认模板下 readiness gate 与 ambiguity 计算偏差，避免把“确认记录”误判为已完成
- 修复发布链路仍保留 tar/zip 双包、双安装校验导致发版偏慢的问题，统一切换为 npm-only 校验链路

### 强化
- `01-需求与方案.md` 与 `02-技术设计与选型.md` 的确认记录正式纳入阶段门禁
- `change check` 的 next-step 人类可读输出补充“当前需补章节”，让使用者能直接看到该补哪些 section
- `AGENTS / CLAUDE / Trae rules / clarify / design workflow skill` 同步强调：每轮先问一个关键问题，确认后才能写当前选择或选型结论
- `package.json.files` 收敛 npm 发布白名单，避免把 `.omx / tests / docs / specs / dist` 等无关内容打进安装包
- `scripts/release.mjs` 改为基于 `npm-publish` 公开视图打包；默认 fast 模式执行 `pack-verify + npm pack + install + version + doctor`
- `--strict` 追加 `demo + npm run test:release`，`--full-test` 才追加全量 `npm test`
- `npm run test:release` 补充 `pack-verify` 与 release dry-run 校验，覆盖公开边界与发布步骤回归

## v3.2.0 - 2026-04-21

当前公开稳定版本。

### 新增
- 正式完成 GitHub 公共仓与 npm 公共分发
- 默认提供中文 README，并补充独立英文版 `README.en.md`
- 增强公开示例导航，形成 `init → change → integration → demo` 的阅读路径
- 对公开发布面补充更明确的版本说明与更新记录入口

### 强化
- `README` 重构为更适合 GitHub 首屏阅读的项目首页结构
- 公开装配面同时携带 `README.md / README.en.md / CHANGELOG.md`
- `pack-verify` 与公开测试继续作为发布前校验闭环的一部分
- npm 发布面已确认可通过 `npx --yes spec-nfc@latest` 直接试用

### 当前公开能力
- 项目协议接入：`init / add / upgrade`
- change 协作对象：`create / check / stage / archive`
- integration 协作对象：多人接口 / service 对接与对齐
- 仓级状态与协议校验：`status / doctor / explain`
- 中文 skill-pack、多工具入口投影、公开示例与样例 dossier

### 当前边界
- 当前版本聚焦仓内协议控制面与团队协作主链路，不包含重型运行时编排平台
- 当前不绑定单一 AI 工具或单一托管环境
- 当前不提供外部向量库式团队长期记忆服务，仍以仓内协议与索引为主

---

## v3.1.0 - 2026-04-18

结构收敛与文档减负版本。

### 新增
- 将 change 文档收敛为四主文档结构
- 引入对“中高复杂度 / 涉及架构取舍 / 涉及技术选型”的技术设计与选型分流
- 增强升级迁移能力，支持旧结构自动合并与清理

### 强化
- 文档命名按工作流顺序增加序号前缀，提升可读性
- 索引结构在文档合并后继续保持稳定，不因文件收敛而失效
- Git 排除规则补强，不要求共享的过程文件默认不进入版本控制

---

## v3.0.0 - 2026-04-16

`spec-nfc` 的协议重构版本。

### 新增
- 形成 `.specnfc/` 作为仓内 canonical control plane 的统一定义
- 形成 `.nfc/` 作为运行时与协作层的统一定义
- 建立 change / integration / project 多层对象、阶段机、文档合同与治理模式骨架
- 引入中文 skill-pack 与多工具入口投影统一机制

### 强化
- `status` 升级为仓级控制面看板
- `doctor` 升级为协议一致性检查器
- `init` 从简单初始化提升为项目协议接入动作
- `upgrade` 强化为面向旧仓迁移的保守升级器

### 当前意义
- 从“仓内模板工具”升级为“项目级 Spec-driven Coding 协议系统”
- 为公开发布、团队推广与跨工具协作奠定统一结构基础
