import { FieldType, ViewType, ChartType, FieldConfig, ViewConfig } from "../../types";
import { generateFieldId, generateViewId } from "../../utils/id";

/**
 * Centralised default field and view configurations.
 *
 * Previously these were duplicated between `bitable-node.ts` (the canonical
 * source for the editor node) and `tools/helpers.ts` (used by AI tools).
 * Now both consumers import from this single source of truth.
 */

/** Default field set used when no custom fields are provided. */
export function getDefaultFields(customFields?: string[]): FieldConfig[] {
    const defaultFields: FieldConfig[] = [
        { id: "id", title: "ID", type: FieldType.ID, width: 80, isShow: true },
        { id: "name", title: "名称", type: FieldType.TEXT, width: 200, isShow: true },
        {
            id: "status", title: "状态", type: FieldType.SELECT, width: 150, isShow: true,
            options: [
                { id: "1", label: "未开始", color: "#6b7280" },
                { id: "2", label: "进行中", color: "#3b82f6" },
                { id: "3", label: "已完成", color: "#10b981" },
            ],
        },
        {
            id: "priority", title: "优先级", type: FieldType.SELECT, width: 120, isShow: true,
            options: [
                { id: "1", label: "低", color: "#10b981" },
                { id: "2", label: "中", color: "#f59e0b" },
                { id: "3", label: "高", color: "#ef4444" },
            ],
        },
        { id: "assignee", title: "负责人", type: FieldType.PERSON, width: 150, isShow: true },
        { id: "dueDate", title: "截止日期", type: FieldType.DATE, width: 150, isShow: true },
        { id: "progress", title: "进度", type: FieldType.PROGRESS, width: 150, isShow: true },
    ];

    if (customFields && customFields.length > 0) {
        customFields.forEach((fieldName) => {
            defaultFields.push({
                id: generateFieldId(),
                title: fieldName,
                type: FieldType.TEXT,
                width: 150,
                isShow: true,
            });
        });
    }

    return defaultFields;
}

/** Default view set (table, kanban, gallery, timeline, chart). */
export function getDefaultViews(): ViewConfig[] {
    return [
        {
            id: generateViewId(),
            name: "表格视图",
            type: ViewType.TABLE,
            filters: [], sorts: [], groups: [], hiddenFields: [], fieldOrder: [],
        },
        {
            id: generateViewId(),
            name: "看板视图",
            type: ViewType.KANBAN,
            filters: [], sorts: [], groups: [], hiddenFields: [], fieldOrder: [],
            kanbanConfig: { groupByField: "status" },
        },
        {
            id: generateViewId(),
            name: "画廊视图",
            type: ViewType.GALLERY,
            filters: [], sorts: [], groups: [], hiddenFields: [], fieldOrder: [],
            galleryConfig: { coverField: "", fitType: "cover", cardSize: "medium" },
        },
        {
            id: generateViewId(),
            name: "甘特图视图",
            type: ViewType.TIMELINE,
            filters: [], sorts: [], groups: [], hiddenFields: [], fieldOrder: [],
            timelineConfig: {
                startDateField: "dueDate",
                endDateField: undefined,
                titleField: "name",
                progressField: "progress",
                groupByField: "status",
                scaleUnit: "day",
            },
        },
        {
            id: generateViewId(),
            name: "图表视图",
            type: ViewType.CHART,
            filters: [], sorts: [], groups: [], hiddenFields: [], fieldOrder: [],
            chartConfig: {
                chartType: ChartType.BAR,
                xAxisField: "status",
                yAxisFields: [],
                title: "",
                description: "",
                showLegend: true,
                showGrid: true,
                aggregation: "count",
            },
        },
    ];
}
