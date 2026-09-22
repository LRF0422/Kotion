# 表格引擎迁移：jspreadsheet-ce → VTableSheet

状态：**计划阶段**（尚未改动运行时行为）
决策：`packages/plugin-office` 的电子表格引擎从 `jspreadsheet-ce` 换成字节的 VisActor VTable。

## 1. 为什么换（以及换成 VTable 能拿到什么、拿不到什么）

9000 行场景下的实测（最小 DOM shim + 真实 jspreadsheet，见第 6 节）：

| 配置 | tbody 行 | 创建元素 | mount | 堆 |
|---|---|---|---|---|
| 9000×12 无分页 | 9000 | 126,059 | 160ms | 129MB |
| 9000×12 分页 200 | **200** | 126,070 | 155ms | **127MB** |
| 20000×12 分页 200 | 200 | 280,070 | 238ms | 286MB |

根因是 jspreadsheet 的架构：`updateResult` 对 `options.data` 的**每一行**都执行 `createRow`（建 `<tr>` + 每列一个 `<td>`），分页只跳过 `appendChild`；`setData` 更是整体重建 `records`。所以分页只能压住**挂载布局**，压不住元素创建与堆占用。

**迁移的收益边界（基于对 VTable 1.26.8 源码的核实，必须如实对齐预期）：**

| 维度 | jspreadsheet（现状） | VTableSheet | 结论 |
|---|---|---|---|
| 活 DOM 节点 | 9000 行 = ~117k 个 cell 元素 | canvas 绘制，节点数与行数基本无关 | **大幅改善（主要收益）** |
| 元素创建 / 挂载 | 随行数线性增长 | 数据仍全量materialize，但无逐格 DOM | **改善，但非零成本** |
| JS 堆 | 127MB @ 9000×12 | 仍随数据线性（见 3.1 第 2 条） | **基本无改善** |
| 公式 | 有 | 有（更强，40+ 函数、依赖图增量重算、跨表） | 改善 |
| 每次保存的全量载荷 | 整份工作簿进 node attrs | **不变** | 本次不解决 |

**一句话**：这次迁移买的是「活 DOM 与交互流畅度」，买不到「内存有界」也买不到「载荷变小」。后两者要靠数据出文档（见风险 6）。如果目标只是让 9000 行不卡，这个交换是值得的；如果目标是内存，需要另外的方案。

叠加第二个问题：`workbookData` 存在 ProseMirror node attrs 里，op-tracker 的 replace op 携带**整个节点 JSON**，因此每次保存都会把整份工作簿（9000 行约 4–6MB）发往服务器。

VTable 是 canvas 渲染 + 行/列虚拟化，从架构上解决第一个问题；这为第二个问题（增量/分片同步）留出空间。

## 2. 迁移面（已核实）

**关键发现：引擎耦合是隔离的。**

- `jspreadsheet` 的实际 API 调用**只出现在 `useJspreadsheet.ts`** 一个文件（114 处）。
- `excel-to-workbook.ts` 里只有 2 处注释提及，无实际调用。
- 其他所有消费者都通过 `GridApi` 类型消费：`SheetToolbar.tsx`、`SheetFormulaBar.tsx`、`PivotDialog.tsx`、`PivotDetailsDialog.tsx`、`SpreadsheetView.tsx`、`tools.ts`。
- 消费者实际用到的只有 11 个方法：`getActiveSheetIndex`、`getSelection`、`getSelectionStyle`、`applyStyle`、`applyNumberFormat`、`toggleMerge`、`selectRange`、`readCell`、`writeRange`、`undo`、`redo`。

因此策略是**只替换 `useJspreadsheet.ts` 的实现，保持 `GridApi` 契约不变**，应用层零改动。

**保留（引擎无关）**：`workbook-data.ts`、`pivot.ts`、`excel-to-workbook.ts`、`workbook-to-excel.ts`、`workbook-registry.ts`、`skills.ts`、全部工具栏/公式栏/透视 UI、既有 51 个测试。

**需要新增**：`useVTableSheet.ts`（VTableSheet 版 GridApi 实现）。

## 3. VTable 能力核对（读 1.26.8 包内 `.d.ts` 得到，非文档推测）

选型结论：**必须用 `@visactor/vtable-sheet`，不能用 `@visactor/vtable` 核心包。** 核心包只有 ListTable / PivotTable / PivotChart，**没有公式、没有多表**；`@visactor/vtable-sheet` 才是电子表格引擎（依赖 `vtable` + `vtable-editors` + `vtable-plugins`）。

`VTableSheet` 已具备：

- `constructor(container, IVTableSheetOptions)`，`sheets: ISheetDefine[]` 多表
- 公式引擎：`formulaManager`、`formulaUIManager`，支持 40+ 函数（SUM/AVERAGE/IF/VLOOKUP/INDEX/MATCH/TODAY…）、依赖图增量重算、循环引用检测、跨表引用
- 撤销重做：`undo()` / `redo()` / `startHistoryTransaction()` / `endHistoryTransaction()`
- 导入导出插件：`@visactor/vtable-plugins`（xlsx/xls/csv），并有 `IMPORT_*` / `EXPORT_*` 事件
- 自带 UI：公式栏、sheet 标签、主菜单、撤销重做按钮 —— **可用 `showFormulaBar` / `showSheetTab` / `mainMenu.show` / `undoRedo.show` 关掉**（宿主已有自己的工具栏，必须关）
- 事件：`onTableEvent`（转发底层 VTable 事件，如 `CHANGE_CELL_VALUE`、`PASTE`）、`onSheetEvent`、`on(VTableSheetEventType, cb)`
- `WorkSheet` API 与 `GridApi` 几乎一一对应：
  `getData()` / `getCellValue(col,row)` / `getCellValueConsiderFormula(col,row)` / `setCellValue(col,row,value)` / `getSelection()` / `setCellFormula` / `getCopiedData` / `pasteData` / `getRowCount` / `getColumnCount` / `getCellByAddress` / `coordFromAddress` / `addressFromCoord`
- 底层 VTable 的批量写：`changeCellValue(s)` / `changeCellValuesByRanges` / `mergeCells` / `unmergeCells`

`ISheetDefine` 与我们的 `SheetData` 映射直接：`data`（二维数组）、`columns`、`rowCount` / `columnCount`、`cellMerge`、`frozenRowCount` / `frozenColCount`、`columnWidthConfig` / `rowHeightConfig`、`formulas`、`theme`、`filter`、`sortState`、`showHeader`、`firstRowAsHeader`。

### 3.1 硬约束（已在 1.26.8 源码中逐条核实）

这四条会改变实现方式，必须在动工前接受：

1. **没有 per-sheet 只读/锁定。** `ISheetDefine` 里唯一的 `disabled` 属于 `VTablePluginModules` 条目，不是 sheet 字段；`@visactor/vtable` 核心也没有 `readOnly` 选项。而 `createWorkSheetInstance` 在展开 sheet define **之后**硬编码 `editor: formulaEditor`、`headerEditor: formulaEditor`、`editCellTrigger: ['api','keydown','doubleclick']`，所以无法用配置关掉某个表的编辑。VTable 的可编辑性本质是「这个单元格是否解析出 editor」（`getEditor()` 返回 `define.editor ?? options.editor`，列 `editor` 可以是返回 falsy 的函数）。
   → **影响**：透视表（当前靠 `...(sheet.pivot ? { readOnly: true } : {})` 锁定）必须自己实现锁定，做法是替换该 sheet 的 editor 或拦 `beforeEdit`。这是额外的、有真实实现成本的工作项。
2. **VTable-Sheet 无法使用惰性/分片数据源。** 惰性加载只存在于核心 `ListTable`，且是 `dataSource: new VTable.data.CachedDataSource({ get(index), length })` 这种**按行索引**的形式（宿主自己做分批）；并不存在 `{ getData({startRow, endRow}) }` 那种形态。而 VTable-Sheet 的 `ISheetDefine.data` 是**完整二维数组**，被内部 `ListTable` 当 `records` 全量展开。
   → **影响**：**超大表的有界内存做不到**。内存仍随数据量线性增长。VTable 解决的是渲染/DOM（canvas 虚拟化），不是数据驻留。
3. **没有内置数字格式。** 全库没有 `Intl.NumberFormat`，也没有货币/百分比/小数/千分位 API；只有格式化回调：核心 `column.fieldFormat`（`FieldFormat = FieldGetter | FieldAssessor`，getter 收到 record）、PivotTable 的 `format` / `headerFormat`、rowSeriesNumber 的 `format(value)`。
   → **影响**：我们现有的 `numberFormats` / `rawValues` 记账模型要保留，并接到 `fieldFormat` 自定义函数上。好处是模型可迁移，坏处是要自己写格式化与反向解析。
4. **确认可用的能力**：区域复制粘贴（原生剪贴板事件，读 text/html 与 TSV，支持平铺粘贴，有 `PASTED_DATA` 事件、逐格 validate/editable 检查）；合并/取消合并（`ListTable.mergeCells/unmergeCells` + sheet `cellMerge`，由 `saveToConfig()` 往返）；行列宽高调整默认开启、可读取（`getColWidth` / `getRowHeight`）并由 `saveToConfig()` 持久化；CSV/XLSX 导入导出通过 `@visactor/vtable-plugins`（`TableExportPlugin`、`ExcelImportPlugin`），但**未在 sheet 中预注册**。MIT 许可，无商业附加条款。

## 4. 方案

### 4.1 架构

```
SpreadsheetView (不变)
   └── useSpreadsheetGrid()  ← 新的入口，内部委托给引擎适配器
          ├── VTableGridAdapter   (新，基于 @visactor/vtable-sheet)
          └── （迁移期保留）JspreadsheetGridAdapter
   GridApi 契约不变 → 工具栏 / 公式栏 / 透视 / AI 工具 / 节点持久化零改动
```

`workbook-data.ts` 的 `WorkbookData` 保持为**持久化格式不变**，VTable 侧的 `ISheetDefine` 由适配器双向转换。这样文档格式与协同协议不变，迁移对后端透明。

### 4.2 分阶段

**Phase 0 — 契约与骨架（✅ 已完成）**
1. ✅ `GridApi` / `GridSelection` / `NumberMeta` 抽到 `src/spreadsheet/grid-api.ts`；引擎无关纯工具（矩阵、样式文本、数字格式、内容判定、`MAX_ROWS/MAX_COLUMNS`）抽到 `src/spreadsheet/grid-utils.ts`。`useJspreadsheet.ts` 从 1444 行降到 1289 行，改为 re-export 这些类型以保持 4 个既有导入点不变。
2. ✅ 无行为变化：typecheck 干净、63 个测试全绿、rollup 构建通过。`useJspreadsheet.ts` 现在就是 `GridApi` 的一个实现（jspreadsheet 适配器），是唯一接触 widget 的文件。

**Phase 1 — VTableSheet 适配器（进行中）**

已完成：
- ✅ **POC 待答项已由源码回答，Phase 1 不再被阻塞**（无需浏览器）：
  - 事件常量：`change_cell_value` / `change_cell_values` / `pasted_data`（`@visactor/vtable/es/core/TABLE_EVENT_TYPE.js`）。
  - 坐标序确认为 **(col, row)**（`WorkSheet.getCellValue(col, row)` 签名）——适配器必须翻译。
  - `ISheetDefine.data` 接受二维数组（我们 `SheetData.rows` 的形态）；`showHeader: false` 时不会前置表头行（避免整表偏移一行）。
- ✅ **适配器的全部纯逻辑层已落地并测试**（测试总数 51 → **100**）：
  - `vtable-config.ts` — 工作簿 ⇄ `ISheetDefine`、合并/宽高双向转换、A1 工具。
  - `vtable-selection.ts` — 区间/选区转换。VTable 有三套轴命名（坐标参数 `(col,row)`、`CellRange{startRow,startCol,…}`、位置 `{col,row}`），每一处交叉都经过这里：倒置拖拽归一化、单格不误判为区间、跨表越界裁剪、`rangeToA1`。
  - `vtable-style.ts` — CSS 声明文本 ⇄ VTable 样式对象。显式白名单而非机械改键：`font-weight`/`font-style`/`text-decoration`/`font-size`/`color`/`background-color`/`text-align` 可映射；`--kn-cell-border` 无 VTable 等价物，明确丢弃（已知损失，见风险 5）。含 `mergeStyleText`，因为 `arrangeCustomCellStyle` 是整体替换，给斜体单元格加粗不能把斜体抹掉。
  - `number-format.ts` — 数字格式的正反两半：正向渲染（`formatCell` 保留 raw 以便可逆、幂等）与反向记账（`captureNumberFormats` 丢弃被改写的格式）。
- ✅ **修掉两个既有真实缺陷**（写测试时暴露）：
  1. `numericValue` 用 `replace(/[^0-9eE.+-]/g,'')` 剥字符，导致 `"物料A"`、`"abc"`、`"   "` 全被解析成 **0** —— 给文本单元格套数字格式会渲染出 `"0.00%"`。改为要求字符串中至少有一位数字。
  2. 全角数字转换用 `String(code - 0xfee0)`，得到的是十进制码位字符串（`"495051"`）而非数字，中文输入法下 `"１２３"` 会解析成 495051。改用 `String.fromCharCode`。
- ✅ **被测试模块必须零运行时 import**（踩到并已解决的真实工程约束）：
  - Node 的 ESM 测试运行器按字面解析相对路径，运行时 import 需要 `.ts` 后缀；
  - 但包构建用的 `rollup-plugin-typescript2` 会 emit，与 `allowImportingTsExtensions` 冲突（TS5096），加在包 tsconfig 里会**直接构建失败**；
  - 而现有被测模块（`pivot.ts`、`workbook-data.ts`）只用 `import type`，会被擦除，所以从未暴露这个问题。
  - 采用仓库既有模式：**五个新模块全部零运行时 import**（只保留 type-only import），A1 工具内联并用测试对拍 `workbook-data` 的版本防止漂移；`number-format.ts` 顺带接管了 `currencySymbol`/`formatNumeric`/`numericValue`（它们是它的运行时原语），`grid-utils.ts` 改为重导出。
  - 另加 `tsconfig.test.json`（`extends` 包配置 + `noEmit` + `allowImportingTsExtensions` + `module: esnext`，`include: ["src","tests"]`）用于类型检查测试。用法：`tsc -p tsconfig.test.json`。
  - ⚠️ 打开测试类型检查后暴露出**既有历史问题**：`tests/pivot.test.ts` 有 34 处类型不匹配（fixture 把扁平数组当成 `CellValue[][]` 传）。非本次引入，本次新增的 `vtable-config.test.ts` 与 `tests/helpers/dom-shim.ts` 均为 0 错误。建议作为独立清理项，不要混进引擎迁移。

- ✅ **`useVTableSheet.ts` 适配器 hook 已写完**（`GridApi` 全部 17 个方法），生命周期与事件接线在此，翻译逻辑全部委托给上面的纯模块。关键设计：
  - **挂载时序**：`VTableSheet` 构造时同步创建各 sheet 实例，所以样式/数字格式施加、生成表锁定、事件注册都在 `new` 之后立即进行。
  - **保存**：`change_cell_value` / `pasted_data` / `merge_cells` / `unmerge_cells` → 标脏 → 2s 节流 `flush()`；dirty 门沿用（空闲表格不付全表读取代价）。
  - **快照**：值从 `getData()` 读（`=FORMULA` 文本得以保留），布局（合并/宽高）从 `saveToConfig()` 读——引擎内部跟踪用户调整，只在那里materialize。
  - **坐标翻译**集中在 `withSheet` + 纯模块，hook 内不出现裸的轴转换。
- ✅ **`vtable-lock.ts` 与 `style-capture.ts`**：生成表锁定的**可逆**实现（见下）与样式采集封顶（2000 格，与 jspreadsheet 版本同预算，避免文档体积特性变化）。

**本轮踩到并修掉的自己的错误**（都在测试/复查中暴露）：
- `applyReadOnly` 最初只加锁不解锁 → 块从只读切回可编辑会**永久锁死**。改为 `lockTableForEditing` 保存原始 editor 谓词、`unlockTableForEditing` 还原；`applyReadOnly` 双向作用，并在解锁后重新锁定生成表。
- hook 里曾留了三个占位实现（`captureMerges`/`captureStyles` 直接返回 `undefined`）会**静默丢样式与合并**，已补实。
- `buildEngineOptions` 收了 `darkMode` 却不用：主题走 `.kn-sheet` 的 `--kn-sheet-*` CSS 变量（含 `.dark .kn-sheet`），不通过引擎 theme 对象传（部分 theme 对象会覆盖超出预期的调色板）。

**Phase 1 完成度**：上述全部落地——保存链路（`change_cell_value`/`pasted_data`/`merge_cells`/`unmerge_cells` → 标脏 → 2s 节流）、样式（`registerCustomCellStyle` + `arrangeCustomCellStyle`）、数字格式（渲染进存储值 + `numberFormats`/`rawValues` 记账）、生成表锁定（重写 `getEditor`/`isHasEditorDefine`，可逆）。

**Phase 2 — 接入与兼容（✅ 接线完成，运行时回归待做）**
1. ✅ `SpreadsheetView` 只经 `src/spreadsheet/useVTableSheet.ts` 挂载；迁移期的引擎选择（`engine.ts`、`__KN_SPREADSHEET_ENGINE__` 全局与 `VITE_KN_SPREADSHEET_ENGINE`）**已在 Phase 3 删除**。
2. ✅ 选项经 `GridApi` 契约传入，hook 只依赖选项对象。
3. ✅ **端到端打包已验证**（此前最大未验证风险）：插件 bundle 1.31 → 4.02 MB（gzip 0.97 MB）；应用构建里 VTable 落在懒加载 chunk `es-*.js`，**2.34 MB / gzip 0.58 MB**（宿主构建对 vrender 有 tree-shaking，优于隔离估算的 1.03 MB）。Phase 3 删除回退后不再有并存的 jspreadsheet chunk。
4. ✅ 多表/UI：用 `ISheetDefine[]` 承载，关掉引擎自带 tab/公式栏/菜单/撤销按钮，沿用宿主 UI；导入导出仍走 `SheetToolbar` 按钮，入口未减少。
5. ✅ 主题与撤销重做：已接 `VTableSheet.undo()/redo()` 与 `--kn-sheet-*` 主题链；**深色模式已在浏览器验证**（明暗主题不同、暗色确实暗，26/26 中的两项）。「保存不进文档 undo 历史」需人工确认。

**Phase 3 — 验证、清理、收尾**
1. ✅ 已删除 jspreadsheet 依赖与 `useJspreadsheet.ts`、`engine.ts`、分页相关代码（`ROWS_PER_PAGE` 等）及 `sheet.css` 中的全部 `.jss_*` / `.jtabs*` / `.jcontextmenu` 规则；回退开关（全局与构建期）一并移除。
2. ✅ 回归清单见第 7 节（自动化项全过，人工项待办）。
3. ✅ 性能对比：9000×12 的 mount 时间、堆占用、DOM 元素数已实测（见第 8 节表格）。滚动帧率与每次保存耗时待人工。

## 4.5 集成与回归验证（本轮）

- **插件包类型检查**：本包 `src` **0 错误**（其余是 `ui`/`editor` 等 sibling 包的既有噪声，与本次无关）。
- **宿主应用类型检查**：`apps/vite/src` 只剩 **1 个既有错误**（`logicflow-smoke.tsx` 缺 `onViewportChange`，不是我改的文件）；本轮修掉了自己引入的未使用变量（含最后清理的 3 个：`NumberFormatKind`、`rawValues`、`activeSheetIndexFrom`）。
- **宿主生产构建**：`✓ built in 59.33s`，端到端可打包。
- **单测**：`node --test tests/*.test.ts` → **193 / 193 通过**。
- **测试类型检查**：新增 `packages/plugin-office/tsconfig.test.json`（`noEmit` + `allowImportingTsExtensions` + `module: esnext`），否则 Node ESM 运行时的 `.ts` 扩展名导入会在包构建配置下报 TS5096。用它检查，**本包 `src` 0 错误、我编写的测试 0 错误**。唯一剩余是 `tests/pivot.test.ts` 的 34 个**既有**类型错误（该文件早于本次迁移，运行时全绿；错误源于 pivot 数据结构的类型演进，本轮未改动它以免混入无关变更）。
- **引擎 chunk 体积（实测）**：

  | 引擎 | minified | gzip |
  |---|---|---|
  | VTableSheet | 2.10 MB | **0.50 MB** |
  | jspreadsheet（回退保留） | 0.45 MB | **0.12 MB** |

  两者都在懒加载 chunk 里，只在渲染表格块时下载。迁移期间并存（回退路径需要）；Phase 3 删除 jspreadsheet 后可回收那 0.12 MB。

- **依赖面**：只有 `apps/vite` 依赖本包，导出面仅 `office` 插件对象，因此引擎替换对仓库其余部分零影响。

## 5. 风险（按严重度）

1. **Node 侧无法验证（已确认）**：VTable 全链路 ESM 产物是**无扩展名导入**（`./components/vtable-sheet`），Node 无法解析，只有 Vite/rollup 能。因此**所有验证必须在真实浏览器中进行** —— 无法沿用我这次用的 DOM shim 测试法。已建立 POC 页（见第 6 节）作为替代门禁。
2. **pnpm 依赖声明（已踩到并确认修法）**：`apps/vite` 使用隔离的 `node_modules`，仅把 `@visactor/vtable-sheet` 加进 `packages/plugin-office` 会让宿主解析失败：

   ```
   Failed to resolve import "@visactor/vtable-sheet" from "src/vtable-smoke.tsx"
   ```

   在 `apps/vite` 声明该依赖后，Vite 才成功预打包（`/node_modules/.vite/deps/@visactor_vtable-sheet.js`）。迁移落地时 `apps/vite` 必须同步声明，不能只改插件包。
3. **包体（已实测，代价明确）**：用 esbuild 对 `@visactor/vtable-sheet` 做真实打包：

   | | minified | gzip |
   |---|---|---|
   | 现有 jspreadsheet chunk | 0.45 MB | **0.12 MB** |
   | VTable（含 vrender 栈） | 3.91 MB | **1.03 MB** |

   引擎体积约 **8×**。两者都是懒加载（仅在该块渲染时下载），所以不进首屏，但一个含表格的页面要多下约 1 MB。这是本次迁移的**主要代价**，需要产品侧接受。缓解手段：保持 `React.lazy` 分割（已具备）、必要时把引擎设为宿主 external。

3.1 **打包阻塞（已发现并解决）**：`@visactor/vtable-plugins` 动态 `import('@visactor/vtable-gantt')`，但**没有把 `@visactor/vtable-gantt` 列为依赖**。生产 bundling 会硬失败：

   ```
   ✘ [ERROR] Could not resolve "@visactor/vtable-gantt"
   node_modules/@visactor+vtable-plugins@1.26.8/.../gantt-export-image.js:84
   ```

   **dev 预打包不会暴露它**（Vite 的 esbuild 预打包对此宽容），只有真实 bundling 才会。已在 `packages/plugin-office` 与 `apps/vite` 两处补声明。这条也是「引擎在 Node 侧不可验证」之外的第二个只有打包期才暴露的坑。
4. **ProseMirror NodeView 内的 canvas 尺寸**：VTable 是 canvas 渲染，依赖容器有确定尺寸和 `ResizeObserver`。当前块有固定 `height`，但全屏切换、`NodeViewWrapper` 的布局、编辑器内的 transform/containment 都可能让它渲染错位。需要在 `useLayoutEffect` + `resize()` 上仔细处理。
5. **样式/格式的往返保真**：我们持久化的是 CSS 声明文本 + 自定义 `numberFormats`/`rawValues` 记账。VTable 的样式与 `fieldFormat` 是另一套模型，双向转换可能丢失表达式（尤其自定义 `--kn-cell-border` 这类技巧会被淘汰）。旧文档的样式必须能读进来 —— 需要一条兼容转换 + 迁移测试。
6. **协同语义**：`workbookData` 仍在 node attrs 里，所以**每次保存的全量载荷问题在本次迁移中原样保留**。迁移解决的是渲染与内存，不解决 on-wire 体积。第二阶段可基于 VTable 的分片数据源单独做。
7. **公式范围与空行**：`=SUM(B:B)` 这类整列引用依赖行数语义。`ISheetDefine.rowCount` 与 `WorkbookData.rowCount` 必须一致，否则公式结果会变。需要专门的等价性测试。
8. **Excel 导入导出现有实现**：`workbook-to-excel.ts` 基于 `xlsx` 自研（162 行）。VTable 自带导入导出插件，是「复用插件替换自研实现」还是「继续用自研」需要决策。建议**先继续用自研**，保证格式一致性，把插件替换当作独立优化。
9. **透视表锁定需要自实现（无 per-sheet 只读）**：见 3.1 第 1 条。现有代码用 `readOnly: true` 锁生成表，VTable 无此能力，必须自己接 editor 或 `beforeEdit`。这是本次迁移里唯一新增的功能性工作项，必须排进 Phase 1，否则用户可以直接改透视表的值，而 `refreshPivots` 下次会把它覆盖掉 —— 数据看起来「自己变回去了」。
10. **内存不会变好**：见 3.1 第 2 条与第 1 节的收益边界表。如果「9000 行占 127MB」本身就是必须解决的问题，那这次迁移不解决它，需要单独做「行数据出文档 + 分片」。不要用这次迁移去承诺内存改善。

## 6. 已建立的验证手段

**对 jspreadsheet（Node 侧，已完成）**：`tests/helpers/dom-shim.ts` + `tests/spreadsheet-pagination.test.ts` 证明了可以在 Node 里挂载真实表格库并断言 DOM 契约，第 1 节的数据即由此得到。这套手段对 VTable **不适用**（见风险 1），但保留它对回退路径仍有价值。

**对 VTable（浏览器内，已搭好）**：`apps/vite/vtable-smoke.html` + `apps/vite/src/vtable-smoke.tsx`，沿用仓库既有的 `logicflow-smoke` 模式。用 `pnpm app:dev` 启动后访问 `/vtable-smoke.html?rows=9000&cols=12`。它会自动跑完并回报：

- 引擎能否加载（已验证：Vite 可预打包，`@visactor/vtable-sheet` ESM 无扩展名导入链正常）
- mount 时间与堆占用（Chrome 下）
- **是否真的虚拟化**：统计容器内实际 DOM 节点数（canvas 渲染应与行数无关）
- **坐标语义**：`getCellValue(1,1)` 应为「物料-2」、`getCellValue(9,0)` 应为 `10`，用于固定 (col,row) 与 (row,col) 的映射
- 公式求值（`=SUM(E1:E10)`）
- 编辑事件是否触发、`setCellValue` 往返
- `undo()` / `redo()` 是否真的回滚写入
- 多表 `activateSheet`
- 自带 UI（公式栏/标签/菜单/撤销按钮）是否被成功关闭
- 手动：`scroll test` 按钮量 30 帧滚动耗时；`resize()` 按钮量重排
- 手动：`window.__vtablePoc.sheet` 可在 DevTools 里继续探查

**Phase 1 的前置门禁**：这个页面必须全部通过，尤其是「虚拟化」「坐标语义」「编辑事件」「undo/redo」四项，否则不要开始写适配器。

## 7. 回归清单（Phase 3 必须逐项过）

状态图例：**[自动]** = 冒烟页/单测已覆盖，**[人工]** = 只能真人过一遍。

- [x] **[自动]** 9000 行：虚拟化（240 vs 126,059 元素）、mount 69ms、堆 14→26MB；滚动/编辑手感 **[人工]**
- [x] **[自动]** 单元格编辑 → 节流保存 → 刷新页面：值在（`replaceAll` 路径）；**公式文本也在**（`cloneRows` 修复后）
- [x] **[自动]** 多表：切换/按表读取；新增/删除/重命名 **[人工]**
- [x] **[自动]** 公式：输入、自动重算、载荷保留公式文本、循环引用不挂起；粘贴公式 **[人工]**
- [x] **[自动]** 样式：字体/颜色/背景/对齐 → 保存 → 重载 → 还原（边框未单独覆盖）
- [x] **[自动]** 数字格式：百分比 → 可逆切回 general（货币/小数同路径，单测覆盖）
- [x] **[自动]** 合并单元格：合并/取消 → 持久化，区间正确
- [ ] **[人工]** 行高列宽：调整 → 持久化（转换函数有单测，未在浏览器拖动验证）
- [x] **[自动]** 撤销/重做：值回滚/前进；样式与插入删除行 **[人工]**；不污染文档 undo **[人工]**
- [ ] **[人工]** Excel 导入/导出往返（本轮未跑过真实 xlsx）
- [ ] **[人工]** 透视表：生成、源数据变更自动刷新、下钻（锁定闸门已自动验证）
- [ ] **[人工]** AI 工具：读单元格、写区间（不打断用户当前视图）
- [x] **[自动]** 深色模式（明暗主题不同且暗色确实暗）；全屏、只读模式 **[人工]**
- [ ] **[人工]** 复制粘贴（含从 Excel 粘贴大块）
- [ ] **[人工]** 协同：两个客户端同时编辑不丢数据

## 8. 下一步

**已完成**：Phase 0（契约抽取）、Phase 1（适配器全部实现）、Phase 2 接线与端到端打包验证、**Phase 3 的自动化部分**（193 个单测 + 适配器冒烟页 26/26 + 构建通过）。仅剩下面第 7 节标 **[人工]** 的那几项需要在真实编辑器里过一遍，以及最后删除 jspreadsheet 回退路径。

**运行时验证已有第一批实测结果（无头 Chrome + CDP 驱动 POC 页）**

这些不再是估算，而是真实引擎在真实浏览器里的数据（9000 行 × 12 列）：

| 指标 | jspreadsheet（前测） | VTableSheet（实测） |
|---|---|---|
| 元素总数 | 126,059 | **240** |
| `tbody tr` / `td` | 9000 / 117,013 | **0 / 0**（canvas 绘制） |
| mount | 160 ms | **69 ms** |
| 堆增长 | ~127 MB | **14 → 26 MB** |

已确认通过：引擎从 Vite 加载 ✓、`getActiveSheet` / 行列表数（9000/12）✓、`getData()` 9000 行且**公式文本原样保留** ✓、**坐标语义** (`getCellValue(1,1)="物料-2"`、`getCellValue(9,0)=10`) ✓、写入往返 ✓、**撤销重做真的工作**（`undo` 连续两次回到原值、`redo` 前进）✓、合并单元格 ✓、多表 `activateSheet` ✓、自带 UI 已关净 ✓。

**踩到的无头环境假象（记录以免误判）**：默认无头窗口尺寸极小 → canvas `clientWidth/Height = 0` → 布局未建 → `changeCellValue` 抛 `layoutMap.getBody(...)` undefined，且 `undo()` 看起来无效。**设置真实视口（1600×1000）后三者全部正常**。教训：这类验证必须先 `Emulation.setDeviceMetricsOverride`。

**另一处实测发现的适配器缺陷（已修）**

`getCellStyle()` 对**任何**单元格都返回**已解析的完整默认样式**（实测 27 个键：`bgColor: "#FDFDFD"`、`textAlign: "left"`、`fontSize: 14`…）。我最初的 `captureStyles` 按 sheet 范围扫描，因此会把 9000×12 **整表都当成有样式** → 立刻打满 2000 格上限 → **用户真实格式在保存时全部丢失**。

已改为**追踪式采集**：只读取本适配器**确实施加过样式**的单元格（样式以 `kn-<A1>` 注册，可追踪），新增 `captureTrackedStyles` 与 5 个测试。副作用是「纯数据表保存后 `styles` 为空」这一语义也正确了。

**适配器级冒烟页（`apps/vite/spreadsheet-adapter-smoke.html`）—— 多轮排查后的最终结果**

这一页直接驱动 `GridApi`（镜像 `SpreadsheetView` 的接法）。经过多轮排查，**20 项检查中 19 项通过**，并找出 7 个真实缺陷（全部已修）：

| # | 缺陷 | 后果 | 修法 |
|---|---|---|---|
| 1 | `saveToConfig()` 返回 `{sheets:[…]}` 而非数组 | 快照在 `config.find` 抛异常 → **每次保存都丢掉样式与合并** | `normalizeSavedConfig()`，两种形状都接受 |
| 2 | 主题同步用 `updateOption({theme})` | 引擎 `updateOption` 在主题变更时调 `updateSheets(options)`，而它读 `options.sheets \|\| []` → **删光所有表** | 随主题一并传当前 `sheets` |
| 3 | `updateOption()` 不会创建 per-sheet 实例 | 换载荷后除第一张表全部读不出 | `replaceAll` 改为销毁重建实例 |
| 4 | `getCellStyle` 对每个单元格都返回已解析默认样式 | 按范围扫描会把整表当有样式 → 打满上限 → **真实格式丢失** | 改为追踪本适配器施加过样式的单元格 |
| 5 | 样式追踪集合是全局一个 Set | A1 引用跨表歧义 → **一张表的格式被复制到所有表** | 按表索引分组（`trackedSetFor`） |
| 6 | `unmergeCells` 要求区间与已存合并**完全一致**，且 `getMergeCells()` 在 ListTable 上不存在 | 我的 `findMergeAt` 恒为 false → **只能合并不能取消** | 从 `options.customMergeCell` 找**包含**选区的合并，并回传其完整区间 |
| 7 | 非活动表实例是惰性创建的 | `readRange(sheet1, …)` 恒为空 | 读前 `activateSheet` 强制实例化，读完切回 |

另有 2 个我自己的实现错误：`writeRange` 的 `null` 被当真值写入（**清空**了本该跳过的单元格），以及一个 effect 把 `applyExternalData` 当作依赖导致**无限重挂载**。

**已通过（20/20）**：就绪、`readRange` 轴序、`writeRange` 落位、`null` 跳过、选区往返、样式施加与读回、**样式进入保存载荷**、百分比格式化、general 可逆、**合并持久化**、合并区间正确、撤销/重做、活动表索引、跨表读取、回声忽略、浅色网格渲染（89.4% 浅色像素）、**明暗主题不同**、**暗色主题确实是暗的**、**样式经 `replaceAll` 后仍在**。

**合并取消：已修复（20/20 全通过）**

排查过程留下的结论值得记录，因为它暴露了一个容易再犯的模式：

1. 引擎 API 本身完全正常（直接调用 `mergeCells` → `unmergeCells` → `saveToConfig` 全部正确）。
2. 适配器也确实进入了取消分支并用完全一致的参数调用了 `unmergeCells`。
3. 但**取消被保存往返还原**：取消后 `saveToConfig()` 仍报出该合并，于是 payload 又把追踪列表重新播种回「已合并」。
4. 修法是**不再把引擎的合并存储当作读回来源**：适配器在 `toggleMerge` 时把追踪结果**直接写回工作 payload**（`writeMergesInto`），使下一次快照以我们维护的状态为准，而不是引擎那份陈旧缓存。

顺带修好的还有：合并的读取源改为适配器自追踪（`unmergeCells` 要求区间与已存值完全一致、`getMergeCells()` 在 ListTable 上不存在，这两点已在适配器内处理正确）。

**公式：已由适配器接管（原「唯一剩余项」已关闭）**

实测确认（源码级）的引擎限制没有变，仍然成立：

- **`rebuildAndRecalculate()` 是空函数**（`rebuildAndRecalculate() {}`）——引擎**不提供可调用的全量重算**。
- 引擎维护的 `sheetData` 与表格数据**脱钩**：单元格编辑不会同步进引擎，所以依赖重算看不进任何改动。
- 唯一可用的是**无状态** `formulaManager.calculateFormula(formula)`，但它**不解析 A1 引用**。

因此按方案 A 实现：`src/spreadsheet/formula.ts` 是一个自带的递归下降求值器 —— 分词、A1 引用（含 `$` 与跨表 `Sheet!A1`）、区域展开、依赖拓扑、**循环检测**、惰性 + 记忆化重算（`MAX_RECALC_PASSES = 12`）。函数集：`SUM/AVERAGE/COUNT/COUNTA/MIN/MAX/ABS/ROUND/IF/AND/OR/NOT/CONCATENATE/LEN/LEFT/RIGHT/MID`。

**关键设计：文档里存的永远是公式文本，计算值只进引擎用于显示。**

| 面向 | 内容 |
|---|---|
| `workbookData.rows` | `"=SUM(B1:B5)"` —— 格式不变，协同与 Excel 往返拿到公式而非冻结值 |
| 引擎单元格 | `"85"` —— 由 `applyFormulas()` 写入，供画布渲染 |
| 快照 | `restoreFormulas(rows, previous.rows)` 把公式文本写回，避免把计算值冻结进文档 |

**有意不支持的写法**（故意报错而不是算错）：数组公式、整列引用（`B:B`）→ `#NAME?` / `#REF!`。

**本轮新发现的缺陷：引擎与文档共享同一个 rows 数组（已修）**

`workbookToSheetDefines()` 原本把 `sheet.rows` **按引用**交给引擎（`data: sheet.rows`）。引擎会保留这个数组并往里写显示值，于是 `applyFormulas()` 写 `=SUM(B1:B5)` 的计算结果时，**直接改掉了文档自己的 rows**：

```
挂载后、任何保存之前：  storedRows()[0][6] === "85"   ← 公式文本已经没了
```

后果很隐蔽：公式在屏幕上算得对，但载荷里存的是 `"85"`，所以刷新一次就永久退化成静态数字 —— 而这不是「显示问题」，是**文档数据被就地改写**。

修法是写时复制：新增 `cloneRows()`，`data` 传副本（外层数组与每一行都复制，因为引擎按单元格写）。回归测试 `vtable-config.test.ts` 直接断言「改引擎的 data 不会动到 payload」。jspreadsheet 路径本来就有 `cloneRows`，这条属于迁移时漏掉的等价性。

**适配器级冒烟页（`apps/vite/spreadsheet-adapter-smoke.html`）—— 最终结果：26/26 通过**

`apps/vite/src/spreadsheet-adapter-smoke.tsx` 直接驱动 `GridApi`（镜像 `SpreadsheetView` 的接法），由无头 Chrome + CDP 驱动执行。过程中共找出 8 个真实缺陷（全部已修）：

| # | 缺陷 | 后果 | 修法 |
|---|---|---|---|
| 1 | `saveToConfig()` 返回 `{sheets:[…]}` 而非数组 | 快照在 `config.find` 抛异常 → **每次保存都丢掉样式与合并** | `normalizeSavedConfig()`，两种形状都接受 |
| 2 | 主题同步用 `updateOption({theme})` | 引擎 `updateOption` 在主题变更时调 `updateSheets(options)`，而它读 `options.sheets \|\| []` → **删光所有表** | 随主题一并传当前 `sheets` |
| 3 | `updateOption()` 不会创建 per-sheet 实例 | 换载荷后除第一张表全部读不出 | `replaceAll` 改为销毁重建实例 |
| 4 | `getCellStyle` 对每个单元格都返回已解析默认样式 | 按范围扫描会把整表当有样式 → 打满上限 → **真实格式丢失** | 改为追踪本适配器施加过样式的单元格 |
| 5 | 样式追踪集合是全局一个 Set | A1 引用跨表歧义 → **一张表的格式被复制到所有表** | 按表索引分组（`trackedSetFor`） |
| 6 | `unmergeCells` 要求区间与已存合并**完全一致**，且 `getMergeCells()` 在 ListTable 上不存在 | `findMergeAt` 恒为 false → **只能合并不能取消** | 从 `options.customMergeCell` 找**包含**选区的合并，并回传其完整区间 |
| 7 | 非活动表实例是惰性创建的 | `readRange(sheet1, …)` 恒为空 | 读前 `activateSheet` 强制实例化，读完切回 |
| 8 | 引擎与文档共享同一个 rows 数组 | 计算值就地改写文档 → **刷新后公式退化成数字** | `cloneRows()` 写时复制 |

另有 2 个我自己的实现错误：`writeRange` 的 `null` 被当真值写入（**清空**了本该跳过的单元格），以及一个 effect 把 `applyExternalData` 当作依赖导致**无限重挂载**。

**探针面收窄**：`useVTableSheet` 暴露的唯一测试钩子是 `__probe.tables()`（`Object.defineProperty`，不可枚举），只用于验证「每张表的编辑闸门」—— 因为只读与生成表锁定没有引擎支持，是靠改写 editor 判定实现的，没有别的方式确认它生效。公式相关的断言已全部改用公共 API（`readCell()` 看显示值、`getSnapshot()` 看将要持久化的载荷），我排查 `cloneRows` 时临时加的 `rawData/storedRows` 已删除。

**26 项全部通过**：就绪、`readRange` 轴序、`writeRange` 落位、`null` 跳过、选区往返、样式施加与读回、**样式进入保存载荷**、百分比格式化、general 可逆、**合并持久化**、合并区间正确、撤销/重做、活动表索引、跨表读取、回声忽略、**每张表的编辑闸门**、**载荷公式显示计算结果**、**载荷保留公式文本**、新公式计算、**改被引用单元格后重算**、循环引用不挂起、浅色网格渲染（89.2% 浅色像素）、**明暗主题不同**、**暗色主题确实是暗的**、**样式经 `replaceAll` 后仍在**。

**测试与构建（本轮末次实测）**

| 项 | 结果 |
|---|---|
| `node --test tests/*.test.ts` | **193 / 193 通过**（14 个文件；`formula.test.ts` 31、`spreadsheet-tools.test.ts` 25、`vtable-adapter.test.ts` 21、`vtable-config.test.ts` 18…） |
| 插件包 `pnpm --filter @kn/plugin-office build` | ✅ exit 0（冷构建 1m29s，增量 25.8s） |
| 宿主 `apps/vite` 类型检查（表格相关） | ✅ 0 错误（`logicflow-smoke.tsx` 的 `onViewportChange` 为既有问题，非本次） |

**⚠️ 重要教训（多轮反复踩到）**：Vite dev server 在本仓库下**不可靠地提供陈旧模块**——多次出现「本地文件已改、浏览器加载旧代码」，导致我基于假象排查了大量时间（例如「引擎零张表」一度是旧代码所致）。所有浏览器验证前必须确认服务端返回的模块含最新标记，否则结论无效。本轮上述 26 项结论均在**确认服务模块含最新标记**后取得。

**回退开关（已移除）**：迁移期可通过 `globalThis.__KN_SPREADSHEET_ENGINE__ = 'jspreadsheet'` 或构建期 `VITE_KN_SPREADSHEET_ENGINE=jspreadsheet` 回退。Phase 3 删除适配器后此开关不再存在，需要回退请回滚到本迁移 commit 之前的版本。

**仍未验证的部分（需要真人在真实编辑器里过一遍）**：以下只能靠人工，工具链里没有对应自动化：

1. **9000 行真实表格块**：在编辑器内滚动、编辑的手感（POC 页已证明虚拟化与 mount 数据，但 NodeView 内的容器尺寸/全屏切换仍需人工确认）。
2. **Excel 导入导出往返**（仍未在本轮实际跑过一次真实 xlsx）。
3. **协同**：两个客户端同时编辑。
4. **AI 工具**在真实 block 上的读/写。
5. **透视表生成 + 源数据变更自动刷新 + 下钻**。
6. **复制粘贴**（含从 Excel 粘贴大块）。

**清理（Phase 3，已完成）**：已删除 jspreadsheet 依赖与 `useJspreadsheet.ts`、分页代码（`ROWS_PER_PAGE` 等）以及回退 chunk，回收约 0.12 MB gzip。

**深色模式修复（Phase 3 追加）**：VTableSheet 的 Excel 式行/列表头（A/B/C 与行号）由 `TableSeriesNumber` 插件绘制，其样式取自 theme 的**顶层** `rowSeriesNumberCellStyle` / `colSeriesNumberCellStyle`，而非 `tableTheme`。此前只填了 `tableTheme`，于是表头回落到插件打包的浅色 `#F9F9F9`，在深色模式下出现白色表头带。修复：

- `vtable-theme.ts` 新增 `buildSeriesNumberStyle` / `buildSheetTheme`，补齐行/列表头与 `menuStyle`；`useVTableSheet` 改为传完整的 `IThemeDefine`。
- `isDarkColor` 现在解析 `hsl()/hsla()`：CSS 变量 `hsl(var(--background))` 经 `getComputedStyle` 返回的正是 HSL 形式，旧实现只认 rgb/hex，导致 `prefersDarkMode` 恒为 false。
- `resolveSheetTheme` 增加「DOM token 与显式模式相矛盾时以模式为准」的兜底，覆盖宿主 `.dark` class 晚于本组件 effect 应用的竞态。
- `.kn-sheet .vtable-sheet-top-container:empty { display:none }` 去掉引擎空顶栏的 30px 空白带，容器背景改为 `--kn-sheet-cell-bg`；顶左"全选"角的浅色 `cornerCellStyle` 由 `.kn-sheet__canvas::before` 覆盖（`pointer-events:none`，交互仍可穿透）。

**右键菜单（Phase 3 追加）**：单元格右键菜单由 `@visactor/vtable-plugins` 的 `ContextMenuPlugin` 渲染成 DOM，调色板以**内联样式**写死为浅色（`#ffffff` / `#f5f5f5` / `#999`），图标是 emoji（`createIcon` 把 `iconName` 映射成 📋✂️🗑️…），stylesheet 与 VTable theme 都够不到。修复：

- `vtable-theme.ts` 新增 `themeContextMenuStyles(styles, tokens)`：就地改写 `MenuManager` 持有的样式表里的颜色键，保留引擎的布局键（宽度/内边距/圆角）。
- 新增 `CONTEXT_MENU_ICONS`：16×16、`stroke="currentColor"` 的内联 SVG，覆盖引擎所有 emoji（copy/cut/paste/insert/delete/sort/protect/hide/freeze/四向箭头），并按 `menuKey` 补齐 delete_*/freeze_*/merge_cells/unmerge_cells/filter/first_row_as_header。
- `useVTableSheet` 在挂载、换 payload、主题切换后调用 `applyContextMenuTheme`：遍历每张表的 `pluginManager`，改写菜单样式并给菜单项（含子菜单）写 `customIcon`（`customIcon` 优先于 `iconName`，因此 emoji 不再出现）。
- 验证：Electron + 冒烟页在明/暗两态下开菜单，容器背景/文字色随模式变化，顶层 9 个菜单项与子菜单均为 SVG，文本无 emoji。

**多工作表（Phase 3 追加）**：迁移时 `showSheetTab: false` 关掉了引擎自带的 sheet 标签栏，但宿主 UI 并没有补上切换/新增/重命名/删除，于是「多个 sheet」能力整体丢失。修复：

- `buildEngineOptions` 重新打开 `showSheetTab: true`，恢复引擎标签栏的切换、双击重命名、菜单删除、拖拽排序；`sheet.css` 用 `--kn-sheet-*` 令牌覆盖 VTableSheet 注入的浅色标签栏样式（容器/标签/hover/active/新增/滚动/菜单/渐变遮罩）。
- 标签栏的按钮 tooltip 由引擎硬编码中文，`localizeSheetTabs` 在挂载/重建后按 `translate` 重设为当前语言（`spreadsheet.sheet.*`）。
- 结构变更持久化：VTableSheet 1.26.8 **只发 `sheet_activated`**，新增/删除/重命名/移动都不发事件。适配器在 `wireEvents` 里包装引擎的 `_addNewSheet` / `removeSheet` / `renameSheet`（`undo`/`redo` 仅在 sheet 数变化时触发），事件后由 `reconcileFromEngine` 按 `sheetKeysRef` 把引擎的 sheet 列表读回 `WorkbookData`，再经 `replaceAll` 重建——既持久化了结构，也让引擎 key 回到适配器其余部分依赖的索引形式。
- `engineHasContent` 改为扫描所有 sheet：新增的空 sheet 会成为 active，旧实现只看 active，导致新增/重命名后保存被「空快照保护」拦下。
- 验证：Electron 冒烟页中「新增 → 重命名 → 切换 → 删除」四步，`onSave` 载荷的名称/数量/active 均正确，且结构变更前后其它 sheet 的单元格值不变；深色下标签栏背景 `#292929`、active 文本为强调色。

**右键菜单国际化（Phase 3 追加）**：菜单文案同样是引擎内置的**硬编码中文**（复制/剪切/插入/冻结/合并单元格…）。修复：

- `i18n/translate.ts` 抽出纯字典与 `t(lang, key)`（无运行时依赖，Node 可直接测试），`i18n/index.ts` 保留绑定 i18next 的 `translate`/`createT` 并 re-export，公开 API 不变。`spreadsheet.contextMenu.*` 补齐 en/zh 两套标签。
- `useVTableSheet` 用 `translateContextMenuOnOpen` 包装插件的 `showContextMenu`：每次打开（含子菜单，递归）都按当前 `i18n.language` 重写 `text`，因此运行时切语言无需重载；`translate` 对缺失键会原样回显键名，代码据此保留引擎原文。
- 验证：同一页面强制 `i18n.language` 为 zh/en，菜单顶层与子菜单分别为「复制/剪切/…/启用首行表头、删除行」与「Copy/Cut/…/Use first row as header、Delete row」。
