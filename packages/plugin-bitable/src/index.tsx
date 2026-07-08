import { KPlugin, PluginConfig } from "@kn/common";
import { BitableExtension } from "./bitable";
import "./bitable/styles/bitable.css";

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
                        "renameView": "Rename View",
                        "configureColumns": "Configure Columns",
                        "addRecord": "Add Record",
                        "delete": "Delete",
                        "cancel": "Cancel",
                        "confirm": "Confirm",
                        "save": "Save",
                        "add": "Add",
                        "importExcel": "Import Excel",
                        "fieldSettings": "Field Settings",
                        "deleteTable": "Delete Table",
                        "new": "New",
                        "newPage": "New page",
                        "comingSoon": "Coming soon"
                    },
                    // Dialog
                    "dialog": {
                        "deleteViewTitle": "Delete View",
                        "deleteViewDescription": "Are you sure you want to delete this view? This action cannot be undone.",
                        "cancel": "Cancel",
                        "delete": "Delete"
                    },
                    // Search
                    "search": {
                        "placeholder": "Search..."
                    },
                    // Record stats
                    "stats": {
                        "totalRecords": "{{count}} records total"
                    },
                    // Field types
                    "fieldTypes": {
                        "text": "Text",
                        "longText": "Long Text",
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
                        "person": "Person",
                        "attachment": "Attachment",
                        "formula": "Formula",
                        "relation": "Relation",
                        "createdTime": "Created Time",
                        "updatedTime": "Updated Time",
                        "createdBy": "Created By",
                        "updatedBy": "Updated By",
                        "autoNumber": "Auto Number",
                        "id": "ID"
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
                        "autoGenerateOptions": "Auto-generate options from existing data",
                        "selectColor": "Select color",
                        "custom": "Custom",
                        "fieldProperties": "Field Properties",
                        "change": "Change"
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
                        "sizeLarge": "Large (128px)",
                        "optionsList": "Options List",
                        "newTabOpen": "Open in New Tab"
                    },
                    // Image editor
                    "imageEditor": {
                        "selectImage": "Select Image",
                        "inputLink": "Input Link",
                        "collapse": "Collapse",
                        "add": "Add",
                        "imageLinkPlaceholder": "Enter image URL..."
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
                        "addRow": "Add Row",
                        "deleteSelected": "Delete ({{count}})",
                        "selectedCount": "{{count}} selected",
                        "freezeColumn": "Freeze column",
                        "unfreezeColumn": "Unfreeze column",
                        "hideColumn": "Hide column",
                        "summary": "Summary",
                        "summaryCycle": "Click to cycle summary"
                    },
                    // Kanban view
                    "kanbanView": {
                        "uncategorized": "Uncategorized",
                        "addCard": "Add Card",
                        "noRecords": "No records",
                        "configureGroupField": "Please configure the group field for the Kanban view",
                        "notSelectType": "The group field must be a Select type",
                        "notGroupableType": "This field type cannot be used to group the Kanban view",
                        "yes": "Yes",
                        "no": "No",
                        "renameGroup": "Rename group",
                        "deleteGroup": "Delete group",
                        "color": "Color",
                        "groupBy": "Group by",
                        "selectGroupField": "Select field"
                    },
                    // Gallery view
                    "galleryView": {
                        "noCover": "No Cover",
                        "noContent": "No content",
                        "noData": "No data",
                        "settings": "Settings",
                        "coverField": "Cover field",
                        "auto": "Auto",
                        "fitType": "Image fit",
                        "fitCover": "Cover",
                        "fitContain": "Contain",
                        "cardSize": "Card size",
                        "sizeSmall": "Small",
                        "sizeMedium": "Medium",
                        "sizeLarge": "Large",
                        "displayFields": "Display fields",
                        "addRecord": "Add record"
                    },
                    // Timeline view
                    "timelineView": {
                        "today": "Today",
                        "noDate": "No Date",
                        "allTasks": "All Tasks",
                        "uncategorized": "Uncategorized",
                        "taskName": "Task Name",
                        "noDateFields": "No available date fields",
                        "noDateFieldsDesc": "Please add a date type field to use the Gantt view",
                        "settings": "Gantt View Settings",
                        "startDateField": "Start Date Field *",
                        "endDateField": "End Date Field",
                        "titleField": "Title Field",
                        "progressField": "Progress Field",
                        "groupByField": "Group By Field",
                        "scaleUnit": "Scale Unit",
                        "day": "Day",
                        "week": "Week",
                        "month": "Month",
                        "none": "None",
                        "selectField": "Select field",
                        "selectOptional": "Select (optional)",
                        "tasksWithoutDate": "{{count}} tasks without date",
                        "showSettings": "Settings",
                        "milestoneField": "Milestone Field",
                        "dependencyField": "Dependency Field",
                        "criticalPath": "Critical Path",
                        "customColors": "Custom Colors"
                    },
                    // Group panel
                    "groupPanel": {
                        "title": "Group By",
                        "emptyHint": "Add a field to group records",
                        "empty": "(empty)",
                        "yes": "Yes",
                        "no": "No"
                    },
                    // Calendar view
                    "calendarView": {
                        "today": "Today",
                        "month": "Month",
                        "week": "Week",
                        "day": "Day",
                        "configure": "Configure Calendar View",
                        "configureDesc": "Please select a date field to display the calendar view",
                        "noDateFields": "No available date fields",
                        "noDateFieldsDesc": "Please add a date type field to use the calendar view",
                        "dateField": "Date Field *",
                        "settings": "Calendar View Settings",
                        "startDateField": "Start Date Field *",
                        "endDateField": "End Date Field",
                        "titleField": "Title Field",
                        "selectDateField": "Select date field",
                        "selectEndDateField": "Select end date field (optional)",
                        "selectTitleField": "Select title field (optional)",
                        "auto": "Auto",
                        "noneField": "None",
                        "year": "Year",
                        "agenda": "Agenda"
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
                        "missingXField": "The X-axis field was deleted. Please reconfigure the chart.",
                        "missingYField": "A Y-axis field was deleted. Please reconfigure the chart.",
                        "dateAggregation": "Time granularity",
                        "dateNone": "None",
                        "dateDay": "By day",
                        "dateWeek": "By week",
                        "dateMonth": "By month",
                        "dateQuarter": "By quarter",
                        "dateYear": "By year",
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
                        "showTrendLine": "Trend line",
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
                        "renameView": "重命名视图",
                        "configureColumns": "配置列",
                        "addRecord": "添加记录",
                        "delete": "删除",
                        "cancel": "取消",
                        "confirm": "确认",
                        "save": "保存",
                        "add": "添加",
                        "importExcel": "导入Excel",
                        "fieldSettings": "字段设置",
                        "deleteTable": "删除表格",
                        "new": "新建",
                        "newPage": "新建记录",
                        "comingSoon": "即将推出"
                    },
                    // Dialog
                    "dialog": {
                        "deleteViewTitle": "删除视图",
                        "deleteViewDescription": "确定要删除此视图吗？此操作无法撤销。",
                        "cancel": "取消",
                        "delete": "删除"
                    },
                    // Search
                    "search": {
                        "placeholder": "搜索..."
                    },
                    // Record stats
                    "stats": {
                        "totalRecords": "共 {{count}} 条记录"
                    },
                    // Field types
                    "fieldTypes": {
                        "text": "文本",
                        "longText": "多行文本",
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
                        "person": "人员",
                        "attachment": "附件",
                        "formula": "公式",
                        "relation": "关联",
                        "createdTime": "创建时间",
                        "updatedTime": "更新时间",
                        "createdBy": "创建人",
                        "updatedBy": "更新人",
                        "autoNumber": "自动编号",
                        "id": "ID"
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
                        "autoGenerateOptions": "从现有数据自动生成选项",
                        "selectColor": "选择颜色",
                        "custom": "自定义",
                        "fieldProperties": "字段属性配置",
                        "change": "更改"
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
                        "sizeLarge": "大 (128px)",
                        "optionsList": "选项列表",
                        "newTabOpen": "新标签页打开"
                    },
                    // Image editor
                    "imageEditor": {
                        "selectImage": "选择图片",
                        "inputLink": "输入链接",
                        "collapse": "收起",
                        "add": "添加",
                        "imageLinkPlaceholder": "输入图片链接..."
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
                        "addRow": "添加行",
                        "deleteSelected": "删除 ({{count}})",
                        "selectedCount": "已选择 {{count}} 项",
                        "freezeColumn": "冻结列",
                        "unfreezeColumn": "取消冻结",
                        "hideColumn": "隐藏列",
                        "summary": "汇总",
                        "summaryCycle": "点击切换汇总方式"
                    },
                    // Kanban view
                    "kanbanView": {
                        "uncategorized": "未分组",
                        "addCard": "添加卡片",
                        "noRecords": "暂无记录",
                        "configureGroupField": "请配置看板视图的分组字段",
                        "notSelectType": "分组字段必须为单选类型",
                        "notGroupableType": "该字段类型不支持作为看板分组",
                        "yes": "是",
                        "no": "否",
                        "renameGroup": "重命名分组",
                        "deleteGroup": "删除分组",
                        "color": "颜色",
                        "groupBy": "分组依据",
                        "selectGroupField": "选择字段"
                    },
                    // Gallery view
                    "galleryView": {
                        "noCover": "无封面",
                        "noContent": "无内容",
                        "noData": "暂无数据",
                        "settings": "设置",
                        "coverField": "封面字段",
                        "auto": "自动",
                        "fitType": "图片填充",
                        "fitCover": "裁剪填充",
                        "fitContain": "完整显示",
                        "cardSize": "卡片大小",
                        "sizeSmall": "小",
                        "sizeMedium": "中",
                        "sizeLarge": "大",
                        "displayFields": "显示字段",
                        "addRecord": "添加记录"
                    },
                    // Timeline view
                    "timelineView": {
                        "today": "今天",
                        "noDate": "无日期",
                        "allTasks": "所有任务",
                        "uncategorized": "未分组",
                        "taskName": "任务名称",
                        "noDateFields": "暂无可用日期字段",
                        "noDateFieldsDesc": "请先添加一个日期类型的字段来使用甘特图视图",
                        "settings": "甘特图视图设置",
                        "startDateField": "开始日期字段 *",
                        "endDateField": "结束日期字段",
                        "titleField": "标题字段",
                        "progressField": "进度字段",
                        "groupByField": "分组字段",
                        "scaleUnit": "时间刻度",
                        "day": "日",
                        "week": "周",
                        "month": "月",
                        "none": "无",
                        "selectField": "选择字段",
                        "selectOptional": "选择（可选）",
                        "tasksWithoutDate": "{{count}} 个任务未设置日期",
                        "showSettings": "设置",
                        "milestoneField": "里程碑字段",
                        "dependencyField": "依赖字段",
                        "criticalPath": "关键路径",
                        "customColors": "自定义颜色"
                    },
                    // Group panel
                    "groupPanel": {
                        "title": "分组",
                        "emptyHint": "添加字段对记录进行分组",
                        "empty": "(空)",
                        "yes": "是",
                        "no": "否"
                    },
                    // Calendar view
                    "calendarView": {
                        "today": "今天",
                        "month": "月",
                        "week": "周",
                        "day": "日",
                        "configure": "配置日历视图",
                        "configureDesc": "请选择一个日期字段来显示日历视图",
                        "noDateFields": "暂无可用日期字段",
                        "noDateFieldsDesc": "请先添加一个日期类型的字段来使用日历视图",
                        "dateField": "日期字段 *",
                        "settings": "日历视图设置",
                        "startDateField": "开始日期字段 *",
                        "endDateField": "结束日期字段",
                        "titleField": "标题字段",
                        "selectDateField": "选择日期字段",
                        "selectEndDateField": "选择结束日期字段（可选）",
                        "selectTitleField": "选择标题字段（可选）",
                        "auto": "自动",
                        "noneField": "无",
                        "year": "年",
                        "agenda": "日程"
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
                        "missingXField": "X轴字段已被删除，请重新配置图表。",
                        "missingYField": "某个Y轴字段已被删除，请重新配置图表。",
                        "dateAggregation": "时间粒度",
                        "dateNone": "不聚合",
                        "dateDay": "按天",
                        "dateWeek": "按周",
                        "dateMonth": "按月",
                        "dateQuarter": "按季度",
                        "dateYear": "按年",
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
                        "showTrendLine": "趋势线",
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
