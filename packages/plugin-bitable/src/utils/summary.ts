import { FieldConfig, FieldType, RecordData } from "../types";

export type SummaryMode = NonNullable<FieldConfig['summary']>;

const NUMERIC_TYPES = new Set<FieldType>([FieldType.NUMBER, FieldType.PROGRESS, FieldType.RATING]);

export function isNumericField(type: FieldType): boolean {
    return NUMERIC_TYPES.has(type);
}

/** Available summary modes for a field type (numeric fields get the math aggregates). */
export function summaryModesFor(type: FieldType): SummaryMode[] {
    return isNumericField(type)
        ? ['none', 'sum', 'avg', 'count', 'min', 'max']
        : ['none', 'count'];
}

export function nextSummaryMode(current: SummaryMode | undefined, type: FieldType): SummaryMode {
    const modes = summaryModesFor(type);
    const idx = modes.indexOf(current || 'none');
    return modes[(idx + 1) % modes.length]!;
}

/** Compute the summary value for a column; returns a display string (already rounded). */
export function computeSummary(mode: SummaryMode, field: FieldConfig, rows: RecordData[]): string {
    if (mode === 'none') return '';

    if (mode === 'count') {
        const n = rows.reduce((acc, r) => {
            const v = r[field.id];
            const empty = v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
            return acc + (empty ? 0 : 1);
        }, 0);
        return String(n);
    }

    // numeric aggregates
    const nums = rows
        .map(r => Number(r[field.id]))
        .filter(n => !Number.isNaN(n));
    if (nums.length === 0) return '0';

    let value: number;
    switch (mode) {
        case 'sum': value = nums.reduce((a, b) => a + b, 0); break;
        case 'avg': value = nums.reduce((a, b) => a + b, 0) / nums.length; break;
        case 'min': value = Math.min(...nums); break;
        case 'max': value = Math.max(...nums); break;
        default: return '';
    }
    return String(Math.round(value * 100) / 100);
}

/** Short prefix label shown before the value in the summary cell. */
export function summaryPrefix(mode: SummaryMode): string {
    switch (mode) {
        case 'sum': return 'Σ';
        case 'avg': return 'x̄';
        case 'count': return '#';
        case 'min': return '↓';
        case 'max': return '↑';
        default: return '';
    }
}
