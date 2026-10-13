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

const FALLBACK_TAG_STYLE = { bg: 'rgba(107, 114, 128, 0.2)', text: '#9ca3af' };
const HEX_3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_6 = /^#[0-9a-f]{6}$/i;
const HEX_8 = /^#[0-9a-f]{8}$/i;

/**
 * Normalise a hex colour to lowercase 6-digit form, or null when it is not a
 * hex colour. `#abc` expands to `#aabbcc`; `#rrggbbaa` drops the alpha. Only
 * 6-digit values can be turned into a translucent tag background.
 */
export function toHex6(color: string): string | null {
    const raw = String(color).trim();
    if (HEX_6.test(raw)) return raw.toLowerCase();
    const short = HEX_3.exec(raw);
    if (short) {
        return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
    }
    if (HEX_8.test(raw)) return raw.slice(0, 7).toLowerCase();
    return null;
}

/**
 * Get Notion-style tag style for a SELECT/MULTI_SELECT option color.
 *
 * Option colours written before colour normalisation (e.g. "#red") are not
 * renderable CSS; fall back to gray instead of emitting an invalid value.
 */
export function getTagStyle(color: string): { bg: string; text: string } {
    const mapped = TAG_COLOR_MAP[color];
    if (mapped) return mapped;
    const hex6 = typeof color === 'string' ? toHex6(color) : null;
    if (hex6) return { bg: `${hex6}20`, text: hex6 };
    return FALLBACK_TAG_STYLE;
}

/**
 * Get a random option color from the palette
 */
export function getRandomOptionColor(): string {
    return OPTION_COLORS[Math.floor(Math.random() * OPTION_COLORS.length)] as string;
}
