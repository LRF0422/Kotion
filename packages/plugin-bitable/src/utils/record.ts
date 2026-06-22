import { FieldConfig, FieldType, Person, RecordData } from "../types";
import { generateRecordId } from "./id";

/**
 * Build a new record with sensible per-field default values and system
 * timestamps. Shared by the toolbar "add record" action and the Form view so
 * both produce identically-shaped records.
 *
 * @param fields - the table's field definitions
 * @param existingData - current records (used to compute the next auto/ID number)
 * @param currentUser - the logged-in user, used to seed created_by/updated_by fields
 */
export function createEmptyRecord(
    fields: FieldConfig[],
    existingData: RecordData[] = [],
    currentUser?: Person
): RecordData {
    const now = new Date().toISOString();
    const record: RecordData = {
        id: generateRecordId(),
        createdTime: now,
        updatedTime: now,
    };

    fields.forEach(field => {
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
            case FieldType.CREATED_BY:
            case FieldType.UPDATED_BY:
                record[field.id] = currentUser ?? null;
                break;
            case FieldType.ID: {
                const existingIds = existingData.map(r => Number(r[field.id]) || 0);
                record[field.id] = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
                break;
            }
            default:
                record[field.id] = null;
        }
    });

    return record;
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
    fields.forEach(field => {
        if (field.type === FieldType.UPDATED_BY) {
            patch[field.id] = currentUser;
        }
    });
    return patch;
}
