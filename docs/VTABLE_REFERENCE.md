# VTable / VTable-Sheet 速查（@visactor/vtable / @visactor/vtable-sheet 1.26.8）

源码基准：1.26.8 两个包同源于 GitHub tag `v1.26.8`（gitHead `a938bf7988391b6c2420f9fd2e0ada40a52b9f8e`），下列行号链接均指向该 tag。
链接前缀：`V=https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src`，`S=.../packages/vtable-sheet/src`，`P=.../packages/vtable-plugins/src`（下文用 `V/…`、`S/…`、`P/…` 简写，实际书写为完整链接）。
`VTableSheet` 属于**独立包** `@visactor/vtable-sheet`，不是 `@visactor/vtable` 的入口；其内部每页是一个 `ListTable` 实例。

## 0. 结论摘要

- 复制粘贴、合并、行列宽高、导入导出都可用，但**默认多为关闭**：剪贴板开关默认 false、拖拽换行 opt-in、导入导出插件在 Sheet 里不预装。
- **没有内置数字格式 API**（无 currency/percent/format-string），只有 formatter 回调。
- 可编辑性：核心表无 `readOnly`，靠 editor 解析；**VTable-Sheet 无 per-sheet 只读，且强制给每页注入公式编辑器** —— 这是最大缺口，需要自己加锁（见第 5 节）。
- 性能：官方无实测数字（只有"百万级/秒级"宣传 + canvas 可视区渲染），要数字只能自测。

## 1. 复制粘贴

- 开关全在 `keyboardOptions`（`TableKeyboardOptions`，[V/ts-types/table-engine.ts#L101-L141](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ts-types/table-engine.ts#L101-L141)），**默认均 false**：`cutSelected` L113、`copySelected` L115、`getCopyCellValue` L117、`showCopyCellBorder` L124、`pasteValueToCell` L126、`processFormulaBeforePaste` L128。
- 快捷键不是 keydown 拦截：核心在 DOM 元素上绑原生 `copy/cut/paste` 事件（[V/event/listener/container-dom.ts#L298-L312](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/event/listener/container-dom.ts#L298-L312)）。
- 复制内容同时写两种格式：`text/plain` TSV（`getCopyValue`，[V/core/BaseTable.ts#L4546](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/core/BaseTable.ts#L4546)）与 `text/html` `<table>`（含 Excel 兼容 CSS，[V/event/util.ts#L119](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/event/util.ts#L119)）。
- 粘贴：`EventManager.handlePaste`（[V/event/event.ts#L1490](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/event/event.ts#L1490)）；同时读 `text/html` 与 `text/plain`，事件剪贴板拿不到时用 async Clipboard API 兜底（#L1693、#L1717）；HTML 解析 #L1768，纯文本 #L1861。Excel 复制过来的 HTML 表格可直接粘贴。
- 平铺粘贴：选区大于粘贴数据时按块重复填充（`handlePasteValues`，[#L2261](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/event/event.ts#L2261)）。
- 逐格校验：粘贴写入统一走 `changeCellValues(..., workOnEditableCell, ...)`（#L1838 / #L1906），不可编辑格与 `validateValue` 未通过的格会被跳过（cut 时要求全部可写）。
- 事件名 `pasted_data`（[V/core/TABLE_EVENT_TYPE.ts#L241](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/core/TABLE_EVENT_TYPE.ts#L241)），载荷 `{col, row, pasteData, changedCellResults}`，触发点 [event.ts#L1928](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/event/event.ts#L1928)。
- **二维数组粘贴 API（核心）**：`ListTable.changeCellValues(startCol, startRow, values: (string|number)[][], workOnEditableCell = false, triggerEvent = true, noTriggerChangeCellValuesEvent?, shouldCancel?)`（[V/ListTable.ts#L1849](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ListTable.ts#L1849)，JSDoc 明确是"粘贴数据的起始列号/行号"）。默认 `workOnEditableCell=false` 可写任意格；键盘粘贴传 `true`，只写"有 editor 定义"的格。
- Sheet 侧：`WorkSheet.getCopyData()`（[S/core/WorkSheet.ts#L1213](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable-sheet/src/core/WorkSheet.ts#L1213)）、`pasteData(data, startCol, startRow)`（[#L1264](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable-sheet/src/core/WorkSheet.ts#L1264)）；Sheet 强制打开 copy/cut/paste 开关（[#L413-L423](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable-sheet/src/core/WorkSheet.ts#L413-L423)）。注意 `getCopiedData()`（#L929）是整个 sheet 数据副本，别与 `getCopyData()` 混用。
- 坑：`allowRangePaste` 只存在于内部类型（[V/ts-types/base-table.ts#L243](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ts-types/base-table.ts#L243)），无公开入口，别用。

## 2. 数字格式

- 结论：**没有内置格式化 API**。核心与 Sheet 里都没有 `Intl.NumberFormat`、currency/percent/format-string、也没有 `column.format`；只有回调式 formatter。
- ListTable 列级 API 名是 `fieldFormat`（[V/ts-types/list-table/define/basic-define.ts#L61](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ts-types/list-table/define/basic-define.ts#L61)）：
  ```ts
  export type FieldGetter = (record: any, col?: number, row?: number, table?: BaseTableAPI) => any;
  export interface FieldAssessor { get: FieldGetter; set: FieldSetter; }
  export type FieldFormat = FieldGetter | FieldAssessor;
  ```
  定义见 [V/ts-types/table-engine.ts#L62-L71](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ts-types/table-engine.ts#L62-L71)。**第一个参数是整行 record，不是单元格值**；调用点 [V/data/DataSource.ts#L113](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/data/DataSource.ts#L113)（`fieldGet(record, col, row, table)`），渲染时 `getFieldData(fieldFormat || field, col, row)`（[V/ListTable.ts#L642](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ListTable.ts#L642)）。
- PivotTable 指标用 `format`（值）/`headerFormat`（名称）（[V/ts-types/pivot-table/indicator/basic-indicator.ts#L52-L53](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ts-types/pivot-table/indicator/basic-indicator.ts#L52-L53)）；序号列另有按值调用的 `format?(col,row,table)`（[V/ts-types/table-engine.ts#L155](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ts-types/table-engine.ts#L155)）。
- 货币/百分比/小数示例（在列上自定义）：
  ```ts
  const money = (v: number) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(v);
  const pct  = (v: number) => `${(v * 100).toFixed(2)}%`;
  const dec2 = (v: number) => v.toFixed(2);
  const columns = [
    { field: 'amount', title: '金额', fieldFormat: (record) => money(record.amount) },
    { field: 'rate',   title: '占比', fieldFormat: (record) => pct(record.rate) },
    { field: 'price',  title: '单价', fieldFormat: (record) => dec2(record.price) },
  ];
  ```
- Sheet 侧：`IColumnDefine extends Omit<ColumnDefine,'field'>`，所以列的 `fieldFormat` 同样可用；但 **没有格式工具栏**，`MainMenuItemKey` 只有导入导出（[S/ts-types/base.ts#L51](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable-sheet/src/ts-types/base.ts#L51)）。

## 3. 合并单元格

- API 只在 `ListTable`（PivotTable 没有）：`mergeCells(startCol, startRow, endCol, endRow)`（[V/ListTable.ts#L2648](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ListTable.ts#L2648)）、`unmergeCells(...)`（[#L2688](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ListTable.ts#L2688)）。
- 两个注意点：① 区间内已有合并时 `mergeCells` **静默不做任何事**；② 两者都会改写 `options.customMergeCell`，若原先是**函数**形态会被丢弃并重置为 `[]`。
- 数据结构：`customMergeCell: CustomMergeCell = CustomMergeCellFunc | CustomMerge[]`，`CustomMerge = { range: CellRange; text?: string; style?; customLayout?; customRender? }`（[V/ts-types/table-engine.ts#L891-L901](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ts-types/table-engine.ts#L891-L901)）。
- 按列自动合并相邻相同值：`column.mergeCell?: MergeCellOption = boolean | ((v1, v2, {source,target,table}) => boolean)`（[V/ts-types/common.ts#L38-L48](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ts-types/common.ts#L38-L48)、[basic-define.ts#L86](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ts-types/list-table/define/basic-define.ts#L86)）。
- **枚举已有合并：没有 `getMergeCells()`**。用 `table.options.customMergeCell`（数组形态）遍历，或 `table.getCustomMerge(col,row)`（[V/ts-types/base-table.ts#L1094](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ts-types/base-table.ts#L1094)）、`getMergeCellRect(col,row)`（#L1075）判断单格。
- 事件：`merge_cells` / `unmerge_cells`（[TABLE_EVENT_TYPE.ts#L94,L98](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/core/TABLE_EVENT_TYPE.ts#L94)），载荷 `{startCol,startRow,endCol,endRow}`（[V/ts-types/events.ts#L358-L370](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ts-types/events.ts#L358-L370)）。
- Sheet：`ISheetDefine.cellMerge`（[S/ts-types/index.ts#L40](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable-sheet/src/ts-types/index.ts#L40)）→ 建表时映射到 `customMergeCell`（[S/components/vtable-sheet.ts#L537](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable-sheet/src/components/vtable-sheet.ts#L537)）；`saveToConfig()` 会回写 `cellMerge`（[#L936](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable-sheet/src/components/vtable-sheet.ts#L936)），所以右键合并的结果也能持久化。右键"合并/取消合并"来自 ContextMenuPlugin（[P/contextmenu/handle-menu-helper.ts#L196-L231](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable-plugins/src/contextmenu/handle-menu-helper.ts#L196-L231)）。

## 4. 行高列宽

- 交互开关：`resize.columnResizeMode | resize.rowResizeMode: 'all' | 'none' | 'header' | 'body'`（[V/ts-types/base-table.ts#L718-L721](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ts-types/base-table.ts#L718-L721)；顶层同名参数已 deprecated，建议用 `resize: {...}`），逐列禁用 `columns[].disableColumnResize`（[basic-define.ts#L27 附近](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ts-types/list-table/define/basic-define.ts#L27)），谓词 `resize.canResizeColumn(col,row,table)`。
- 拖拽换位默认**关闭**，需 opt-in：`dragOrder.dragHeaderMode: 'all' | 'column' | 'row'`（[base-table.ts#L408](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ts-types/base-table.ts#L408)），逐列 `columns[].dragHeader: false`，结束校验 `dragOrder.validateDragOrderOnEnd(source,target)`；行换位用 `rowSeriesNumber: { dragOrder: true }`。
- 读值（`BaseTableAPI`）：`getRowHeight(row)`（[V/ts-types/base-table.ts#L878](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ts-types/base-table.ts#L878)）、`getColWidth(col)`（#L883）、`getColsWidths()`（#L914）、`getAllRowsHeight()`（#L943）、`getAllColsWidth()`（#L944）、`getCellRect(col,row)`、`getBodyVisibleCellRange()`；写值 `setColWidth` / `setRowHeight`。
- 列顺序：核心**没有 `getColumns()`**；用属性 getter `table.columns`，它返回**重排后**的树（[V/ListTable.ts#L538](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ListTable.ts#L538)）。Sheet 的 `WorkSheet.getColumns()` 才是方法。
- 落盘结构：`columnWidthConfig?: {key: string|number; width: number}[]`、`rowHeightConfig?: {key: number; height: number}[]`（核心 [V/ts-types/table-engine.ts#L344-L345](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ts-types/table-engine.ts#L344-L345)；Sheet [S/ts-types/index.ts#L60-L68](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable-sheet/src/ts-types/index.ts#L60-L68)）。
- Sheet 往返：`saveToConfig()` 由 `_widthResizedColMap`/`_heightResizedRowMap` + `getColWidth`/`getRowHeight` 生成上述配置（[S/components/vtable-sheet.ts#L915-L928](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable-sheet/src/components/vtable-sheet.ts#L915-L928)，写入 sheets 见 #L944-L945）。只记录**用户手动调整过**的行列；`saveToConfig` 里的 key 是数字列索引，object-field 列可能对不上 `columns[].key`（推断，未实测）。注意 Sheet 的 persistence 文档写"行高列宽待开发"，与 1.26.8 实现不符。

## 5. 可编辑性控制（重点）

- 核心**没有 `readOnly`/`disable`/`editCell` 选项**。编辑相关只有：列级/全局 `editor`、`headerEditor`、`editCellTrigger`（[V/ts-types/table-engine.ts#L293-L297](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ts-types/table-engine.ts#L293-L297)、列级 [basic-define.ts#L91](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ts-types/list-table/define/basic-define.ts#L91)）与 `disableInteraction?`（[base-table.ts#L615](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ts-types/base-table.ts#L615)，语义未验证，会连选中/滚动一起关，不建议用）。
- 解析规则（逐格解析，[V/ListTable.ts#L1765-L1793](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ListTable.ts#L1765-L1793)）：
  ```ts
  let editor = this.isHeader(col, row)
    ? (define as ColumnDefine)?.headerEditor ?? this.options.headerEditor
    : (define as ColumnDefine)?.editor ?? this.options.editor;   // 列级优先于全局
  if (typeof editor === 'function') editor = (editor as Function)({ col, row, dataValue, value, table: this });
  if (typeof editor === 'string') editor = editors.get(editor);
  if (editor) { /* 缓存并返回 */ }
  return editor as IEditor;      // falsy 即"此格不可编辑"
  ```
- 真正的闸门是 `EditManager.startEditCell`：`const editor = getEditor(...); if (editor) { …进入编辑… }`（[V/edit/edit-manager.ts#L146-L151](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/edit/edit-manager.ts#L146-L151)）。于是：
  - **整表只读（核心）**：不配置 `editor`/`headerEditor`（或置 `undefined`）；再配 `editCellTrigger: 'api'` 可挡住鼠标/键盘触发，但 `startEditCell()` 仍可编程进入。
  - **单格只读**：让该列 `editor` 函数对这个 `(col,row)` 返回 falsy。声明类型是 `string | IEditor`，**`undefined` 不在类型里，需要 `as any` 强转**；运行时（`getEditor`）能正确处理 falsy。**没有 `beforeEditCell` 钩子**。
  - **写入侧护栏**：`changeCellValue(...)` / `changeCellValues(..., workOnEditableCell, ...)`；`workOnEditableCell=true` 时只看 `isHasEditorDefine(col,row)`（[ListTable.ts#L1796](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable/src/ListTable.ts#L1796)），默认 `false` 表示可写任意格。
- **Sheet 缺口**：`ISheetDefine`（[S/ts-types/index.ts#L25-L79](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable-sheet/src/ts-types/index.ts#L25-L79)）没有 `protected/readOnly/lock/editable/disabled`，`IVTableSheetOptions` 也没有；而且建页时在 `...sheetDefine` **之后**硬写 `headerEditor: formulaEditor` / `editor: formulaEditor` / `editCellTrigger: ['api','keydown','doubleclick']`（[S/components/vtable-sheet.ts#L525-L536](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable-sheet/src/components/vtable-sheet.ts#L525-L536)），所以无法靠配置关掉。插件里也没有锁定插件；`MenuKey.SET_PROTECTION` 是注释掉的空实现（[P/contextmenu/types.ts#L152](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable-plugins/src/contextmenu/types.ts#L152)、[handle-menu-helper.ts#L234](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable-plugins/src/contextmenu/handle-menu-helper.ts#L234)）。
- **可行的"只锁某一页"写法**：拿到该页的 `ListTable` 实例后覆盖编辑器解析函数。所有用户编辑入口（EditManager、粘贴校验、Excel 键盘插件的删除）都会经过 `getEditor`/`isHasEditorDefine`：
  ```ts
  const sheet = new VTableSheet(container, options);

  function lockSheet(key: string) {
    const t: any = sheet.getWorkSheetByKey(key)?.tableInstance;   // S/components/vtable-sheet.ts#L848
    if (!t) return;
    t.getEditor = () => undefined;        // startEditCell 直接 no-op
    t.isHasEditorDefine = () => false;    // 粘贴/键盘删除视为不可编辑
    t.options.editor = undefined;
    t.options.headerEditor = undefined;
    t.options.editCellTrigger = [];       // 再挡一层鼠标/键盘进入
  }

  lockSheet('computed');                  // 只锁计算页，其它 sheet 仍可编辑

  // 宿主仍可写入计算结果（workOnEditableCell=false 不受上面的锁影响）
  sheet.getWorkSheetByKey('computed')!.tableInstance!
    .changeCellValues(0, 0, computed2D, false, true);
  ```
  - 公式栏是**旁路**：Sheet 的公式栏走 `formulaManager.setCellContent`（`WorkSheet.setCellFormula`），不经过 `getEditor`；锁定页还需 `showFormulaBar: false`（全局选项，非 per-sheet）或在 formulaManager 层加 guard。此结论由源码推断，未见文档说明。
- 校验钩子：`IEditor.validateValue(newValue, oldValue, position, table, isClickOnTable) => boolean | ValidateEnum | Promise<...>`；`ValidateEnum` 四值（`validate-exit` / `invalidate-exit` / `validate-not-exit` / `invalidate-not-exit`）；粘贴时也会调用。**没有 `EDITOR_MODE`**。

## 6. 导入导出插件

- 能力在 `@visactor/vtable-plugins` 里：`TableExportPlugin`（[P/table-export.ts#L30](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable-plugins/src/table-export.ts#L30)）给实例挂 `exportToCsv()`（#L57）/`exportToExcel()`（#L64），并给 VTableSheet 挂内部 `_exportMutipleTablesToExcel`（#L76）；依赖 `exceljs` + `file-saver`。`ExcelImportPlugin`（[P/excel-import.ts#L14](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable-plugins/src/excel-import.ts#L14)）给 Sheet 挂 `_importFile`（#L56）。
- Sheet 里**只能手动注册**（通过 `IVTableSheetOptions.VTablePluginModules`，[S/ts-types/index.ts#L98](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable-sheet/src/ts-types/index.ts#L98)）：
  ```ts
  VTablePluginModules: [
    { module: VTablePlugins.TableExportPlugin },
    { module: VTablePlugins.ExcelImportPlugin },
  ],
  mainMenu: {
    show: true,
    items: [
      { name: '导入', menuKey: VTableSheet.TYPES.MainMenuItemKey.IMPORT },
      { name: '导出全部', menuKey: VTableSheet.TYPES.MainMenuItemKey.EXPORT_ALL_SHEETS_XLSX },
    ],
  },
  ```
- **默认不启用**：Sheet 内置插件只有 History / Filter / AddRowColumn / TableSeriesNumber / ExcelEditCellKeyboard / AutoFill / ContextMenu（[S/core/table-plugins.ts#L53-L290](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable-sheet/src/core/table-plugins.ts#L53-L290)），没有 export/import；未注册就调 `exportSheetToFile()` 会抛 `TableExportPlugin not configured …`（[S/components/vtable-sheet.ts#L1163](https://github.com/VisActor/VTable/blob/v1.26.8/packages/vtable-sheet/src/components/vtable-sheet.ts#L1163)）。`mainMenu.show` 默认 false，即默认界面没有导入导出按钮。
- Sheet API：`exportSheetToFile('csv'|'xlsx', allSheets?)`（#L1163）、`exportAllSheetsToExcel()`（#L1204）、`importFileToSheet({ clearExisting })`（#L1230）。核心表本身只有图片导出（`exportImg`/`exportCellImg`/`exportCanvas`），没有 CSV/Excel。

## 附：坑与未验证项

- 未验证：官方性能实测数字（README 仅"百万级数据/秒级渲染"，无 ms/FPS/内存/机型/方法学）、`disableInteraction` 语义、`columnResizeMode` 默认值、"canvas 双缓冲"说法。
- 文档过时项：Sheet 的 persistence 文档称行高列宽"待开发"，实际 1.26.8 已持久化。
- 未评估：1.27.0-alpha 系列。
