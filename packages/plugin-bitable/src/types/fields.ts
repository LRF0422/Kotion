/**
 * Field type definitions for Bitable.
 */
import { Person, Attachment } from "./records";

/** Field type enumeration — all supported field types. */
export enum FieldType {
    TEXT = 'text',
    NUMBER = 'number',
    SELECT = 'select',
    MULTI_SELECT = 'multi_select',
    DATE = 'date',
    CHECKBOX = 'checkbox',
    PERSON = 'person',
    ATTACHMENT = 'attachment',
    IMAGE = 'image',
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

/** Field types that are read-only / auto-computed. */
export const READONLY_FIELD_TYPES = new Set<FieldType>([
    FieldType.ID,
    FieldType.AUTO_NUMBER,
    FieldType.CREATED_TIME,
    FieldType.UPDATED_TIME,
    FieldType.CREATED_BY,
    FieldType.UPDATED_BY,
]);

/** Option configuration for single-select and multi-select fields. */
export interface SelectOption {
    id: string;
    label: string;
    color: string;
}

/** Summary aggregation mode for table summary row. */
export type SummaryMode = 'none' | 'count' | 'sum' | 'avg' | 'min' | 'max';

/** Field configuration — defines a column in the bitable. */
export interface FieldConfig {
    id: string;
    title: string;
    type: FieldType;
    width?: number;
    isShow?: boolean;
    frozen?: boolean;
    summary?: SummaryMode;
    options?: SelectOption[];
    formula?: string;
    relationTableId?: string;
    format?: string;
    description?: string;
}

/** Field value union — the possible value types a field can hold. */
export type FieldValue =
    | string
    | number
    | boolean
    | Date
    | null
    | undefined
    | string[]
    | SelectOption[]
    | Person[]
    | Attachment[]
    | { content?: unknown };

/** Check if a field type is read-only. */
export function isReadonlyField(type: FieldType): boolean {
    return READONLY_FIELD_TYPES.has(type);
}
