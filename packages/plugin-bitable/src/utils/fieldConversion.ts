import { FieldType, FieldConfig, SelectOption, RecordData } from '../types';
import { generateOptionId } from './id';

/**
 * Convert a value from one field type to another
 * @param value The original value
 * @param fromType The original field type
 * @param toType The target field type
 * @param fieldConfig Optional field configuration (needed for select fields)
 * @returns The converted value
 */
export function convertFieldValue(
    value: any,
    fromType: FieldType,
    toType: FieldType,
    fieldConfig?: FieldConfig
): any {
    // Handle null/undefined
    if (value === null || value === undefined) {
        return getDefaultValueForType(toType);
    }

    // Same type, no conversion needed
    if (fromType === toType) {
        return value;
    }

    // Convert based on target type
    switch (toType) {
        case FieldType.TEXT:
            return convertToText(value, fromType);

        case FieldType.NUMBER:
            return convertToNumber(value, fromType);

        case FieldType.DATE:
            return convertToDate(value, fromType);

        case FieldType.CHECKBOX:
            return convertToCheckbox(value, fromType);

        case FieldType.SELECT:
            return convertToSelect(value, fromType, fieldConfig);

        case FieldType.MULTI_SELECT:
            return convertToMultiSelect(value, fromType, fieldConfig);

        case FieldType.RATING:
            return convertToRating(value, fromType, fieldConfig);

        case FieldType.PROGRESS:
            return convertToProgress(value, fromType);

        case FieldType.URL:
        case FieldType.EMAIL:
        case FieldType.PHONE:
            return convertToText(value, fromType);

        default:
            return value;
    }
}

/**
 * Convert value to text
 */
function convertToText(value: any, fromType: FieldType): string {
    if (Array.isArray(value)) {
        // For multi-select, join labels
        return value.map((v: any) => v?.label || String(v)).join(', ');
    }

    if (typeof value === 'object' && value !== null) {
        // For select options or objects
        if ('label' in value) {
            return value.label;
        }
        return JSON.stringify(value);
    }

    if (fromType === FieldType.CHECKBOX) {
        return value ? 'Yes' : 'No';
    }

    if (fromType === FieldType.DATE) {
        return value ? new Date(value).toLocaleDateString() : '';
    }

    return String(value);
}

/**
 * Convert value to number
 */
function convertToNumber(value: any, fromType: FieldType): number {
    if (fromType === FieldType.CHECKBOX) {
        return value ? 1 : 0;
    }

    if (fromType === FieldType.TEXT) {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? 0 : parsed;
    }

    if (fromType === FieldType.RATING || fromType === FieldType.PROGRESS) {
        return Number(value) || 0;
    }

    if (fromType === FieldType.DATE) {
        return value ? new Date(value).getTime() : 0;
    }

    const num = Number(value);
    return isNaN(num) ? 0 : num;
}

/**
 * Convert value to date
 */
function convertToDate(value: any, fromType: FieldType): string | null {
    if (fromType === FieldType.TEXT) {
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date.toISOString();
    }

    if (fromType === FieldType.NUMBER) {
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date.toISOString();
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (typeof value === 'string') {
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date.toISOString();
    }

    return null;
}

/**
 * Convert value to checkbox
 */
function convertToCheckbox(value: any, fromType: FieldType): boolean {
    if (fromType === FieldType.NUMBER || fromType === FieldType.RATING || fromType === FieldType.PROGRESS) {
        return Number(value) > 0;
    }

    if (fromType === FieldType.TEXT) {
        const lowerValue = String(value).toLowerCase().trim();
        return ['true', 'yes', '1', 'checked', 'on', '是', '对', '真'].includes(lowerValue);
    }

    return Boolean(value);
}

/**
 * Convert value to select
 */
function convertToSelect(value: any, fromType: FieldType, fieldConfig?: FieldConfig): string | null {
    // If it's already a select option ID, keep it
    if (typeof value === 'string' && fieldConfig?.options) {
        const options = fieldConfig.options as SelectOption[];
        if (options.some(opt => opt.id === value)) {
            return value;
        }
    }

    // Convert value to string and try to match with options
    const strValue = convertToText(value, fromType);

    if (fieldConfig?.options) {
        const options = fieldConfig.options as SelectOption[];
        // Try to find matching option by label
        const matchingOption = options.find(opt =>
            opt.label.toLowerCase() === strValue.toLowerCase()
        );

        if (matchingOption) {
            return matchingOption.id;
        }
    }

    return null;
}

/**
 * Convert value to multi-select
 */
function convertToMultiSelect(value: any, fromType: FieldType, fieldConfig?: FieldConfig): string[] {
    if (Array.isArray(value)) {
        // If already an array of option IDs
        if (fieldConfig?.options) {
            const options = fieldConfig.options as SelectOption[];
            const validIds = value.filter(v =>
                typeof v === 'string' && options.some(opt => opt.id === v)
            );
            if (validIds.length > 0) {
                return validIds;
            }
        }

        // Convert array elements to option IDs
        return value
            .map(v => convertToSelect(v, fromType, fieldConfig))
            .filter(Boolean) as string[];
    }

    // Single value - convert to select first
    const singleOption = convertToSelect(value, fromType, fieldConfig);
    return singleOption ? [singleOption] : [];
}

/**
 * Convert value to rating
 */
function convertToRating(value: any, fromType: FieldType, fieldConfig?: FieldConfig): number {
    const maxRating = fieldConfig?.format === '10' ? 10 : 5;

    if (fromType === FieldType.NUMBER) {
        const num = Number(value);
        return Math.max(0, Math.min(maxRating, Math.round(num)));
    }

    if (fromType === FieldType.PROGRESS) {
        // Progress is 0-100, scale to rating
        const num = Number(value);
        return Math.round((num / 100) * maxRating);
    }

    if (fromType === FieldType.CHECKBOX) {
        return value ? maxRating : 0;
    }

    if (fromType === FieldType.TEXT) {
        const num = parseFloat(value);
        if (!isNaN(num)) {
            return Math.max(0, Math.min(maxRating, Math.round(num)));
        }
    }

    return 0;
}

/**
 * Convert value to progress
 */
function convertToProgress(value: any, fromType: FieldType): number {
    if (fromType === FieldType.NUMBER) {
        const num = Number(value);
        // If number is 0-1, treat as percentage (0.5 = 50%)
        if (num >= 0 && num <= 1) {
            return Math.round(num * 100);
        }
        // If number is 1-100, treat as percentage
        if (num >= 1 && num <= 100) {
            return Math.round(num);
        }
        // If number is > 100, normalize to 0-100
        return Math.min(100, Math.max(0, Math.round(num / 10)));
    }

    if (fromType === FieldType.RATING) {
        // Assume rating is out of 5 or 10
        const num = Number(value);
        return Math.round((num / 10) * 100); // Assume max 10
    }

    if (fromType === FieldType.CHECKBOX) {
        return value ? 100 : 0;
    }

    if (fromType === FieldType.TEXT) {
        const num = parseFloat(value);
        if (!isNaN(num)) {
            return Math.max(0, Math.min(100, Math.round(num)));
        }
    }

    return 0;
}

/**
 * Get default value for a field type
 */
function getDefaultValueForType(type: FieldType): any {
    switch (type) {
        case FieldType.TEXT:
        case FieldType.URL:
        case FieldType.EMAIL:
        case FieldType.PHONE:
            return '';
        case FieldType.NUMBER:
        case FieldType.RATING:
        case FieldType.PROGRESS:
            return 0;
        case FieldType.CHECKBOX:
            return false;
        case FieldType.SELECT:
            return null;
        case FieldType.MULTI_SELECT:
            return [];
        case FieldType.DATE:
            return null;
        default:
            return null;
    }
}

/**
 * Auto-generate select options from existing data when converting to select/multi-select
 * @param records All records
 * @param fieldId Field ID
 * @param fromType Original field type
 * @returns Generated select options
 */
export function generateSelectOptionsFromData(
    records: RecordData[],
    fieldId: string,
    fromType: FieldType
): SelectOption[] {
    const uniqueValues = new Set<string>();

    records.forEach(record => {
        const value = record[fieldId];
        if (value !== null && value !== undefined && value !== '') {
            const strValue = convertToText(value, fromType);
            if (strValue.trim()) {
                uniqueValues.add(strValue.trim());
            }
        }
    });

    const colors = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
        '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
    ];

    return Array.from(uniqueValues).slice(0, 50).map((label, index) => ({
        id: generateOptionId(),
        label,
        color: colors[index % colors.length] as string,
    }));
}

/**
 * Check if field type conversion might lose data
 * @param fromType Original field type
 * @param toType Target field type
 * @returns Warning message if data might be lost, null otherwise
 */
export function getConversionWarning(fromType: FieldType, toType: FieldType): string | null {
    // Converting from multi-select to single select
    if (fromType === FieldType.MULTI_SELECT && toType === FieldType.SELECT) {
        return 'Converting from multi-select to select will keep only the first selected option.';
    }

    // Converting from date to number
    if (fromType === FieldType.DATE && toType === FieldType.NUMBER) {
        return 'Converting dates to numbers will use Unix timestamps.';
    }

    // Converting from complex types to text
    if ([FieldType.MULTI_SELECT, FieldType.SELECT].includes(fromType) &&
        [FieldType.TEXT, FieldType.URL, FieldType.EMAIL, FieldType.PHONE].includes(toType)) {
        return 'Converting to text will lose the structured option data.';
    }

    // Converting to checkbox might lose precision
    if (![FieldType.CHECKBOX].includes(fromType) && toType === FieldType.CHECKBOX) {
        return 'Converting to checkbox will result in true/false values only.';
    }

    return null;
}
