import { ReactElement } from 'react';

// 字段类型枚举
export enum FieldType {
    TEXT = 'text',
    NUMBER = 'number',
    SELECT = 'select',
    MULTI_SELECT = 'multi_select',
    DATE = 'date',
    CHECKBOX = 'checkbox',
    PERSON = 'person',
    ATTACHMENT = 'attachment',
    URL = 'url',
    EMAIL = 'email',
    PHONE = 'phone',
    RATING = 'rating',
    PROGRESS = 'progress',
    FORMULA = 'formula',
    RELATION = 'relation',
    CREATED_TIME = 'created_time',
    UPDATED_TIME = 'updated_time',
    CREATED_BY = 'created_by',
    UPDATED_BY = 'updated_by',
    AUTO_NUMBER = 'auto_number',
    ID = 'id',
}

// 视图类型枚举
export enum ViewType {
    TABLE = 'table',
    KANBAN = 'kanban',
    GALLERY = 'gallery',
    CALENDAR = 'calendar',
    TIMELINE = 'timeline',
    FORM = 'form',
}

// 字段配置
export interface FieldConfig {
    id: string;
    title: string;
    type: FieldType;
    width?: number;
    isShow?: boolean;
    options?: SelectOption[] | any;
    formula?: string;
    relationTableId?: string;
    format?: string;
    description?: string;
}

// 选项配置（用于单选和多选字段）
export interface SelectOption {
    id: string;
    label: string;
    color: string;
}

// 人员信息
export interface Person {
    id: string;
    name: string;
    avatar?: string;
    email?: string;
}

// 附件信息
export interface Attachment {
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
    uploadTime: string;
}

// 视图配置
export interface ViewConfig {
    id: string;
    name: string;
    type: ViewType;
    filters?: FilterConfig[];
    sorts?: SortConfig[];
    groups?: GroupConfig[];
    hiddenFields?: string[];
    fieldOrder?: string[];
    // 看板视图特有配置
    kanbanConfig?: {
        groupByField: string;
        cardCoverField?: string;
    };
    // 画廊视图特有配置
    galleryConfig?: {
        coverField: string;
        fitType: 'cover' | 'contain';
        cardSize: 'small' | 'medium' | 'large';
    };
    // 日历视图特有配置
    calendarConfig?: {
        dateField: string;
        endDateField?: string;
        titleField?: string;
    };
    // 时间线/甘特图视图特有配置
    timelineConfig?: {
        startDateField: string;
        endDateField?: string;
        titleField?: string;
        progressField?: string;
        groupByField?: string;
        scaleUnit?: 'day' | 'week' | 'month';
    };
}

// 筛选配置
export interface FilterConfig {
    id: string;
    fieldId: string;
    operator: FilterOperator;
    value: any;
    conjunction?: 'and' | 'or';
}

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

// 排序配置
export interface SortConfig {
    id: string;
    fieldId: string;
    direction: 'asc' | 'desc';
}

// 分组配置
export interface GroupConfig {
    fieldId: string;
    order?: 'asc' | 'desc';
}

// 记录数据
export interface RecordData {
    id: string;
    [key: string]: any;
    createdTime?: string;
    updatedTime?: string;
    createdBy?: Person;
    updatedBy?: Person;
}

// Bitable节点属性
export interface BitableAttrs {
    fields: FieldConfig[];
    views: ViewConfig[];
    currentView: string;
    records?: RecordData[];
}
