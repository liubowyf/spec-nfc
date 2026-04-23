# nfc runtime model

## 定位
`.nfc/` 是 `specnfc` 的中文运行时与协作层，不是正式真相源。

## 核心对象
- interview record
- plan scratch
- runtime session state
- writeback queue
- handoff note
- runtime warning / escalation

## 与正式文档关系
- 一切运行时事实都必须能定位到一个 repo/change/integration 对象
- 需要沉淀的事实必须进入 writeback queue，再回写正式 dossier
- 运行时文件可以比正式文档更细，但不能替代正式结论
