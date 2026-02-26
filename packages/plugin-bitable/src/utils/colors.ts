/**
 * Shared color constants and utilities for SELECT/MULTI_SELECT fields
 */

// 8-color option palette used across FieldRenderers, fieldConversion, FieldConfigPanel, FieldPropertiesEditor
export const OPTION_COLORS = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#14b8a6', // teal
    '#f97316', // orange
];

// Extended 12-color preset with light/dark variants (for FieldConfigPanel color picker)
export const PRESET_COLORS = [
    { value: '#3b82f6', name: 'Blue', light: '#eff6ff', dark: '#1e3a8a' },
    { value: '#10b981', name: 'Green', light: '#d1fae5', dark: '#064e3b' },
    { value: '#f59e0b', name: 'Amber', light: '#fef3c7', dark: '#78350f' },
    { value: '#ef4444', name: 'Red', light: '#fee2e2', dark: '#7f1d1d' },
    { value: '#8b5cf6', name: 'Purple', light: '#ede9fe', dark: '#4c1d95' },
    { value: '#ec4899', name: 'Pink', light: '#fce7f3', dark: '#831843' },
    { value: '#14b8a6', name: 'Teal', light: '#ccfbf1', dark: '#134e4a' },
    { value: '#f97316', name: 'Orange', light: '#ffedd5', dark: '#7c2d12' },
    { value: '#6366f1', name: 'Indigo', light: '#e0e7ff', dark: '#312e81' },
    { value: '#06b6d4', name: 'Cyan', light: '#cffafe', dark: '#164e63' },
    { value: '#84cc16', name: 'Lime', light: '#ecfccb', dark: '#365314' },
    { value: '#a855f7', name: 'Violet', light: '#f3e8ff', dark: '#581c87' },
];

// Map color hex to Notion-style tag styles (bg + text)
const TAG_COLOR_MAP: Record<string, { bg: string; text: string }> = {
    '#3b82f6': { bg: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa' },
    '#10b981': { bg: 'rgba(16, 185, 129, 0.2)', text: '#34d399' },
    '#f59e0b': { bg: 'rgba(245, 158, 11, 0.2)', text: '#fbbf24' },
    '#ef4444': { bg: 'rgba(239, 68, 68, 0.2)', text: '#f87171' },
    '#8b5cf6': { bg: 'rgba(139, 92, 246, 0.2)', text: '#a78bfa' },
    '#ec4899': { bg: 'rgba(236, 72, 153, 0.2)', text: '#f472b6' },
    '#14b8a6': { bg: 'rgba(20, 184, 166, 0.2)', text: '#2dd4bf' },
    '#f97316': { bg: 'rgba(249, 115, 22, 0.2)', text: '#fb923c' },
};

/**
 * Get Notion-style tag style for a SELECT/MULTI_SELECT option color
 */
export function getTagStyle(color: string): { bg: string; text: string } {
    return TAG_COLOR_MAP[color] || { bg: `${color}20`, text: color };
}

/**
 * Get a random option color from the palette
 */
export function getRandomOptionColor(): string {
    return OPTION_COLORS[Math.floor(Math.random() * OPTION_COLORS.length)] as string;
}
