/**
 * Built-in color palette for ChartPlugin with light/dark mode support.
 *
 * Each color entry provides an HSL value for both light and dark themes.
 * The ChartContainer's ChartStyle component automatically generates CSS
 * that responds to the `.dark` class on the root element.
 */

export interface ThemeColor {
    light: string
    dark: string
}

/**
 * Built-in chart color palette — 10 carefully chosen colors
 * that are visually distinct and accessible in both light and dark modes.
 */
export const CHART_PALETTE: ThemeColor[] = [
    // 1. Blue
    { light: "hsl(221, 83%, 53%)", dark: "hsl(217, 91%, 60%)" },
    // 2. Emerald
    { light: "hsl(160, 84%, 39%)", dark: "hsl(160, 67%, 52%)" },
    // 3. Amber
    { light: "hsl(38, 92%, 50%)", dark: "hsl(38, 92%, 60%)" },
    // 4. Rose
    { light: "hsl(347, 77%, 50%)", dark: "hsl(347, 77%, 60%)" },
    // 5. Violet
    { light: "hsl(263, 70%, 50%)", dark: "hsl(263, 70%, 64%)" },
    // 6. Cyan
    { light: "hsl(189, 94%, 43%)", dark: "hsl(189, 80%, 55%)" },
    // 7. Orange
    { light: "hsl(25, 95%, 53%)", dark: "hsl(25, 95%, 60%)" },
    // 8. Indigo
    { light: "hsl(239, 84%, 67%)", dark: "hsl(239, 84%, 74%)" },
    // 9. Teal
    { light: "hsl(172, 66%, 40%)", dark: "hsl(172, 66%, 50%)" },
    // 10. Pink
    { light: "hsl(330, 81%, 60%)", dark: "hsl(330, 81%, 68%)" },
]

/**
 * Get the light-mode color at the given palette index (wraps around).
 */
export function getLightColor(index: number): string {
    return CHART_PALETTE[index % CHART_PALETTE.length].light
}

/**
 * Get the dark-mode color at the given palette index (wraps around).
 */
export function getDarkColor(index: number): string {
    return CHART_PALETTE[index % CHART_PALETTE.length].dark
}

/**
 * Get a ThemeColor pair at the given palette index (wraps around).
 */
export function getThemeColor(index: number): ThemeColor {
    return CHART_PALETTE[index % CHART_PALETTE.length]
}
