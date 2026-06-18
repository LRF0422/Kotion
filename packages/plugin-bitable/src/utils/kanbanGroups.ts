import { FieldConfig, FieldType, RecordData, SelectOption } from "../types";

export const KANBAN_UNASSIGNED = "__unassigned__";

export interface KanbanColumn {
    key: string;
    label: string;
    color?: string;
    records: RecordData[];
}

/** Field types that can be used to group a kanban board. */
export function isKanbanGroupable(type: FieldType): boolean {
    return (
        type === FieldType.SELECT ||
        type === FieldType.CHECKBOX ||
        type === FieldType.TEXT ||
        type === FieldType.NUMBER ||
        type === FieldType.DATE ||
        type === FieldType.RATING
    );
}

/** Stable sort by manual `order` (when set) then creation time, for cards within a column. */
function sortRecords(records: RecordData[]): RecordData[] {
    return [...records].sort((a, b) => {
        const ao = typeof a.order === "number" ? a.order : Number.POSITIVE_INFINITY;
        const bo = typeof b.order === "number" ? b.order : Number.POSITIVE_INFINITY;
        if (ao !== bo) return ao - bo;
        return String(a.createdTime || "").localeCompare(String(b.createdTime || ""));
    });
}

/**
 * Build ordered kanban columns for any groupable field type — not just `select`.
 * The column `key` round-trips through `valueForColumnKey` so dropping a card
 * onto a column can write the right value back to the record.
 */
export function buildKanbanColumns(
    field: FieldConfig,
    data: RecordData[],
    labels: { uncategorized: string; yes: string; no: string },
    showEmptyColumns = true,
): KanbanColumn[] {
    const columns: KanbanColumn[] = [];
    const byKey = new Map<string, KanbanColumn>();

    const ensure = (key: string, label: string, color?: string): KanbanColumn => {
        let col = byKey.get(key);
        if (!col) {
            col = { key, label, color, records: [] };
            byKey.set(key, col);
            columns.push(col);
        }
        return col;
    };

    const optionById = new Map<string, SelectOption>();
    (field.options || []).forEach(o => optionById.set(o.id, o));

    // Pre-seed columns that have a known, fixed domain so empty ones still show.
    if (field.type === FieldType.SELECT) {
        (field.options || []).forEach(o => ensure(o.id, o.label, o.color));
    } else if (field.type === FieldType.CHECKBOX) {
        ensure("true", labels.yes, "green");
        ensure("false", labels.no, "gray");
    }

    const keyForRecord = (value: any): { key: string; label: string; color?: string } => {
        if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
            return { key: KANBAN_UNASSIGNED, label: labels.uncategorized, color: "gray" };
        }
        switch (field.type) {
            case FieldType.SELECT: {
                const opt = optionById.get(value);
                return { key: String(value), label: opt?.label ?? String(value), color: opt?.color };
            }
            case FieldType.CHECKBOX:
                return value ? { key: "true", label: labels.yes, color: "green" } : { key: "false", label: labels.no, color: "gray" };
            case FieldType.DATE: {
                const day = typeof value === "string" ? value.slice(0, 10) : new Date(value).toISOString().slice(0, 10);
                return { key: day, label: day };
            }
            default:
                return { key: String(value), label: String(value) };
        }
    };

    data.forEach(record => {
        const { key, label, color } = keyForRecord(record[field.id]);
        ensure(key, label, color).records.push(record);
    });

    // Always keep an "unassigned" column at the end when it has cards.
    const unassigned = byKey.get(KANBAN_UNASSIGNED);
    if (unassigned) {
        const idx = columns.indexOf(unassigned);
        if (idx !== -1) columns.splice(idx, 1);
    }

    let result = columns;
    if (!showEmptyColumns) {
        result = result.filter(c => c.records.length > 0);
    }
    result.forEach(c => (c.records = sortRecords(c.records)));

    if (unassigned && unassigned.records.length > 0) {
        unassigned.records = sortRecords(unassigned.records);
        result = [...result, unassigned];
    }

    return result;
}

/** Convert a column key back into the value to write onto a dropped record. */
export function valueForColumnKey(field: FieldConfig, key: string): any {
    if (key === KANBAN_UNASSIGNED) return null;
    switch (field.type) {
        case FieldType.CHECKBOX:
            return key === "true";
        case FieldType.NUMBER:
        case FieldType.RATING:
            return Number(key);
        default:
            // select id, text value, or date day string
            return key;
    }
}
