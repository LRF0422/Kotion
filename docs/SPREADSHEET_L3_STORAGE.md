# 电子表格 L3：工作簿外置存储与增量同步

## 背景

L1/L2 之前，整本工作簿作为 ProseMirror 节点属性（`spreadsheet-node.ts` 的
`workbookData`）存在文档 JSON 里。17MB 的 Excel 会变成 30–50MB 级 JSON，于是：

- 每次自动保存都 `JSON.stringify` 全表 + 重新写节点属性 + 让 Yjs 复制整个属性值；
- 加载时文档解析、`ensureValidWorkbookData` 全表规范化、`cloneRows` 全量复制；
- 协同下每个属性变更都传输整张表。

L3 把工作簿移出节点属性，改存到**共享 Y.Doc**，节点只保留一个 ref。一次单元格编辑
只写一个 Y.Map key，文档 JSON 与 PM 事务不再携带表格。

## 接入点

`@kn/editor` 的 `CollaborationRuntime` 扩展暴露了 `provider.document`（Y.Doc）：

```ts
getCollaborationRuntime(editor) // => { document: Y.Doc, provider, awareness, status } | undefined
```

`workbook-bridge.ts` 是唯一知道如何从 editor 拿到该 doc 的地方；非协同编辑器
（无 provider）返回 undefined，自动回退到旧的 `workbookData` 属性路径。

## 存储布局

一个扁平 Y.Map（`kn-spreadsheets`），key 前缀是 ref，因此无需构造嵌套 Y 类型。
布局是 **快照 + 增量 + 阈值压实**：

| key | 内容 |
|---|---|
| `<ref>|snap` | **一个**值：工作簿的稀疏 JSON 快照（只写非空单元格） |
| `<ref>|active` | 当前 sheet（数字，覆盖快照） |
| `<ref>|d:value:<sheet>:<row>:<col>` | 自快照以来的单元格值增量（null = 清空） |
| `<ref>|d:style/numberFormat/rawValue:…` | 样式 / 数字格式 / 原始值增量 |
| `<ref>|d:column:<sheet>:<col>` / `d:row:<sheet>:<row>` | 列宽 / 行高增量 |
| `<ref>|d:merges:<sheet>` | 该表合并区间（整体替换） |
| `<ref>|d:name:<sheet>` / `d:dims:<sheet>` | 重命名 / 行列表数增量 |

- **为什么**：早期版本「每格一个 Y.Map 条目」，一张大表就是几百万个 Yjs item，
  房间持久化后每次打开都要遍历全部 item 编码/应用，首同步极慢。改成
  **单个快照值**后，编码/加载只处理一个 item；编辑仍只写变化的格子。
- **压实**：delta 条目超过 `DELTA_COMPACT_THRESHOLD`（2000）或 sheet 结构变更时，
  把当前工作簿重新写成快照并清空 delta。
- 实测：10 万非空格 → seed 后 Y.Map **1 个条目**（快照），编码约 1.2MB；一次编辑只多
  **1 个** delta 条目。

## 模块

| 文件 | 职责 | Node 单测 |
|---|---|---|
| `workbook-diff.ts` | 两个 `WorkbookData` 间的纯增量 diff | ✅ `workbook-diff.test.ts` |
| `workbook-store.ts` | 快照编码/解码 + delta 读写 + observe | ✅ `workbook-store.test.ts`（fake map） |
| `workbook-persistence.ts` | 首次/结构变更写快照，普通编辑写 delta，超阈值压实 | 浏览器 |
| `workbook-bridge.ts` | editor ↔ store（`getCollaborationRuntime`） | 浏览器 |

`workbook-diff.ts` / `workbook-store.ts` 刻意只用 type-only 相对导入，这样 Node
测试运行器可直接加载（仓库其它纯模块同约定）。

## 持久化（必需）

L3 把工作簿放进共享 Y.Doc，**但 Y.Doc 必须由 room-server 持久化**，否则房间清空 /
服务重启后它只存在于内存，客户端再从页面 JSON 重新 seed，sheet 就空了。

- 后端 REST 只存 `editor.getJSON()`（`use-auto-save.tsx`），L3 之后这里只有
  `workbookRef`，没有表体；
- 客户端仅在 Y.Doc 为空时才从 REST seed（`collaboration.tsx` 的 `isYDocEmpty`），
  所以协同的真正持久化载体是 Y.Doc；
- 因此 room-server 必须开启持久化。

room-server 已接入 `@hocuspocus/extension-database` + MySQL：

- 表 `collab_documents(name VARCHAR(191) PRIMARY KEY, data LONGBLOB, updated_at)`
  启动时自动创建（表名可用 `DB_TABLE` 覆盖）；
- `store` 防抖（`STORE_DEBOUNCE_MS` / `STORE_MAX_DEBOUNCE_MS`），避免每次更新都写整份状态；
- `DB_HOST` 未配置或连接失败时**降级为内存模式并告警**，不会让协同整体不可用；
- Redis（可选）只做多实例中继，不是持久化存储。

环境变量见 `packages/room-server/.env.example`；Docker 部署通过 `docker-compose.yml`
透传。

## 节点属性

`spreadsheet-node.ts`：

- `workbookRef: string | null` —— L3 引用；
- `workbookRevision: number` —— 外部写入者（AI 工具）自增，已挂载视图据此重载；
- `workbookData` —— 旧数据 / 非协同回退 / 迁移来源。

## 保存与加载

- **ref 分配**：`insertSpreadsheet` 创建块时就写入 `workbookRef`；更早的块由
  `SpreadsheetView` 的 ensure-ref effect 补上。这样**第一次导入**也直接写 store，
  不会先写超大节点属性再迁移（那正是"首次导入存不住、刷新后第二次才行"的原因）。
- **保存**：`SpreadsheetView.handleSave` 先 `persistStoredWorkbook` —— 有 ref 时
  `storeWorkbook(doc, ref, previous, next)` 只写变更 key；否则走旧的 `setNodeMarkup`。
- **加载**：`initialDataRef` 惰性从 store 读取（无则回退属性）；迁移后属性里的
  大块数据被清空。
- **迁移**：有 collab 时，`SpreadsheetView` 用 `workbookData.id` 作为 ref 把旧数据
  灌进 store（多端收敛），然后 `setNodeMarkup({ workbookRef, workbookData: null })`。
- **远端**：`observeWorkbook` 只处理非本地 origin 的写入，交给
  `applyExternalData` 应用。
- **AI 工具**：读穿过 store（无 live handle 时），写走 `persistWorkbook`（store +
  自增 `workbookRevision`）。

## 验证

- `workbook-diff.test.ts` / `workbook-store.test.ts`：14 项，覆盖值/样式/数字格式/
  原始值/行列尺寸/合并/active/meta 的 diff，seed↔load 往返、单 key 增量、本地 origin
  不上报、远端上报、结构变更整体重写、清理。
- 全量：205/205 通过；本包 typecheck 0 新增错误；rollup 构建通过。

## 排障（保存不了时按顺序查）

1. **room-server 是否真的启用了持久化**：启动日志应为
   `Room server started ... persistence: mysql`；若是 `IN-MEMORY`，说明
   `DB_HOST` 没配或连不上（会打印 `[persist] ...`）。
2. **表里是否有行**：编辑单元格几秒后执行
   `SELECT name, OCTET_LENGTH(data), updated_at FROM collab_documents`，
   对应 `page:{id}` 的行应出现/增长。没有行 = Y.Doc 没写进去或没触发 store。
3. **浏览器控制台**：新增了一行诊断
   `[office/spreadsheet] storage L3(Y.Doc) ref=...` 或 `legacy(attribute)`。
   - `legacy(attribute)` 表示没拿到 collaborationRuntime（插件/宿主版本不一致，
     或该编辑器无 provider），此时数据走节点属性，由后端 REST 保存。
   - `L3(Y.Doc)` 且编辑后表无行，说明客户端写入了本地 Y.Doc 但没同步/没落库。
4. **重载后为空**：客户端可能在 provider 初始 sync 之前就读取了 store。已在
   `SpreadsheetView` 增加 `synced` 后重读并 `applyExternalData` 的兜底。

### 已知不可恢复的情形

若某次迁移已经把节点的 `workbookData` 清成 `null`，而当时 room-server 无持久化，
工作簿只存在内存 Y.Doc 中，重启即丢失，且 REST 里只剩 `workbookRef`——这部分历史数据
无法找回，只能重新编辑。

## 剩余工作

1. **超大工作簿的首次迁移**：目前 `seedWorkbook` 对每个非空单元格做一次 `set`，
   百万级会阻塞主线程并产生一个巨大的初始 Yjs update。建议改成
   「snapshot 单值 + 增量覆盖 + 定期压实」，或分片 `requestIdleCallback` 灌入。
2. **远端细粒度应用**：当前远端变更经 `applyExternalData`，内容不同会 remount。
   应收敛为按 diff 的 `writeRange`/样式原位应用，避免每次远端编辑重建引擎。
3. **按视口加载**：`loadWorkbook` 仍构建整本 `WorkbookData`；可只 hydrate 可见区域。
4. **压实/GC**：长期编辑会累积 tombstone 与历史；需要 snapshot 压实策略。
5. **协同端到端验证**：需在真实 room-server 会话中验证多端增量、迁移竞态、
   AI 工具写入后的重载。
