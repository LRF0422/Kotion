/**
 * Translation data and lookup for the Office plugin.
 *
 * Deliberately import-free: `./index.ts` binds the live i18next language, while
 * this module stays loadable by the Node test runner so both dictionaries can be
 * checked for completeness.
 * @module @kn/plugin-office/i18n/translate
 */

export const translations = {
    en: {
        slashCommands: {
            spreadsheet: 'Spreadsheet',
            importExcel: 'Import Excel',
        },
        spreadsheet: {
            title: 'Spreadsheet',
            export: 'Export',
            exportTooltip: 'Export as .xlsx',
            fullscreen: 'Fullscreen',
            exitFullscreen: 'Exit fullscreen',
            close: 'Close',
            importFailed: 'Excel failed',
            exportEmpty: 'This spreadsheet has nothing to export',
            contextImport: 'Import Excel',
            contextExport: 'Export Excel',
            formula: {
                reference: 'Cell reference',
                content: 'Cell content',
                fx: 'fx',
            },
            contextMenu: {
                copy: 'Copy',
                cut: 'Cut',
                paste: 'Paste',
                insert: 'Insert',
                insert_row_above: 'Insert rows above',
                insert_row_below: 'Insert rows below',
                insert_column_left: 'Insert columns left',
                insert_column_right: 'Insert columns right',
                delete: 'Delete',
                delete_row: 'Delete row',
                delete_column: 'Delete column',
                freeze: 'Freeze',
                freeze_to_this_row: 'Freeze to this row',
                freeze_to_this_column: 'Freeze to this column',
                freeze_to_this_row_and_column: 'Freeze to this row and column',
                unfreeze: 'Unfreeze',
                merge_cells: 'Merge cells',
                unmerge_cells: 'Unmerge cells',
                hide_column: 'Hide column',
                sort: 'Sort',
                set_filter: 'Set filter',
                cancel_filter: 'Clear filter',
                enable_first_row_as_header: 'Use first row as header',
                disable_first_row_as_header: 'Remove header row',
            },
            sheet: {
                add: 'Add sheet',
                menu: 'Sheet options',
                scrollLeft: 'Scroll sheets left',
                scrollRight: 'Scroll sheets right',
            },
            toolbar: {
                undo: 'Undo (Ctrl+Z)',
                redo: 'Redo (Ctrl+Shift+Z)',
                fontSize: 'Font size',
                bold: 'Bold (Ctrl+B)',
                italic: 'Italic (Ctrl+I)',
                underline: 'Underline (Ctrl+U)',
                strikethrough: 'Strikethrough',
                textColor: 'Text colour',
                fillColor: 'Fill colour',
                alignLeft: 'Align left',
                alignCenter: 'Align centre',
                alignRight: 'Align right',
                wrap: 'Wrap text',
                merge: 'Merge / unmerge',
                numberFormat: 'Number format',
                numberGeneral: 'General',
                numberDecimal: 'Number (2 decimals)',
                numberPercent: 'Percentage',
                numberCurrency: 'Currency',
                border: 'Border',
                borderAuto: 'Automatic',
                borderBlack: 'Black',
                borderGrey: 'Grey',
                borderBlue: 'Blue',
                borderRed: 'Red',
                clearFormat: 'Clear formatting',
                import: 'Import',
                export: 'Export',
                fullscreen: 'Fullscreen',
                exitFullscreen: 'Exit',
            },
            pivot: {
                create: 'Pivot table',
                title: 'Create pivot table',
                description: 'Summarise a range into a new worksheet that refreshes with the source data.',
                sourceSheet: 'Source sheet',
                sourceRange: 'Source range',
                firstRowHeader: 'First row is a header',
                fields: 'Fields',
                rows: 'Rows',
                columns: 'Columns',
                values: 'Values',
                aggregateLabel: 'Aggregate',
                total: 'Total',
                source: 'Source',
                sources: 'Source ranges',
                addSource: 'Add range',
                removeSource: 'Remove',
                layout: 'Field layout',
                dragHint: 'Drag fields between Row / Column / Value, or reorder within a lane.',
                dateGroup: 'Date group',
                dateGroupNone: 'Raw',
                dateGroupYear: 'Year',
                dateGroupQuarter: 'Quarter',
                dateGroupMonth: 'Month',
                dateGroupDay: 'Day',
                details: 'Show details',
                detailsTitle: 'Pivot details',
                detailsEmpty: 'No matching rows.',
                close: 'Close',
                rowTotals: 'Row totals',
                columnTotals: 'Column totals',
                outputName: 'Output sheet',
                outputNamePlaceholder: 'Pivot',
                createAction: 'Create',
                cancel: 'Cancel',
                empty: 'Pick a source range with data to list its fields.',
                needFields: 'Choose at least one row or column field.',
                needValues: 'Choose at least one value field.',
                invalidRange: 'Enter a valid range such as A1:D20.',
                sourceIsPivot: 'The source cannot be a generated pivot sheet.',
                generatedReadOnly: 'Generated from the pivot config — cells are read-only. Change the source data or the pivot config.',
                created: 'Pivot table created',
                aggregate: {
                    sum: 'Sum',
                    count: 'Count',
                    average: 'Average',
                    max: 'Max',
                    min: 'Min',
                },
            },
        },
    },
    zh: {
        slashCommands: {
            spreadsheet: '电子表格',
            importExcel: '导入Excel',
        },
        spreadsheet: {
            title: '电子表格',
            export: '导出',
            exportTooltip: '导出为 .xlsx',
            fullscreen: '全屏',
            exitFullscreen: '退出全屏',
            close: '关闭',
            importFailed: 'Excel 处理失败',
            exportEmpty: '当前表格没有可导出的数据',
            contextImport: '导入 Excel',
            contextExport: '导出 Excel',
            formula: {
                reference: '单元格引用',
                content: '单元格内容',
                fx: 'fx',
            },
            contextMenu: {
                copy: '复制',
                cut: '剪切',
                paste: '粘贴',
                insert: '插入',
                insert_row_above: '向上插入行数',
                insert_row_below: '向下插入行数',
                insert_column_left: '向左插入列数',
                insert_column_right: '向右插入列数',
                delete: '删除',
                delete_row: '删除行',
                delete_column: '删除列',
                freeze: '冻结',
                freeze_to_this_row: '冻结到本行',
                freeze_to_this_column: '冻结到本列',
                freeze_to_this_row_and_column: '冻结到本行本列',
                unfreeze: '取消冻结',
                merge_cells: '合并单元格',
                unmerge_cells: '取消合并单元格',
                hide_column: '隐藏列',
                sort: '排序',
                set_filter: '设置筛选器',
                cancel_filter: '取消筛选器',
                enable_first_row_as_header: '启用首行表头',
                disable_first_row_as_header: '取消表头',
            },
            sheet: {
                add: '添加工作表',
                menu: '工作表选项',
                scrollLeft: '向左滚动',
                scrollRight: '向右滚动',
            },
            toolbar: {
                undo: '撤销 (Ctrl+Z)',
                redo: '重做 (Ctrl+Shift+Z)',
                fontSize: '字号',
                bold: '加粗 (Ctrl+B)',
                italic: '斜体 (Ctrl+I)',
                underline: '下划线 (Ctrl+U)',
                strikethrough: '删除线',
                textColor: '文字颜色',
                fillColor: '填充颜色',
                alignLeft: '左对齐',
                alignCenter: '居中',
                alignRight: '右对齐',
                wrap: '自动换行',
                merge: '合并 / 取消合并',
                numberFormat: '数字格式',
                numberGeneral: '常规',
                numberDecimal: '数字（两位小数）',
                numberPercent: '百分比',
                numberCurrency: '货币',
                border: '边框',
                borderAuto: '自动',
                borderBlack: '黑色',
                borderGrey: '灰色',
                borderBlue: '蓝色',
                borderRed: '红色',
                clearFormat: '清除格式',
                import: '导入',
                export: '导出',
                fullscreen: '全屏',
                exitFullscreen: '退出',
            },
            pivot: {
                create: '透视表',
                title: '创建透视表',
                description: '把选定区域汇总到一张新工作表，并随源数据自动刷新。',
                sourceSheet: '源工作表',
                sourceRange: '源区域',
                firstRowHeader: '首行是标题',
                fields: '字段',
                rows: '行',
                columns: '列',
                values: '值',
                aggregateLabel: '聚合方式',
                total: '总计',
                source: '来源',
                sources: '源区域',
                addSource: '添加区域',
                removeSource: '移除',
                layout: '字段布局',
                dragHint: '把字段拖到 行 / 列 / 值，或在同一区域内拖动排序。',
                dateGroup: '日期分组',
                dateGroupNone: '原始',
                dateGroupYear: '年',
                dateGroupQuarter: '季度',
                dateGroupMonth: '月',
                dateGroupDay: '日',
                details: '查看明细',
                detailsTitle: '透视表明细',
                detailsEmpty: '没有匹配的明细行。',
                close: '关闭',
                rowTotals: '行总计',
                columnTotals: '列总计',
                outputName: '输出工作表',
                outputNamePlaceholder: '透视表',
                createAction: '创建',
                cancel: '取消',
                empty: '请选择包含数据的源区域，以列出字段。',
                needFields: '请至少选择一个行或列字段。',
                needValues: '请至少选择一个值字段。',
                invalidRange: '请输入有效区域，例如 A1:D20。',
                sourceIsPivot: '源工作表不能是生成的透视表。',
                generatedReadOnly: '本表由透视配置生成，单元格只读；请修改源数据或透视配置。',
                created: '透视表已创建',
                aggregate: {
                    sum: '求和',
                    count: '计数',
                    average: '平均值',
                    max: '最大值',
                    min: '最小值',
                },
            },
        },
    },
};

export type Translations = typeof translations;
export type SupportedLanguage = keyof Translations;

/**
 * Get translation for a key with optional interpolation params.
 * @param lang - Language code ('en' or 'zh')
 * @param key - Dot-separated key path (e.g., 'spreadsheet.export')
 * @param params - Optional interpolation values (e.g., { count: 3 })
 * @returns Translated string
 */
export function t(
    lang: SupportedLanguage,
    key: string,
    params?: Record<string, string | number>,
): string {
    const keys = key.split('.');
    let value: any = translations[lang];

    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            // Fallback to English
            value = translations.en;
            for (const fallbackKey of keys) {
                if (value && typeof value === 'object' && fallbackKey in value) {
                    value = value[fallbackKey];
                } else {
                    return key;
                }
            }
            break;
        }
    }

    let result = typeof value === 'string' ? value : key;

    if (params) {
        for (const [param, val] of Object.entries(params)) {
            result = result.replace(new RegExp(`{{${param}}}`, 'g'), String(val));
        }
    }

    return result;
}
