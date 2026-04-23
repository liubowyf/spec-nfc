# 项目层文档入口

## 作用
`specs/project/` 是 V3 冻结的 **project-level canonical path**，用于承载当前仓所属项目的正式汇总入口，而不是运行时草稿目录。

## 固定文件
- `specs/project/README.md`：项目层文档的导航与维护规则。
- `specs/project/summary.md`：项目总览、迭代摘要、风险与下一步的正式汇总文档。
- `.specnfc/indexes/project-index.json`：项目层机器可读索引。

## 维护规则
1. `specnfc init / upgrade` 负责创建或补齐本目录。
2. `status / doctor` 负责读取 `specs/project/summary.md` 与 `project-index.json`，并报告缺口。
3. `change / integration` 的关键结果要回流到 `specs/project/summary.md` 与 `project-index.json`，而不是只停留在各自 dossier。
4. 团队级上下文只允许通过 `ref / digest / path / sourceRepo` 方式引用，不在本目录做全文镜像。

## 读取建议
AI agent 与团队成员应优先按以下顺序读取：
1. `specs/project/summary.md`
2. `.specnfc/indexes/project-index.json`
3. `specs/changes/<change-id>/`
4. `specs/integrations/<integration-id>/`

## 边界说明
- 本目录是项目层正式文档，不替代 `.specnfc/` control plane。
- 本目录不是 `.nfc/` 运行时目录，不存放访谈草稿、中间计划或会话日志。
- 本目录不直接承载团队级主文档，只承载引用、摘要和汇总。
