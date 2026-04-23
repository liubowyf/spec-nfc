# 本仓的 Spec nfc 使用入口

当前仓：`{{repositoryName}}`

当前已启用模块：
{{enabledModulesMarkdown}}

## 建议的下一步

- 运行 `specnfc doctor` 检查当前仓状态
- 运行 `specnfc explain` 理解当前结构
- 运行 `specnfc explain tools` 查看多工具接入方式
- 运行 `specnfc explain skills` 查看个人 Skills 兼容规则

## 工具入口

{{toolEntryMappingMarkdown}}

## 继续阅读

{{moduleGuideListMarkdown}}

如果已经进入某条具体变更，继续按这个顺序读：

1. `specs/changes/<change-id>/meta.json`
2. `specs/changes/<change-id>/spec.md`
3. `specs/changes/<change-id>/plan.md`
4. `specs/changes/<change-id>/tasks.md`

如果这条变更涉及权限、数据迁移、接口兼容或发布，再补读：

- `.specnfc/governance/decision-gates.md`
- `.specnfc/governance/risk-matrix.md`
- `.specnfc/governance/security-boundaries.md`
- `.specnfc/governance/release-handoff.md`

## 开始第一项变更

- 运行 `specnfc change create <change-id>`
