import { FieldConfig, FieldType, RecordData } from "../types";

/**
 * Computes the fill value for a target cell based on the source value and field type.
 * Supports:
 * - Number/Rating/Progress: copies the source value
 * - Date: copies the source value
 * - Text: copies, or increments trailing numbers (e.g., "Item 1" → "Item 2")
 * - Other types: copies the source value
 *
 * Note: Progression/interval detection is not applicable because react-data-grid's
 * onFill only provides a single source row (no multi-cell pattern source like Excel).
 */
export function computeFillValue(
    field: FieldConfig,
    sourceValue: any,
    sourceIdx: number,
    targetIdx: number,
    data: RecordData[]
): any {
    // If source and target are the same, just return source value
    if (sourceIdx === targetIdx) return sourceValue;

    // If source value is null/undefined, nothing to fill
    if (sourceValue == null) return sourceValue;

    const step = targetIdx - sourceIdx;
    const absStep = Math.abs(step);
    const direction = step > 0 ? 1 : -1;

    switch (field.type) {
        case FieldType.NUMBER:
        case FieldType.RATING:
        case FieldType.PROGRESS:
            return fillNumeric(sourceValue);

        case FieldType.DATE:
            return fillDate(sourceValue);

        case FieldType.TEXT:
            return fillText(sourceValue, absStep, direction);

        case FieldType.CHECKBOX:
            return sourceValue;

        case FieldType.SELECT:
        case FieldType.MULTI_SELECT:
        case FieldType.URL:
        case FieldType.EMAIL:
        case FieldType.PHONE:
        case FieldType.IMAGE:
        case FieldType.ATTACHMENT:
        case FieldType.ID:
        case FieldType.AUTO_NUMBER:
            return sourceValue;

        default:
            return sourceValue;
    }
}

/**
 * Fill numeric values. Simply copies the source value.
 * Progression detection is not applicable because react-data-grid's onFill
 * only provides a single source row (no multi-cell pattern source like Excel).
 */
function fillNumeric(
    sourceValue: any
): number | null {
    const sourceNum = typeof sourceValue === 'number' ? sourceValue : Number(sourceValue);
    if (isNaN(sourceNum)) return sourceValue;

    return sourceNum;
}

/**
 * Fill date values. Simply copies the source value.
 * Interval detection is not applicable because react-data-grid's onFill
 * only provides a single source row.
 */
function fillDate(
    sourceValue: any
): string | null {
    return sourceValue;
}

/**
 * Fill text values. If the text ends with a number pattern (e.g., "Item 1", "Day 42"),
 * increments the number; otherwise copies the text.
 */
function fillText(
    sourceValue: any,
    absStep: number,
    direction: number
): string {
    const sourceStr = String(sourceValue ?? '');

    // Try to detect trailing number pattern
    // Matches text ending with a number, optionally with leading zeros
    const match = sourceStr.match(/^(.*?)(\d+)$/);
    if (match) {
        const prefix = match[1]!;
        const numStr = match[2]!;
        const num = parseInt(numStr, 10);
        const newNum = num + direction * absStep;
        // Preserve leading zeros
        const newNumStr = String(newNum).padStart(numStr.length, '0');
        // Handle negative numbers by removing extra leading zero
        return newNum < 0 ? prefix + String(newNum) : prefix + newNumStr;
    }

    return sourceStr;
}

/**
 * React DataGrid onFill callback.
 * Returns the updated target row with the filled cell value.
 */
export function createFillHandler(
    fields: FieldConfig[],
    data: RecordData[]
): (event: { columnKey: string; sourceRow: RecordData; targetRow: RecordData }) => RecordData {
    return (event) => {
        const { columnKey, sourceRow, targetRow } = event;
        const field = fields.find(f => f.id === columnKey);
        if (!field) return targetRow;

        const sourceIdx = data.findIndex(r => r.id === sourceRow.id);
        const targetIdx = data.findIndex(r => r.id === targetRow.id);

        if (sourceIdx === -1 || targetIdx === -1) return targetRow;

        const sourceValue = sourceRow[columnKey];
        const filledValue = computeFillValue(field, sourceValue, sourceIdx, targetIdx, data);

        return { ...targetRow, [columnKey]: filledValue };
    };
}
