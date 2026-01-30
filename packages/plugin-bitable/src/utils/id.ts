import { uuidv4 } from "lib0/random";

/**
 * ID type for different bitable data entities
 */
export type BitableIdType = 'record' | 'view' | 'field' | 'option';

/**
 * Generate a unique ID for bitable data entities
 * Centralized ID generation allows for easy strategy changes in the future
 * 
 * @param type - The type of entity the ID is for (optional, for future customization)
 * @returns A unique identifier string
 */
export function generateId(type?: BitableIdType): string {
    return uuidv4();
}

/**
 * Generate a unique ID specifically for records
 */
export function generateRecordId(): string {
    return generateId('record');
}

/**
 * Generate a unique ID specifically for views
 */
export function generateViewId(): string {
    return generateId('view');
}

/**
 * Generate a unique ID specifically for fields
 */
export function generateFieldId(): string {
    return generateId('field');
}

/**
 * Generate a unique ID specifically for select options
 */
export function generateOptionId(): string {
    return generateId('option');
}
