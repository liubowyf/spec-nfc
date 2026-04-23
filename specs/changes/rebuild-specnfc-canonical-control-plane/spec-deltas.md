# Spec Deltas

## 相对 v2 的关键语义变化
- `init`：从“初始化仓骨架”升级为“仓接入 Spec nfc 协议”。
- `status`：从仓状态摘要升级为“control plane 看板 + next-step protocol”。
- `doctor`：从健康检查升级为“协议一致性与投影漂移检查”。
- `change`：从 dossier 生命周期升级为“canonical phase 驱动的 change object”。
- `integration`：保留领域状态，但对外暴露 canonical phase 映射与 gate 结果。
- `upgrade`：从模板刷新升级为“协议迁移器 + skill-pack/projection/schema 迁移器”。
- `.omx/`：从隐含组织痕迹降级为运行时兼容层。
