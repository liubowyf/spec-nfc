# 完整初始化示例

执行：

```bash
specnfc init --profile enterprise
```

如需补接口设计模块，再执行：

```bash
specnfc add design-api
```

如果要直接生成完整示例仓，执行：

```bash
specnfc demo --cwd /tmp/specnfc-demo
```

初始化后，通常会马上创建当前迭代的第一项变更：

```bash
specnfc change create risk-device-link --title "设备关联风险识别增强"
specnfc change check risk-device-link
```
