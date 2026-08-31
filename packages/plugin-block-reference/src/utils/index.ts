/**
 * Utility exports for Block Reference Plugin
 */
export * from './cache';

/** Read the display glyph from canonical icon values without assuming a shape. */
export const getIconText = (icon: unknown): string | null => {
    if (typeof icon === 'string') return icon || null;
    if (!icon || typeof icon !== 'object') return null;
    const value = (icon as { icon?: unknown }).icon;
    return typeof value === 'string' && value ? value : null;
};
