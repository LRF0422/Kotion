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
 * A named color palette consisting of up to 10 colors with light/dark variants.
 * Used by the agent via `colorScheme` to pick a pre-defined set of colors
 * that adapt properly to both themes.
 */
export interface ColorPalette {
    /** Machine-readable key used in ChartData.colorScheme */
    key: string
    /** Human-readable name shown in the UI */
    label: string
    /** Colors in the palette (up to 10) */
    colors: ThemeColor[]
}

/**
 * Pre-defined color palettes for the agent to choose from.
 * Each palette has both light and dark variants for every color slot,
 * ensuring proper adaptation across themes.
 */
export const COLOR_PALETTES: ColorPalette[] = [
    {
        key: "default",
        label: "Default",
        colors: [
            { light: "hsl(221, 83%, 53%)", dark: "hsl(217, 91%, 60%)" },
            { light: "hsl(160, 84%, 39%)", dark: "hsl(160, 67%, 52%)" },
            { light: "hsl(38, 92%, 50%)", dark: "hsl(38, 92%, 60%)" },
            { light: "hsl(347, 77%, 50%)", dark: "hsl(347, 77%, 60%)" },
            { light: "hsl(263, 70%, 50%)", dark: "hsl(263, 70%, 64%)" },
            { light: "hsl(189, 94%, 43%)", dark: "hsl(189, 80%, 55%)" },
            { light: "hsl(25, 95%, 53%)", dark: "hsl(25, 95%, 60%)" },
            { light: "hsl(239, 84%, 67%)", dark: "hsl(239, 84%, 74%)" },
            { light: "hsl(172, 66%, 40%)", dark: "hsl(172, 66%, 50%)" },
            { light: "hsl(330, 81%, 60%)", dark: "hsl(330, 81%, 68%)" },
        ],
    },
    {
        key: "ocean",
        label: "Ocean",
        colors: [
            { light: "hsl(199, 89%, 48%)", dark: "hsl(199, 89%, 58%)" },
            { light: "hsl(186, 72%, 46%)", dark: "hsl(186, 72%, 56%)" },
            { light: "hsl(172, 66%, 40%)", dark: "hsl(172, 66%, 50%)" },
            { light: "hsl(213, 94%, 68%)", dark: "hsl(213, 94%, 74%)" },
            { light: "hsl(230, 70%, 56%)", dark: "hsl(230, 70%, 66%)" },
            { light: "hsl(189, 80%, 42%)", dark: "hsl(189, 80%, 52%)" },
            { light: "hsl(207, 90%, 54%)", dark: "hsl(207, 90%, 64%)" },
            { light: "hsl(195, 85%, 41%)", dark: "hsl(195, 85%, 51%)" },
            { light: "hsl(221, 83%, 53%)", dark: "hsl(221, 83%, 63%)" },
            { light: "hsl(239, 84%, 67%)", dark: "hsl(239, 84%, 74%)" },
        ],
    },
    {
        key: "warm",
        label: "Warm",
        colors: [
            { light: "hsl(25, 95%, 53%)", dark: "hsl(25, 95%, 60%)" },
            { light: "hsl(38, 92%, 50%)", dark: "hsl(38, 92%, 60%)" },
            { light: "hsl(347, 77%, 50%)", dark: "hsl(347, 77%, 60%)" },
            { light: "hsl(330, 81%, 60%)", dark: "hsl(330, 81%, 68%)" },
            { light: "hsl(14, 90%, 55%)", dark: "hsl(14, 90%, 62%)" },
            { light: "hsl(45, 93%, 47%)", dark: "hsl(45, 93%, 57%)" },
            { light: "hsl(0, 84%, 60%)", dark: "hsl(0, 84%, 68%)" },
            { light: "hsl(32, 98%, 48%)", dark: "hsl(32, 98%, 58%)" },
            { light: "hsl(350, 88%, 52%)", dark: "hsl(350, 88%, 62%)" },
            { light: "hsl(20, 86%, 53%)", dark: "hsl(20, 86%, 60%)" },
        ],
    },
    {
        key: "pastel",
        label: "Pastel",
        colors: [
            { light: "hsl(221, 70%, 72%)", dark: "hsl(221, 70%, 58%)" },
            { light: "hsl(160, 60%, 65%)", dark: "hsl(160, 60%, 48%)" },
            { light: "hsl(38, 80%, 72%)", dark: "hsl(38, 80%, 55%)" },
            { light: "hsl(347, 65%, 70%)", dark: "hsl(347, 65%, 55%)" },
            { light: "hsl(263, 55%, 70%)", dark: "hsl(263, 55%, 58%)" },
            { light: "hsl(189, 70%, 65%)", dark: "hsl(189, 70%, 50%)" },
            { light: "hsl(25, 75%, 72%)", dark: "hsl(25, 75%, 55%)" },
            { light: "hsl(330, 65%, 75%)", dark: "hsl(330, 65%, 58%)" },
            { light: "hsl(172, 50%, 65%)", dark: "hsl(172, 50%, 48%)" },
            { light: "hsl(239, 60%, 78%)", dark: "hsl(239, 60%, 62%)" },
        ],
    },
    {
        key: "vivid",
        label: "Vivid",
        colors: [
            { light: "hsl(217, 91%, 60%)", dark: "hsl(217, 91%, 70%)" },
            { light: "hsl(142, 71%, 45%)", dark: "hsl(142, 71%, 55%)" },
            { light: "hsl(47, 96%, 53%)", dark: "hsl(47, 96%, 63%)" },
            { light: "hsl(0, 84%, 60%)", dark: "hsl(0, 84%, 68%)" },
            { light: "hsl(271, 91%, 65%)", dark: "hsl(271, 91%, 75%)" },
            { light: "hsl(180, 92%, 39%)", dark: "hsl(180, 92%, 50%)" },
            { light: "hsl(32, 98%, 48%)", dark: "hsl(32, 98%, 58%)" },
            { light: "hsl(326, 100%, 74%)", dark: "hsl(326, 100%, 80%)" },
            { light: "hsl(200, 98%, 39%)", dark: "hsl(200, 98%, 50%)" },
            { light: "hsl(258, 90%, 76%)", dark: "hsl(258, 90%, 82%)" },
        ],
    },
    {
        key: "earth",
        label: "Earth",
        colors: [
            { light: "hsl(25, 55%, 45%)", dark: "hsl(25, 55%, 55%)" },
            { light: "hsl(84, 42%, 39%)", dark: "hsl(84, 42%, 49%)" },
            { light: "hsl(36, 55%, 50%)", dark: "hsl(36, 55%, 60%)" },
            { light: "hsl(15, 40%, 48%)", dark: "hsl(15, 40%, 58%)" },
            { light: "hsl(150, 35%, 42%)", dark: "hsl(150, 35%, 52%)" },
            { light: "hsl(45, 50%, 50%)", dark: "hsl(45, 50%, 58%)" },
            { light: "hsl(5, 50%, 52%)", dark: "hsl(5, 50%, 60%)" },
            { light: "hsl(165, 30%, 38%)", dark: "hsl(165, 30%, 48%)" },
            { light: "hsl(30, 48%, 42%)", dark: "hsl(30, 48%, 52%)" },
            { light: "hsl(100, 28%, 45%)", dark: "hsl(100, 28%, 55%)" },
        ],
    },
]

/**
 * Get a palette by its key. Returns the default palette if not found.
 */
export function getPalette(key?: string): ColorPalette {
    if (key) {
        const found = COLOR_PALETTES.find(p => p.key === key)
        if (found) return found
    }
    return COLOR_PALETTES[0] // default
}

/**
 * Get a ThemeColor pair from a specific palette at the given index (wraps around).
 */
export function getThemeColorFromPalette(paletteKey: string | undefined, index: number): ThemeColor {
    const palette = getPalette(paletteKey)
    return palette.colors[index % palette.colors.length]
}

/**
 * Get the light-mode color at the given palette index (wraps around).
 * @deprecated Use getThemeColorFromPalette instead for palette-aware color lookup.
 */
export function getLightColor(index: number): string {
    return CHART_PALETTE[index % CHART_PALETTE.length].light
}

/**
 * Get the dark-mode color at the given palette index (wraps around).
 * @deprecated Use getThemeColorFromPalette instead for palette-aware color lookup.
 */
export function getDarkColor(index: number): string {
    return CHART_PALETTE[index % CHART_PALETTE.length].dark
}

/**
 * Get a ThemeColor pair at the given palette index (wraps around).
 * @deprecated Use getThemeColorFromPalette instead for palette-aware color lookup.
 */
export function getThemeColor(index: number): ThemeColor {
    return CHART_PALETTE[index % CHART_PALETTE.length]
}

/**
 * Built-in chart color palette — 10 carefully chosen colors
 * that are visually distinct and accessible in both light and dark modes.
 * @deprecated Use COLOR_PALETTES[0].colors ("default" palette) instead.
 */
export const CHART_PALETTE: ThemeColor[] = COLOR_PALETTES[0].colors

