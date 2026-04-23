# nfc writeback rules

## 原则
1. 运行时草稿可以自由演进，正式结论必须回写。
2. writeback 失败必须进入 `.nfc/sync/pending-writeback.json`。
3. `strict / locked` 模式下，未完成 writeback 不允许进入 accept/archive。

## 映射
- interviews -> `proposal.md` / `status.md`
- design scratch -> `design.md` / `decisions.md`
- plan scratch -> `plan.md` / `tasks.md`
- verify notes -> `acceptance.md` / `status.md`
- handoff notes -> `release-handoff.md` / `delivery-checklist.md`
