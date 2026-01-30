import { KPlugin, PluginConfig } from "@kn/common";
import { BitableExtension } from "./bitable";

interface BitablePluginConfig extends PluginConfig {
    // Plugin-specific configuration
}

class BitablePlugin extends KPlugin<BitablePluginConfig> { }

export const bitable = new BitablePlugin({
    status: '',
    name: 'Bitable',
    editorExtension: [BitableExtension],
    locales: {
        en: {
            translation: {
                "bitable": {
                    // View names
                    "views": {
                        "table": "Table View",
                        "kanban": "Kanban View",
                        "gallery": "Gallery View",
                        "calendar": "Calendar View",
                        "timeline": "Gantt View",
                        "chart": "Chart View",
                        "default": "View"
                    },
                    // Actions
                    "actions": {
                        "addView": "Add View",
                        "deleteView": "Delete View",
                        "configureColumns": "Configure Columns",
                        "addRecord": "Add Record",
                        "delete": "Delete",
                        "cancel": "Cancel",
                        "confirm": "Confirm",
                        "save": "Save",
                        "add": "Add",
                        "importExcel": "Import Excel"
                    },
                    // Record stats
                    "stats": {
                        "totalRecords": "{{count}} records total"
                    },
                    // Field types
                    "fieldTypes": {
                        "text": "Text",
                        "number": "Number",
                        "select": "Select",
                        "multiSelect": "Multi-Select",
                        "date": "Date",
                        "checkbox": "Checkbox",
                        "rating": "Rating",
                        "progress": "Progress",
                        "image": "Image",
                        "url": "URL",
                        "email": "Email",
                        "phone": "Phone",
                        "person": "Person"
                    },
                    // Field configuration
                    "fieldConfig": {
                        "title": "Configure Columns",
                        "description": "Manage field visibility, order and properties",
                        "fieldList": "Field List",
                        "addField": "Add Field",
                        "fieldName": "Field Name",
                        "fieldType": "Field Type",
                        "fieldNamePlaceholder": "Enter field name",
                        "deleteField": "Delete Field",
                        "optionsList": "Options List",
                        "newOptionPlaceholder": "New option name",
                        "columnWidth": "Column Width",
                        "fieldDescription": "Field Description",
                        "fieldDescriptionPlaceholder": "Add description for this field...",
                        "confirmAdd": "Confirm Add",
                        "convertFieldType": "Convert Field Type",
                        "convertFieldTypeDescription": "Change this field to a different type. Existing data will be automatically converted.",
                        "currentType": "Current Type",
                        "newType": "New Type",
                        "convertButton": "Convert",
                        "conversionWarning": "Warning: Some data may be lost during conversion.",
                        "autoGenerateOptions": "Auto-generate options from existing data"
                    },
                    // Field formats
                    "formats": {
                        "number": "Number",
                        "currency": "Currency",
                        "percent": "Percent",
                        "decimal": "Decimal",
                        "singleLine": "Single Line",
                        "multiLine": "Multi Line",
                        "stars5": "5 Stars",
                        "stars10": "10 Stars",
                        "progressBar": "Progress Bar",
                        "progressRing": "Ring",
                        "progressNumber": "Number",
                        "openNewTab": "Open in New Tab",
                        "numberFormat": "Number Format",
                        "dateFormat": "Date Format",
                        "textType": "Text Type",
                        "maxRating": "Max Rating",
                        "progressDisplay": "Progress Display",
                        "imageCount": "Image Count",
                        "singleImage": "Single Image",
                        "multipleImages": "Multiple Images",
                        "thumbnailSize": "Thumbnail Size",
                        "sizeSmall": "Small (32px)",
                        "sizeMedium": "Medium (64px)",
                        "sizeLarge": "Large (128px)"
                    },
                    // Tips
                    "tips": {
                        "title": "Tips",
                        "dragToReorder": "Drag fields to reorder",
                        "clickEyeToToggle": "Click eye icon to show/hide field",
                        "clickFieldToConfigure": "Click field name to configure properties",
                        "idFieldLocked": "ID field cannot be deleted, hidden or moved"
                    },
                    // Default field names
                    "defaultFields": {
                        "id": "ID",
                        "name": "Name",
                        "status": "Status",
                        "priority": "Priority",
                        "assignee": "Assignee",
                        "dueDate": "Due Date",
                        "progress": "Progress"
                    },
                    // Default options
                    "defaultOptions": {
                        "notStarted": "Not Started",
                        "inProgress": "In Progress",
                        "completed": "Completed",
                        "low": "Low",
                        "medium": "Medium",
                        "high": "High",
                        "option1": "Option 1",
                        "option2": "Option 2",
                        "option3": "Option 3"
                    },
                    // Table view
                    "tableView": {
                        "noData": "No data",
                        "addRow": "Add Row"
                    },
                    // Kanban view
                    "kanbanView": {
                        "uncategorized": "Uncategorized",
                        "addCard": "Add Card"
                    },
                    // Gallery view
                    "galleryView": {
                        "noCover": "No Cover"
                    },
                    // Timeline view
                    "timelineView": {
                        "today": "Today",
                        "noDate": "No Date"
                    },
                    // Calendar view
                    "calendarView": {
                        "today": "Today",
                        "month": "Month",
                        "week": "Week",
                        "day": "Day"
                    },
                    // Chart view
                    "chartView": {
                        "configure": "Configure",
                        "chartConfig": "Chart Configuration",
                        "chartType": "Chart Type",
                        "barChart": "Bar Chart",
                        "lineChart": "Line Chart",
                        "pieChart": "Pie Chart",
                        "areaChart": "Area Chart",
                        "stackedBarChart": "Stacked Bar Chart",
                        "stackedAreaChart": "Stacked Area Chart",
                        "donutChart": "Donut Chart",
                        "radarChart": "Radar Chart",
                        "scatterChart": "Scatter Chart",
                        "radialBarChart": "Radial Bar Chart",
                        "title": "Title",
                        "titlePlaceholder": "Enter chart title",
                        "description": "Description",
                        "descriptionPlaceholder": "Enter chart description",
                        "xAxis": "X-Axis",
                        "yAxis": "Y-Axis",
                        "selectField": "Select field",
                        "selectXAxis": "Please select X-axis field",
                        "selectYAxis": "Please select Y-axis field",
                        "valueField": "Value Field",
                        "aggregation": "Aggregation",
                        "sum": "Sum",
                        "count": "Count",
                        "average": "Average",
                        "min": "Min",
                        "max": "Max",
                        "showLegend": "Show Legend",
                        "showGrid": "Show Grid",
                        "showYAxis": "Show Y-Axis",
                        "showDataLabels": "Show Data Labels",
                        "enableAnimation": "Enable Animation",
                        "horizontalBar": "Horizontal Bars",
                        "smoothLine": "Smooth Line",
                        "innerRadius": "Inner Radius",
                        "outerRadius": "Outer Radius",
                        "chartHeight": "Chart Height",
                        "colorScheme": "Color Scheme",
                        "colorDefault": "Default",
                        "colorWarm": "Warm",
                        "colorCool": "Cool",
                        "colorMonochrome": "Monochrome",
                        "sortOrder": "Sort Order",
                        "sortNone": "None",
                        "sortAsc": "Ascending",
                        "sortDesc": "Descending",
                        "topN": "Top N Items",
                        "all": "All",
                        "records": "records",
                        "categories": "categories",
                        "others": "Others",
                        "basic": "Basic",
                        "data": "Data",
                        "style": "Style",
                        "scatterNeedsTwoFields": "Scatter chart requires at least 2 numeric fields",
                        "yAxisConfig": "Y-Axis Configuration",
                        "yAxisLabel": "Axis Label",
                        "yAxisLabelPlaceholder": "Enter Y-axis label",
                        "yAxisMin": "Min Value",
                        "yAxisMax": "Max Value",
                        "auto": "Auto",
                        "tickFormatter": "Value Format",
                        "formatNumber": "Number",
                        "formatPercent": "Percent",
                        "formatCurrency": "Currency",
                        "formatCompact": "Compact (K/M)",
                        "showAxisLine": "Show Axis Line",
                        "noYAxisField": "Click 'Add' to select a statistics field"
                    },
                    // Excel import
                    "excelImport": {
                        "title": "Import from Excel",
                        "description": "Import data from Excel spreadsheet into this table",
                        "mappingTitle": "Map Columns",
                        "mappingDescription": "Map Excel columns to table fields or create new fields",
                        "dropzone": {
                            "title": "Drop Excel file here",
                            "description": "Support .xlsx, .xls, .csv files",
                            "button": "Select File"
                        },
                        "hasHeaderRow": "First row contains headers",
                        "recordCount": "{{count}} records found",
                        "sampleValue": "Sample",
                        "createNewField": "Create new field",
                        "selectField": "Select field",
                        "skipColumn": "Skip this column",
                        "importButton": "Import Data",
                        "importing": "Importing...",
                        "summary": {
                            "newFields": "{{count}} new fields",
                            "mapped": "{{count}} mapped"
                        },
                        "errors": {
                            "emptyFile": "The Excel file is empty",
                            "parseError": "Failed to parse Excel file",
                            "importError": "Failed to import data",
                            "invalidFormat": "Invalid file format. Please select .xlsx, .xls or .csv file"
                        }
                    }
                }
            }
        },
        zh: {
            translation: {
                "bitable": {
                    // View names
                    "views": {
                        "table": "表格视图",
                        "kanban": "看板视图",
                        "gallery": "画廊视图",
                        "calendar": "日历视图",
                        "timeline": "甘特图视图",
                        "chart": "图表视图",
                        "default": "视图"
                    },
                    // Actions
                    "actions": {
                        "addView": "添加视图",
                        "deleteView": "删除视图",
                        "configureColumns": "配置列",
                        "addRecord": "添加记录",
                        "delete": "删除",
                        "cancel": "取消",
                        "confirm": "确认",
                        "save": "保存",
                        "add": "添加",
                        "importExcel": "导入Excel"
                    },
                    // Record stats
                    "stats": {
                        "totalRecords": "共 {{count}} 条记录"
                    },
                    // Field types
                    "fieldTypes": {
                        "text": "文本",
                        "number": "数字",
                        "select": "单选",
                        "multiSelect": "多选",
                        "date": "日期",
                        "checkbox": "复选框",
                        "rating": "评分",
                        "progress": "进度",
                        "image": "图片",
                        "url": "链接",
                        "email": "邮箱",
                        "phone": "电话",
                        "person": "人员"
                    },
                    // Field configuration
                    "fieldConfig": {
                        "title": "配置列",
                        "description": "管理字段的显示、顺序和属性",
                        "fieldList": "字段列表",
                        "addField": "添加字段",
                        "fieldName": "字段名称",
                        "fieldType": "字段类型",
                        "fieldNamePlaceholder": "输入字段名称",
                        "deleteField": "删除字段",
                        "optionsList": "选项列表",
                        "newOptionPlaceholder": "新选项名称",
                        "columnWidth": "列宽",
                        "fieldDescription": "字段描述",
                        "fieldDescriptionPlaceholder": "为字段添加描述信息...",
                        "confirmAdd": "确认添加",
                        "convertFieldType": "转换字段类型",
                        "convertFieldTypeDescription": "将此字段更改为不同类型。现有数据将自动转换。",
                        "currentType": "当前类型",
                        "newType": "新类型",
                        "convertButton": "转换",
                        "conversionWarning": "警告：转换过程中可能会丢失部分数据。",
                        "autoGenerateOptions": "从现有数据自动生成选项"
                    },
                    // Field formats
                    "formats": {
                        "number": "数字",
                        "currency": "货币",
                        "percent": "百分比",
                        "decimal": "小数",
                        "singleLine": "单行文本",
                        "multiLine": "多行文本",
                        "stars5": "5星",
                        "stars10": "10星",
                        "progressBar": "进度条",
                        "progressRing": "环形",
                        "progressNumber": "数字",
                        "openNewTab": "新标签页打开",
                        "numberFormat": "数字格式",
                        "dateFormat": "日期格式",
                        "textType": "文本类型",
                        "maxRating": "最大评分",
                        "progressDisplay": "进度显示",
                        "imageCount": "图片数量",
                        "singleImage": "单张图片",
                        "multipleImages": "多张图片",
                        "thumbnailSize": "缩略图大小",
                        "sizeSmall": "小 (32px)",
                        "sizeMedium": "中 (64px)",
                        "sizeLarge": "大 (128px)"
                    },
                    // Tips
                    "tips": {
                        "title": "提示",
                        "dragToReorder": "拖拽字段可以调整显示顺序",
                        "clickEyeToToggle": "点击眼睛图标可以显示/隐藏字段",
                        "clickFieldToConfigure": "点击字段名称可以配置详细属性",
                        "idFieldLocked": "ID字段不可删除、隐藏或移动"
                    },
                    // Default field names
                    "defaultFields": {
                        "id": "ID",
                        "name": "名称",
                        "status": "状态",
                        "priority": "优先级",
                        "assignee": "负责人",
                        "dueDate": "截止日期",
                        "progress": "进度"
                    },
                    // Default options
                    "defaultOptions": {
                        "notStarted": "未开始",
                        "inProgress": "进行中",
                        "completed": "已完成",
                        "low": "低",
                        "medium": "中",
                        "high": "高",
                        "option1": "选项1",
                        "option2": "选项2",
                        "option3": "选项3"
                    },
                    // Table view
                    "tableView": {
                        "noData": "暂无数据",
                        "addRow": "添加行"
                    },
                    // Kanban view
                    "kanbanView": {
                        "uncategorized": "未分类",
                        "addCard": "添加卡片"
                    },
                    // Gallery view
                    "galleryView": {
                        "noCover": "无封面"
                    },
                    // Timeline view
                    "timelineView": {
                        "today": "今天",
                        "noDate": "无日期"
                    },
                    // Calendar view
                    "calendarView": {
                        "today": "今天",
                        "month": "月",
                        "week": "周",
                        "day": "日"
                    },
                    // Chart view
                    "chartView": {
                        "configure": "配置",
                        "chartConfig": "图表配置",
                        "chartType": "图表类型",
                        "barChart": "柱状图",
                        "lineChart": "折线图",
                        "pieChart": "饼图",
                        "areaChart": "面积图",
                        "stackedBarChart": "堆叠柱状图",
                        "stackedAreaChart": "堆叠面积图",
                        "donutChart": "甘圈图",
                        "radarChart": "雷达图",
                        "scatterChart": "散点图",
                        "radialBarChart": "径向条形图",
                        "title": "标题",
                        "titlePlaceholder": "输入图表标题",
                        "description": "描述",
                        "descriptionPlaceholder": "输入图表描述",
                        "xAxis": "X轴",
                        "yAxis": "Y轴",
                        "selectField": "选择字段",
                        "selectXAxis": "请选择X轴字段",
                        "selectYAxis": "请选择Y轴字段",
                        "valueField": "数值字段",
                        "aggregation": "聚合方式",
                        "sum": "求和",
                        "count": "计数",
                        "average": "平均值",
                        "min": "最小值",
                        "max": "最大值",
                        "showLegend": "显示图例",
                        "showGrid": "显示网格",
                        "showYAxis": "显示Y轴",
                        "showDataLabels": "显示数据标签",
                        "enableAnimation": "启用动画",
                        "horizontalBar": "横向条形",
                        "smoothLine": "平滑曲线",
                        "innerRadius": "内半径",
                        "outerRadius": "外半径",
                        "chartHeight": "图表高度",
                        "colorScheme": "配色方案",
                        "colorDefault": "默认",
                        "colorWarm": "暖色调",
                        "colorCool": "冷色调",
                        "colorMonochrome": "单色调",
                        "sortOrder": "排序方式",
                        "sortNone": "不排序",
                        "sortAsc": "升序",
                        "sortDesc": "降序",
                        "topN": "显示前N项",
                        "all": "全部",
                        "records": "条记录",
                        "categories": "个分类",
                        "others": "其他",
                        "basic": "基础",
                        "data": "数据",
                        "style": "样式",
                        "scatterNeedsTwoFields": "散点图需要至少2个数值字段",
                        "yAxisConfig": "Y轴配置",
                        "yAxisLabel": "轴标签",
                        "yAxisLabelPlaceholder": "输入Y轴标签",
                        "yAxisMin": "最小值",
                        "yAxisMax": "最大值",
                        "auto": "自动",
                        "tickFormatter": "数值格式",
                        "formatNumber": "数字",
                        "formatPercent": "百分比",
                        "formatCurrency": "货币",
                        "formatCompact": "紧凑 (K/M)",
                        "showAxisLine": "显示轴线",
                        "noYAxisField": "点击'添加'选择统计字段"
                    },
                    // Excel import
                    "excelImport": {
                        "title": "从 Excel 导入",
                        "description": "从 Excel 电子表格导入数据到此表格",
                        "mappingTitle": "列映射",
                        "mappingDescription": "将 Excel 列映射到表格字段或创建新字段",
                        "dropzone": {
                            "title": "拖放 Excel 文件到此处",
                            "description": "支持 .xlsx, .xls, .csv 文件",
                            "button": "选择文件"
                        },
                        "hasHeaderRow": "第一行包含标题",
                        "recordCount": "找到 {{count}} 条记录",
                        "sampleValue": "示例",
                        "createNewField": "创建新字段",
                        "selectField": "选择字段",
                        "skipColumn": "跳过此列",
                        "importButton": "导入数据",
                        "importing": "导入中...",
                        "summary": {
                            "newFields": "{{count}} 个新字段",
                            "mapped": "{{count}} 个已映射"
                        },
                        "errors": {
                            "emptyFile": "Excel 文件为空",
                            "parseError": "解析 Excel 文件失败",
                            "importError": "导入数据失败",
                            "invalidFormat": "无效的文件格式，请选择 .xlsx, .xls 或 .csv 文件"
                        }
                    }
                }
            }
        }
    }
});
