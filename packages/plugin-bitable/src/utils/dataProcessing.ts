import { RecordData, FieldConfig, FilterConfig, SortConfig, FilterOperator } from '../types';

/**
 * Apply filters to data
 */
export function applyFilters(
    data: RecordData[],
    filters: FilterConfig[],
    fields: FieldConfig[]
): RecordData[] {
    if (!filters || filters.length === 0) return data;

    return data.filter(record => {
        return filters.every(filter => {
            const field = fields.find(f => f.id === filter.fieldId);
            if (!field) return true;

            const value = record[filter.fieldId];
            return evaluateFilter(value, filter.operator, filter.value);
        });
    });
}

function evaluateFilter(value: any, operator: FilterOperator, filterValue: any): boolean {
    const strValue = value != null ? String(value).toLowerCase() : '';
    const strFilterValue = filterValue != null ? String(filterValue).toLowerCase() : '';

    switch (operator) {
        case FilterOperator.EQUALS:
            return strValue === strFilterValue;
        case FilterOperator.NOT_EQUALS:
            return strValue !== strFilterValue;
        case FilterOperator.CONTAINS:
            return strValue.includes(strFilterValue);
        case FilterOperator.NOT_CONTAINS:
            return !strValue.includes(strFilterValue);
        case FilterOperator.IS_EMPTY:
            return value == null || value === '' || (Array.isArray(value) && value.length === 0);
        case FilterOperator.IS_NOT_EMPTY:
            return value != null && value !== '' && !(Array.isArray(value) && value.length === 0);
        case FilterOperator.GREATER_THAN:
            return Number(value) > Number(filterValue);
        case FilterOperator.LESS_THAN:
            return Number(value) < Number(filterValue);
        case FilterOperator.GREATER_THAN_OR_EQUAL:
            return Number(value) >= Number(filterValue);
        case FilterOperator.LESS_THAN_OR_EQUAL:
            return Number(value) <= Number(filterValue);
        case FilterOperator.IS_ANY_OF:
            if (Array.isArray(filterValue)) {
                return filterValue.some(fv => String(fv).toLowerCase() === strValue);
            }
            return false;
        case FilterOperator.IS_NONE_OF:
            if (Array.isArray(filterValue)) {
                return !filterValue.some(fv => String(fv).toLowerCase() === strValue);
            }
            return true;
        default:
            return true;
    }
}

/**
 * Apply sorts to data
 */
export function applySorts(
    data: RecordData[],
    sorts: SortConfig[],
    fields: FieldConfig[]
): RecordData[] {
    if (!sorts || sorts.length === 0) return data;

    return [...data].sort((a, b) => {
        for (const sort of sorts) {
            const field = fields.find(f => f.id === sort.fieldId);
            if (!field) continue;

            const aVal = a[sort.fieldId];
            const bVal = b[sort.fieldId];
            const multiplier = sort.direction === 'asc' ? 1 : -1;

            // Handle null/undefined
            if (aVal == null && bVal == null) continue;
            if (aVal == null) return 1 * multiplier;
            if (bVal == null) return -1 * multiplier;

            // Compare based on type
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                if (aVal !== bVal) return (aVal - bVal) * multiplier;
            } else if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
                if (aVal !== bVal) return (aVal ? 1 : -1) * multiplier;
            } else {
                const cmp = String(aVal).localeCompare(String(bVal));
                if (cmp !== 0) return cmp * multiplier;
            }
        }
        return 0;
    });
}
