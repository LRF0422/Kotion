import { FieldType, ViewType, FieldConfig, ViewConfig, RecordData } from "../../types";
import { generateFieldId, generateViewId } from "../../utils/id";
import { DEFAULT_RECORD_NUMBER_FIELD_ID, getDefaultFields } from "../constants/defaults";
import { createRecords } from "../../utils/record";
import {
    CreatedOptionInfo,
    normalizeOptions,
    normalizeRecordValuesBatch,
} from "../../utils/selectValues";

/**
 * Pure field/data builders for the bitable AI tools.
 *
 * Kept free of editor dependencies so the whole "agent supplies fields +
 * initial data" path is unit-testable without a ProseMirror editor.
 * The ProseMirror-facing half lives in `tools/helpers.ts`, which re-exports
 * these builders.
 */

/** Build a title→id map from an array of field configs. */
export function buildTitleToIdMap(fields: FieldConfig[]): Record<string, string> {
    const map: Record<string, string> = {};
    fields.forEach((f) => { map[f.title] = f.id; });
    return map;
}

export interface RawFieldConfig {
    id?: string;
    title: string;
    type: string;
    width?: number;
    isShow?: boolean;
    options?: Array<{ id?: string; label: string; color?: string }>;
    description?: string;
}

/**
 * Build a `FieldConfig[]` from optional raw params. When `rawFields` is
 * empty/absent, the `DEFAULT_FIELD_CONFIGS` are used (plus the mandatory ID
 * field). Returns the fields and a title→id map.
 *
 * This replaces the ~80-line block that was duplicated verbatim between
 * `insertBitable` and `insertBitableAtPosition`.
 */
export function buildFieldsConfig(rawFields?: RawFieldConfig[]): {
    fields: FieldConfig[];
    titleToIdMap: Record<string, string>;
} {
    const fields: FieldConfig[] = [];
    const titleToIdMap: Record<string, string> = {};

    // Always add the ID field first
    fields.push({
        id: DEFAULT_RECORD_NUMBER_FIELD_ID,
        title: "ID",
        type: FieldType.ID,
        width: 80,
        isShow: true,
    });
    titleToIdMap["ID"] = DEFAULT_RECORD_NUMBER_FIELD_ID;

    if (rawFields && rawFields.length > 0) {
        const usedFieldIds = new Set(["id", DEFAULT_RECORD_NUMBER_FIELD_ID]);
        rawFields.forEach((fieldConfig) => {
            if (fieldConfig.type === FieldType.ID) {
                titleToIdMap[fieldConfig.title] = DEFAULT_RECORD_NUMBER_FIELD_ID;
                return;
            }

            let fieldId = fieldConfig.id || fieldConfig.title;
            while (usedFieldIds.has(fieldId)) {
                fieldId = generateFieldId();
            }
            usedFieldIds.add(fieldId);

            // Normalise ids/colours here: renderers, filters and grouping all
            // key off `option.id`, and an unrenderable colour makes the tag
            // disappear.
            const options = fieldConfig.options
                ? normalizeOptions(fieldConfig.options)
                : undefined;

            fields.push({
                id: fieldId,
                title: fieldConfig.title,
                type: fieldConfig.type as FieldType,
                width: fieldConfig.width || 150,
                isShow: fieldConfig.isShow !== false,
                ...(options && { options }),
                ...(fieldConfig.description && { description: fieldConfig.description }),
            });

            titleToIdMap[fieldConfig.title] = fieldId;
        });
    } else {
        // Use the canonical defaults from constants/defaults.ts (skip the ID
        // field which is already added above).
        getDefaultFields().slice(1).forEach((f) => {
            fields.push(f);
            titleToIdMap[f.title] = f.id;
        });
    }

    return { fields, titleToIdMap };
}

/** Build a default set of views (table + optional kanban) from the given fields. */
export function buildDefaultViews(fields: FieldConfig[]): ViewConfig[] {
    const selectField = fields.find((f) => f.type === FieldType.SELECT);
    return [
        {
            id: generateViewId(),
            name: "表格视图",
            type: ViewType.TABLE,
            filters: [], sorts: [], groups: [], hiddenFields: [], fieldOrder: [],
        },
        ...(selectField
            ? [{
                  id: generateViewId(),
                  name: "看板视图",
                  type: ViewType.KANBAN,
                  filters: [], sorts: [], groups: [], hiddenFields: [], fieldOrder: [],
                  kanbanConfig: { groupByField: selectField.id },
              }]
            : []),
    ];
}

/**
 * Transform initial data records: map field titles to field IDs, then resolve
 * select / multi-select labels onto option ids. Labels with no configured
 * option become new options (returned in `fields`) so the inserted rows are
 * never invisible.
 */
export function processInitialData(
    initialData: Array<Record<string, any>> | undefined,
    titleToIdMap: Record<string, string>,
    fields: FieldConfig[]
): { fields: FieldConfig[]; data: RecordData[]; createdOptions: CreatedOptionInfo[] } {
    const values = (initialData || []).map((record) => {
        const transformedRecord: Record<string, unknown> = {};
        Object.entries(record).forEach(([key, value]) => {
            const fieldId = titleToIdMap[key] || key;
            transformedRecord[fieldId] = value;
        });
        return transformedRecord;
    });

    const normalized = normalizeRecordValuesBatch(fields, values, { createMissingOptions: true });

    return {
        fields: normalized.fields,
        data: createRecords(normalized.fields, [], normalized.valuesList),
        createdOptions: normalized.createdOptions,
    };
}
