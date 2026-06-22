import { RecordData, FieldConfig, FilterConfig, SortConfig, GroupConfig, FilterOperator } from '../types';

/**
 * Apply filters to data
 */
export function applyFilters(
    data: RecordData[],
    filters: FilterConfig[],
    fields: FieldConfig[],
    logic: 'and' | 'or' = 'and'
): RecordData[] {
    if (!filters || filters.length === 0) return data;

    // Resolve each filter's field once instead of scanning `fields` for every
    // (record × filter). Filters whose field no longer exists are dropped, which
    // matches the previous "field not found → ignore filter" behaviour.
    const fieldIds = new Set(fields.map(f => f.id));
    const activeFilters = filters.filter(filter => fieldIds.has(filter.fieldId));
    if (activeFilters.length === 0) return data;

    // `and` → every filter must match; `or` → any filter matching keeps the record.
    const matches = (record: RecordData, filter: FilterConfig) =>
        evaluateFilter(record[filter.fieldId], filter.operator, filter.value);

    return data.filter(record =>
        logic === 'or'
            ? activeFilters.some(filter => matches(record, filter))
            : activeFilters.every(filter => matches(record, filter))
    );
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
 * Apply groups to data, returning grouped data as a Map
 * Key is the group label, value is the array of records in that group
 */
export function applyGroups(
    data: RecordData[],
    groups: GroupConfig[],
    fields: FieldConfig[]
): Map<string, RecordData[]> {
    if (!groups || groups.length === 0) return new Map();

    const result = new Map<string, RecordData[]>();

    // Only support single-level grouping for now
    const group = groups[0];
    if (!group) return result;

    const field = fields.find(f => f.id === group.fieldId);
    if (!field) return result;

    // Group records by field value
    const groupMap = new Map<string, RecordData[]>();
    const groupOrder: string[] = [];

    // Pre-build an option lookup (id → option and label → option) once, so each
    // record does an O(1) map lookup instead of scanning `field.options`.
    // Insert in array order and keep the first occurrence so collisions resolve
    // the same way Array.prototype.find did.
    const optionMap = new Map<unknown, { id: string; label: string }>();
    if (field.options) {
        field.options.forEach(option => {
            if (!optionMap.has(option.id)) optionMap.set(option.id, option);
            if (!optionMap.has(option.label)) optionMap.set(option.label, option);
        });
    }

    // For select/multi_select fields, pre-populate groups from options
    if (field.type === 'select' && field.options) {
        field.options.forEach(option => {
            const key = option.label;
            groupMap.set(key, []);
            groupOrder.push(key);
        });
    }

    // Distribute records into groups
    data.forEach(record => {
        let value = record[group.fieldId];

        // Determine group key
        let key: string;
        if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
            key = '';
        } else if (field.type === 'select' && field.options) {
            // Match select value to option label
            const option = optionMap.get(value);
            key = option ? option.label : String(value);
        } else if (field.type === 'multi_select' && Array.isArray(value)) {
            // Multi-select: use first value as group key
            if (value.length > 0) {
                const firstVal = value[0];
                const option = optionMap.get(firstVal);
                key = option ? option.label : String(firstVal);
            } else {
                key = '';
            }
        } else if (field.type === 'checkbox') {
            key = value ? 'true' : 'false';
        } else {
            key = String(value);
        }

        if (!groupMap.has(key)) {
            groupMap.set(key, []);
            groupOrder.push(key);
        }
        groupMap.get(key)!.push(record);
    });

    // Sort groups if order is specified
    if (group.order === 'desc') {
        groupOrder.reverse();
    }

    // Build result map in order
    groupOrder.forEach(key => {
        const records = groupMap.get(key);
        if (records && records.length > 0) {
            result.set(key, records);
        }
    });

    // Handle empty group (empty key goes last)
    const emptyRecords = groupMap.get('');
    if (emptyRecords && emptyRecords.length > 0 && !result.has('')) {
        result.set('', emptyRecords);
    }

    return result;
}

/**
 * Get a human-readable label for a group key
 */
export function getGroupLabel(
    key: string,
    field: FieldConfig | undefined
): string {
    if (!field) return key || '(empty)';

    if (key === '') {
        return '(empty)';
    }

    if (field.type === 'checkbox') {
        return key === 'true' ? 'Yes' : 'No';
    }

    return key;
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

    // Resolve valid sort fields once instead of scanning `fields` inside the
    // comparator (which runs O(n log n) times). Sorts whose field no longer
    // exists are dropped, matching the previous "field not found → skip" branch.
    const fieldIds = new Set(fields.map(f => f.id));
    const activeSorts = sorts.filter(sort => fieldIds.has(sort.fieldId));
    if (activeSorts.length === 0) return data;

    return [...data].sort((a, b) => {
        for (const sort of activeSorts) {
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
