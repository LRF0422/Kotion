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
                        "add": "Add"
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
                        "confirmAdd": "Confirm Add"
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
                        "progressDisplay": "Progress Display"
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
                        "add": "添加"
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
                        "confirmAdd": "确认添加"
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
                        "progressDisplay": "进度显示"
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
                    }
                }
            }
        }
    }
});
