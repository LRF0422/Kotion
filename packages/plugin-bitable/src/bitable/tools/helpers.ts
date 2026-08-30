import { Editor } from "@kn/editor";
import { FieldType, ViewType, ChartType, FieldConfig, ViewConfig, BitableAttrs, RecordData } from "../../types";
import { generateFieldId, generateViewId } from "../../utils/id";
import { DEFAULT_RECORD_NUMBER_FIELD_ID, getDefaultFields } from "../constants/defaults";
import { createRecords } from "../../utils/record";

/**
 * Shared helpers for bitable AI tools.
 * Eliminates the massive duplication that existed between `insertBitable`
 * and `insertBitableAtPosition`, and centralises the title→id mapping logic.
 */

// ---------------------------------------------------------------------------
// ProseMirror node helpers
// ---------------------------------------------------------------------------

/** Find all bitable nodes in the document. */
export function findBitableNodes(editor: Editor) {
    const bitables: Array<{ pos: number; attrs: BitableAttrs; nodeSize: number }> = [];
    editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "bitable") {
            bitables.push({ pos, attrs: node.attrs as BitableAttrs, nodeSize: node.nodeSize });
        }
    });
    return bitables;
}

/** Find bitable node by 0-based index. */
export function findBitableByIndex(editor: Editor, index: number) {
    const bitables = findBitableNodes(editor);
    if (index < 0 || index >= bitables.length) return null;
    return bitables[index];
}

/** Update bitable attributes at a given document position. */
export function updateBitableAttrs(editor: Editor, pos: number, newAttrs: Partial<BitableAttrs>) {
    const { tr } = editor.state;
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== "bitable") return false;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...newAttrs });
    editor.view.dispatch(tr);
    return true;
}

// ---------------------------------------------------------------------------
// Field / data building helpers
// ---------------------------------------------------------------------------

/** Build a title→id map from an array of field configs. */
export function buildTitleToIdMap(fields: FieldConfig[]): Record<string, string> {
    const map: Record<string, string> = {};
    fields.forEach((f) => { map[f.title] = f.id; });
    return map;
}

interface RawFieldConfig {
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

            const options = fieldConfig.options?.map((opt, idx) => ({
                id: opt.id || String(idx + 1),
                label: opt.label,
                color: opt.color || "#gray",
            }));

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

/** Transform initial data records: map field titles to field IDs. */
export function processInitialData(
    initialData: Array<Record<string, any>> | undefined,
    titleToIdMap: Record<string, string>,
    fields: FieldConfig[]
): RecordData[] {
    const values = (initialData || []).map((record) => {
        const transformedRecord: Partial<RecordData> = {};
        Object.entries(record).forEach(([key, value]) => {
            const fieldId = titleToIdMap[key] || key;
            transformedRecord[fieldId] = value;
        });
        return transformedRecord;
    });
    return createRecords(fields, [], values);
}
