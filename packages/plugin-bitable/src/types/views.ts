/**
 * View configuration and interaction type definitions for Bitable.
 */
import { FieldType, FieldConfig } from "./fields";

/** View type enumeration — all supported view types. */
export enum ViewType {
    TABLE = 'table',
    KANBAN = 'kanban',
    GALLERY = 'gallery',
    CALENDAR = 'calendar',
    TIMELINE = 'timeline',
    FORM = 'form',
    CHART = 'chart',
}

/** Chart type enumeration. */
export enum ChartType {
    BAR = 'bar',
    LINE = 'line',
    PIE = 'pie',
    AREA = 'area',
    RADAR = 'radar',
    SCATTER = 'scatter',
    RADIAL_BAR = 'radial_bar',
    DONUT = 'donut',
    STACKED_BAR = 'stacked_bar',
    STACKED_AREA = 'stacked_area',
}

/** Filter operator enumeration. */
export enum FilterOperator {
    EQUALS = 'equals',
    NOT_EQUALS = 'not_equals',
    CONTAINS = 'contains',
    NOT_CONTAINS = 'not_contains',
    IS_EMPTY = 'is_empty',
    IS_NOT_EMPTY = 'is_not_empty',
    GREATER_THAN = 'greater_than',
    LESS_THAN = 'less_than',
    GREATER_THAN_OR_EQUAL = 'greater_than_or_equal',
    LESS_THAN_OR_EQUAL = 'less_than_or_equal',
    IS_ANY_OF = 'is_any_of',
    IS_NONE_OF = 'is_none_of',
}

/** Filter configuration. */
export interface FilterConfig {
    id: string;
    fieldId: string;
    operator: FilterOperator;
    value: any;
    conjunction?: 'and' | 'or';
}

/** Sort configuration. */
export interface SortConfig {
    id: string;
    fieldId: string;
    direction: 'asc' | 'desc';
}

/** Group configuration. */
export interface GroupConfig {
    fieldId: string;
    order?: 'asc' | 'desc';
}

/** Y-axis configuration for charts. */
export interface YAxisConfig {
    fieldId: string;
    color: string;
    label?: string;
    stackId?: string;
}

/** Kanban view specific configuration. */
export interface KanbanConfig {
    groupByField: string;
    cardCoverField?: string;
    displayFields?: string[];
    showEmptyColumns?: boolean;
}

/** Gallery view specific configuration. */
export interface GalleryConfig {
    coverField: string;
    fitType: 'cover' | 'contain';
    cardSize: 'small' | 'medium' | 'large';
    displayFields?: string[];
}

/** Calendar view specific configuration. */
export interface CalendarConfig {
    dateField: string;
    endDateField?: string;
    titleField?: string;
}

/** Timeline / Gantt view specific configuration. */
export interface TimelineConfig {
    startDateField: string;
    endDateField?: string;
    titleField?: string;
    progressField?: string;
    groupByField?: string;
    scaleUnit?: 'day' | 'week' | 'month';
    milestoneField?: string;
    dependencyField?: string;
    criticalPathEnabled?: boolean;
    customColorsEnabled?: boolean;
    colorField?: string;
}

/** Form view specific configuration. */
export interface FormConfig {
    title?: string;
    description?: string;
    submitLabel?: string;
    fieldIds?: string[];
}

/** Chart view specific configuration. */
export interface ChartConfig {
    chartType: ChartType;
    xAxisField: string;
    yAxisFields: YAxisConfig[];
    title?: string;
    description?: string;
    showLegend?: boolean;
    showGrid?: boolean;
    aggregation?: 'sum' | 'count' | 'avg' | 'min' | 'max';
    dateAggregation?: 'day' | 'week' | 'month' | 'quarter' | 'year';
    groupByField?: string;
    chartHeight?: number;
    isHorizontal?: boolean;
    showDataLabels?: boolean;
    showYAxis?: boolean;
    enableAnimation?: boolean;
    sortOrder?: 'asc' | 'desc' | 'none';
    topN?: number;
    innerRadius?: number;
    outerRadius?: number;
    colorScheme?: 'default' | 'warm' | 'cool' | 'monochrome';
    showTrendLine?: boolean;
    smoothLine?: boolean;
    yAxisConfig?: {
        label?: string;
        min?: number;
        max?: number;
        tickCount?: number;
        showAxisLine?: boolean;
        tickFormatter?: 'number' | 'percent' | 'currency' | 'compact';
    };
}

/** View configuration — defines a view in the bitable. */
export interface ViewConfig {
    id: string;
    name: string;
    type: ViewType;
    filters?: FilterConfig[];
    filterLogic?: 'and' | 'or';
    sorts?: SortConfig[];
    groups?: GroupConfig[];
    hiddenFields?: string[];
    fieldOrder?: string[];
    kanbanConfig?: KanbanConfig;
    galleryConfig?: GalleryConfig;
    calendarConfig?: CalendarConfig;
    timelineConfig?: TimelineConfig;
    formConfig?: FormConfig;
    chartConfig?: ChartConfig;
}

/* ---------------------------------------------------------------------------
 * Interaction types
 * ------------------------------------------------------------------------- */

/** Cell position in the table grid. */
export interface CellPosition {
    rowIndex: number;
    colIndex: number;
}

/** Selection range for Shift+click range selection. */
export interface SelectionRange {
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
}

/** Cell edit mode. */
export type EditMode = 'none' | 'editing' | 'editing-pending';

/** Bitable keyboard interaction configuration. */
export interface BitableInteractionConfig {
    enableKeyboardNavigation: boolean;
    enableTypeToEdit: boolean;
    enableRangeSelection: boolean;
}
