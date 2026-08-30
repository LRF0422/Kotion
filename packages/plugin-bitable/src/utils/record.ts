import { FieldConfig, FieldType, Person, RecordData, isReadonlyField } from "../types";
import { generateRecordId } from "./id";
import { STRUCTURAL_RECORD_ID_FIELD_ID } from "./recordIdentity";

const STRUCTURAL_SYSTEM_KEYS = new Set([
    STRUCTURAL_RECORD_ID_FIELD_ID,
    "createdTime",
    "updatedTime",
    "createdBy",
    "updatedBy",
]);

function nextAutoNumber(fieldId: string, existingData: RecordData[]): number {
    const maxValue = existingData.reduce((max, record) => {
        const value = Number(record[fieldId]);
        return Number.isSafeInteger(value) && value > 0 ? Math.max(max, value) : max;
    }, 0);
    return maxValue + 1;
}

/** Remove structural and read-only values supplied by a caller. */
export function sanitizeRecordValues(
    fields: FieldConfig[],
    values: Partial<RecordData>
): Partial<RecordData> {
    const readonlyFieldIds = new Set(
        fields.filter((field) => isReadonlyField(field.type)).map((field) => field.id)
    );
    const sanitized: Partial<RecordData> = {};

    Object.entries(values).forEach(([key, value]) => {
        if (STRUCTURAL_SYSTEM_KEYS.has(key) || readonlyFieldIds.has(key)) return;
        sanitized[key] = value;
    });
    return sanitized;
}

/**
 * Build a record with one immutable UUID identity and independently allocated
 * read-only display/system field values.
 */
export function createRecord(
    fields: FieldConfig[],
    existingData: RecordData[] = [],
    values: Partial<RecordData> = {},
    currentUser?: Person
): RecordData {
    const now = new Date().toISOString();
    const record: RecordData = {
        id: generateRecordId(),
        createdTime: now,
        updatedTime: now,
    };

    fields.forEach((field) => {
        // `record.id` is structural. Legacy tables are migrated before actions
        // run, so no field may write through this key.
        if (field.id === STRUCTURAL_RECORD_ID_FIELD_ID) return;

        switch (field.type) {
            case FieldType.CHECKBOX:
                record[field.id] = false;
                break;
            case FieldType.PROGRESS:
            case FieldType.NUMBER:
            case FieldType.RATING:
                record[field.id] = 0;
                break;
            case FieldType.MULTI_SELECT:
                record[field.id] = [];
                break;
            case FieldType.TEXT:
            case FieldType.LONG_TEXT:
                record[field.id] = "";
                break;
            case FieldType.CREATED_TIME:
            case FieldType.UPDATED_TIME:
                record[field.id] = now;
                break;
            case FieldType.CREATED_BY:
            case FieldType.UPDATED_BY:
                record[field.id] = currentUser ?? null;
                break;
            case FieldType.ID:
            case FieldType.AUTO_NUMBER:
                record[field.id] = nextAutoNumber(field.id, existingData);
                break;
            default:
                record[field.id] = null;
        }
    });

    return { ...record, ...sanitizeRecordValues(fields, values) };
}

/** Build multiple records while allocating every display number uniquely. */
export function createRecords(
    fields: FieldConfig[],
    existingData: RecordData[],
    valuesList: Array<Partial<RecordData>>,
    currentUser?: Person
): RecordData[] {
    const accumulated = [...existingData];
    return valuesList.map((values) => {
        const record = createRecord(fields, accumulated, values, currentUser);
        accumulated.push(record);
        return record;
    });
}

/** Build a blank record for toolbar/Form callers. */
export function createEmptyRecord(
    fields: FieldConfig[],
    existingData: RecordData[] = [],
    currentUser?: Person
): RecordData {
    return createRecord(fields, existingData, {}, currentUser);
}

/**
 * Compute the field-value patch that refreshes every `updated_by` field to the
 * current user. Returned object is keyed by field id; empty when there are no
 * such fields or no current user.
 */
export function updatedByPatch(
    fields: FieldConfig[],
    currentUser?: Person
): Record<string, Person> {
    const patch: Record<string, Person> = {};
    if (!currentUser) return patch;
    fields.forEach((field) => {
        if (field.type === FieldType.UPDATED_BY) {
            patch[field.id] = currentUser;
        }
    });
    return patch;
}
