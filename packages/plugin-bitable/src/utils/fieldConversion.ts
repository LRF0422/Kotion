import { FieldType, FieldConfig, SelectOption, RecordData } from '../types';
import { generateOptionId } from './id';
import { OPTION_COLORS } from './colors';

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
    fieldConfig?: FieldConfig,
    sourceFieldConfig?: FieldConfig
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
        case FieldType.LONG_TEXT:
            return convertToText(value, fromType, sourceFieldConfig);

        case FieldType.NUMBER:
            return convertToNumber(value, fromType);

        case FieldType.DATE:
            return convertToDate(value, fromType);

        case FieldType.CHECKBOX:
            return convertToCheckbox(value, fromType);

        case FieldType.SELECT:
            return convertToSelect(value, fromType, fieldConfig, sourceFieldConfig);

        case FieldType.MULTI_SELECT:
            return convertToMultiSelect(value, fromType, fieldConfig, sourceFieldConfig);

        case FieldType.RATING:
            return convertToRating(value, fromType, fieldConfig);

        case FieldType.PROGRESS:
            return convertToProgress(value, fromType);

        case FieldType.URL:
        case FieldType.EMAIL:
        case FieldType.PHONE:
            return convertToText(value, fromType, sourceFieldConfig);

        default:
            return value;
    }
}

/**
 * Convert value to text
 */
function convertToText(
    value: any,
    fromType: FieldType,
    sourceFieldConfig?: FieldConfig
): string {
    const sourceOptions = sourceFieldConfig?.options || [];

    if (fromType === FieldType.SELECT && typeof value === 'string') {
        return sourceOptions.find((option) => option.id === value)?.label || value;
    }

    if (fromType === FieldType.MULTI_SELECT && Array.isArray(value)) {
        return value
            .map((item) => {
                const id = typeof item === 'string' ? item : item?.id;
                return sourceOptions.find((option) => option.id === id)?.label || item?.label || String(item);
            })
            .join(', ');
    }

    if (Array.isArray(value)) {
        return value.map((item: any) => item?.label || String(item)).join(', ');
    }

    if (typeof value === 'object' && value !== null) {
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

    if (fromType === FieldType.TEXT || fromType === FieldType.LONG_TEXT) {
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
    if (fromType === FieldType.TEXT || fromType === FieldType.LONG_TEXT) {
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

    if (fromType === FieldType.TEXT || fromType === FieldType.LONG_TEXT) {
        const lowerValue = String(value).toLowerCase().trim();
        return ['true', 'yes', '1', 'checked', 'on', '是', '对', '真'].includes(lowerValue);
    }

    return Boolean(value);
}

/**
 * Convert value to select
 */
function convertToSelect(
    value: any,
    fromType: FieldType,
    fieldConfig?: FieldConfig,
    sourceFieldConfig?: FieldConfig
): string | null {
    const options = fieldConfig?.options || [];
    const firstValue = Array.isArray(value) ? value[0] : value;
    const candidateId = typeof firstValue === 'string' ? firstValue : firstValue?.id;

    if (candidateId && options.some((option) => option.id === candidateId)) {
        return candidateId;
    }

    const strValue = convertToText(firstValue, fromType, sourceFieldConfig).trim();
    if (!strValue) return null;

    const matchingOption = options.find(
        (option) => option.label.trim().toLowerCase() === strValue.toLowerCase()
    );
    return matchingOption?.id || null;
}

/**
 * Convert value to multi-select
 */
function convertToMultiSelect(
    value: any,
    fromType: FieldType,
    fieldConfig?: FieldConfig,
    sourceFieldConfig?: FieldConfig
): string[] {
    const values = Array.isArray(value) ? value : [value];
    return values
        .map((item) => convertToSelect(item, fromType, fieldConfig, sourceFieldConfig))
        .filter((item): item is string => Boolean(item));
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

    if (fromType === FieldType.TEXT || fromType === FieldType.LONG_TEXT) {
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

    if (fromType === FieldType.TEXT || fromType === FieldType.LONG_TEXT) {
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
        case FieldType.LONG_TEXT:
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

function sourceLabelsForValue(value: any, sourceField: FieldConfig): string[] {
    if (value === null || value === undefined || value === '') return [];
    const options = sourceField.options || [];

    if (sourceField.type === FieldType.MULTI_SELECT && Array.isArray(value)) {
        return value
            .map((item) => {
                const id = typeof item === 'string' ? item : item?.id;
                return options.find((option) => option.id === id)?.label || item?.label || String(item);
            })
            .map((label) => label.trim())
            .filter(Boolean);
    }

    if (sourceField.type === FieldType.SELECT) {
        const id = typeof value === 'string' ? value : value?.id;
        const label = options.find((option) => option.id === id)?.label || value?.label || String(value);
        return label.trim() ? [label.trim()] : [];
    }

    const label = convertToText(value, sourceField.type, sourceField).trim();
    return label ? [label] : [];
}

/** Prepare a lossless option set for conversion to select or multi-select. */
export function prepareSelectOptions(
    records: RecordData[],
    sourceField: FieldConfig,
    proposedOptions: SelectOption[] = []
): SelectOption[] {
    const options: SelectOption[] = [];
    const labels = new Set<string>();
    const ids = new Set<string>();

    const addOption = (option: SelectOption) => {
        const normalizedLabel = option.label.trim().toLowerCase();
        if (!normalizedLabel || labels.has(normalizedLabel) || ids.has(option.id)) return;
        labels.add(normalizedLabel);
        ids.add(option.id);
        options.push({ ...option, label: option.label.trim() });
    };

    proposedOptions.forEach(addOption);
    if (sourceField.type === FieldType.SELECT || sourceField.type === FieldType.MULTI_SELECT) {
        (sourceField.options || []).forEach(addOption);
    }

    records.forEach((record) => {
        sourceLabelsForValue(record[sourceField.id], sourceField).forEach((label) => {
            const normalizedLabel = label.toLowerCase();
            if (labels.has(normalizedLabel)) return;
            addOption({
                id: generateOptionId(),
                label,
                color: OPTION_COLORS[options.length % OPTION_COLORS.length] as string,
            });
        });
    });

    return options;
}

/** Backwards-compatible option generation helper for non-select source fields. */
export function generateSelectOptionsFromData(
    records: RecordData[],
    fieldId: string,
    fromType: FieldType
): SelectOption[] {
    return prepareSelectOptions(records, { id: fieldId, title: fieldId, type: fromType });
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
        [FieldType.TEXT, FieldType.LONG_TEXT, FieldType.URL, FieldType.EMAIL, FieldType.PHONE].includes(toType)) {
        return 'Converting to text will lose the structured option data.';
    }

    // Converting to checkbox might lose precision
    if (![FieldType.CHECKBOX].includes(fromType) && toType === FieldType.CHECKBOX) {
        return 'Converting to checkbox will result in true/false values only.';
    }

    return null;
}
