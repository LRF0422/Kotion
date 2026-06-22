import * as XLSX from "xlsx";
import { FieldConfig, FieldType, RecordData, ViewConfig, SelectOption, Person } from "../types";

/**
 * Export helpers for a Bitable view: turn the (already filtered/sorted)
 * records into a 2D matrix of display strings and download it as CSV or XLSX.
 *
 * Values are formatted to match what the table renders (select labels, number
 * format, person names, etc.) rather than dumping raw stored values.
 */

/** Resolve the ordered, visible fields for a view (respects fieldOrder + hiddenFields). */
export function getOrderedVisibleFields(
    fields: FieldConfig[],
    view?: ViewConfig
): FieldConfig[] {
    const hidden = new Set(view?.hiddenFields || []);
    const order = view?.fieldOrder;

    let ordered = fields;
    if (order && order.length) {
        const byId = new Map(fields.map(f => [f.id, f]));
        const seen = new Set<string>();
        ordered = [];
        // Fields listed in fieldOrder first, then any not covered by it.
        order.forEach(id => {
            const f = byId.get(id);
            if (f && !seen.has(id)) {
                ordered.push(f);
                seen.add(id);
            }
        });
        fields.forEach(f => {
            if (!seen.has(f.id)) ordered.push(f);
        });
    }

    return ordered.filter(f => !hidden.has(f.id));
}

/** Format a single cell value to a plain display string for export. */
export function formatFieldValue(field: FieldConfig, value: any): string {
    if (value == null || value === '') return '';

    const optionLabel = (v: any): string => {
        const opt = field.options?.find((o: SelectOption) => o.id === v || o.label === v);
        return opt ? opt.label : String(v);
    };

    switch (field.type) {
        case FieldType.NUMBER:
        case FieldType.PROGRESS: {
            if (typeof value !== 'number') return String(value);
            switch (field.format) {
                case 'currency': return `¥${value.toLocaleString()}`;
                case 'percent': return `${value}%`;
                case 'decimal': return value.toFixed(2);
                default: return value.toLocaleString();
            }
        }
        case FieldType.SELECT:
            return optionLabel(value);
        case FieldType.MULTI_SELECT:
            return Array.isArray(value) ? value.map(optionLabel).join(', ') : optionLabel(value);
        case FieldType.CHECKBOX:
            return value ? '✓' : '';
        case FieldType.DATE:
        case FieldType.CREATED_TIME:
        case FieldType.UPDATED_TIME: {
            const d = new Date(value);
            if (isNaN(d.getTime())) return String(value);
            // Local date-time without seconds; date-only when midnight.
            const hasTime = d.getHours() || d.getMinutes();
            return hasTime ? d.toLocaleString() : d.toLocaleDateString();
        }
        case FieldType.PERSON:
        case FieldType.CREATED_BY:
        case FieldType.UPDATED_BY: {
            const names = (Array.isArray(value) ? value : [value])
                .map((p: Person) => (p && typeof p === 'object' ? p.name : String(p)))
                .filter(Boolean);
            return names.join(', ');
        }
        case FieldType.ATTACHMENT:
        case FieldType.IMAGE: {
            const items = Array.isArray(value) ? value : [value];
            return items
                .map((it: any) => (it && typeof it === 'object' ? (it.name || it.url) : String(it)))
                .filter(Boolean)
                .join(', ');
        }
        default:
            return String(value);
    }
}

/** Build the export matrix: header row of field titles + one row per record. */
export function buildExportMatrix(
    fields: FieldConfig[],
    data: RecordData[],
    view?: ViewConfig
): string[][] {
    const cols = getOrderedVisibleFields(fields, view);
    const header = cols.map(f => f.title);
    const rows = data.map(record => cols.map(f => formatFieldValue(f, record[f.id])));
    return [header, ...rows];
}

/** Trigger a browser download for a Blob. */
function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

/** Escape a value for a CSV field. */
function escapeCsv(value: string): string {
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Export the given records as a CSV file. */
export function exportToCSV(
    fields: FieldConfig[],
    data: RecordData[],
    view?: ViewConfig,
    filename = 'bitable.csv'
): void {
    const matrix = buildExportMatrix(fields, data, view);
    const csv = matrix.map(row => row.map(escapeCsv).join(',')).join('\r\n');
    // UTF-8 BOM so Excel detects encoding (matters for CJK).
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, filename);
}

/** Export the given records as an .xlsx file. */
export function exportToExcel(
    fields: FieldConfig[],
    data: RecordData[],
    view?: ViewConfig,
    filename = 'bitable.xlsx'
): void {
    const matrix = buildExportMatrix(fields, data, view);
    const worksheet = XLSX.utils.aoa_to_sheet(matrix);
    const workbook = XLSX.utils.book_new();
    const sheetName = (view?.name || 'Sheet1').slice(0, 31); // Excel sheet name limit
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filename);
}
