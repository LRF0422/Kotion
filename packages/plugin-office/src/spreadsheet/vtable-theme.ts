/**
 * Engine theme, derived from the block's own CSS tokens.
 *
 * `sheet.css` already defines a light and dark palette under `.kn-sheet` /
 * `.dark .kn-sheet` (`--kn-sheet-cell-bg`, `--kn-sheet-head-fg`, …). Building the
 * grid's theme from those tokens — rather than switching to VTable's bundled
 * `DARK` theme — keeps the canvas identical to the rest of the block in both
 * modes and means a host theme change only has to update CSS.
 *
 * The engine resolves colours itself, so the tokens have to be **computed**
 * values (`rgb(...)`), not `hsl(var(--x))` expressions. Reading them through
 * `getComputedStyle` does that resolution.
 *
 * The theme *shape* is unit-tested; reading the DOM cannot be, so that part is
 * kept to a single lookup table.
 *
 * Two theme layers exist in VTableSheet and both matter:
 *
 * 1. `tableTheme` — the canvas palette (body, header, frame, selection).
 * 2. `rowSeriesNumberCellStyle` / `colSeriesNumberCellStyle` / `menuStyle` —
 *    the Excel-style row/column headers and the sheet menu. Those are rendered
 *    by the `TableSeriesNumber` plugin, which reads them from the **top level**
 *    of the theme option, not from `tableTheme`. Leaving them out paints a
 *    packaged light `#F9F9F9` band above a dark grid, so
 *    {@link buildSheetTheme} fills them too.
 */

/** Resolved colours the grid needs, with sensible fallbacks for each mode. */
export interface ThemeTokens {
    cellBg: string
    cellFg: string
    headBg: string
    headFg: string
    line: string
    hover: string
    selection: string
    accent: string
    menuBg: string
    menuFg: string
}

/** Fallbacks used when a token is missing (e.g. no stylesheet, or SSR). */
export function fallbackTokens(dark: boolean): ThemeTokens {
    return dark
        ? {
              cellBg: '#1a1a1a',
              cellFg: '#d1d1d1',
              headBg: '#292929',
              headFg: '#8f8f8f',
              line: '#2b2b2b',
              hover: '#292929',
              selection: 'rgba(59, 130, 246, 0.12)',
              accent: '#3b82f6',
              menuBg: '#1f1f1f',
              menuFg: '#d1d1d1',
          }
        : {
              cellBg: '#ffffff',
              cellFg: '#333333',
              headBg: '#f3f3f3',
              headFg: '#767676',
              line: '#e6e4e0',
              hover: '#f5f5f5',
              selection: 'rgba(37, 99, 235, 0.07)',
              accent: '#2563eb',
              menuBg: '#ffffff',
              menuFg: '#333333',
          }
}

/** The `--kn-sheet-*` variables each token comes from. */
export const TOKEN_VARIABLES: Record<keyof ThemeTokens, string> = {
    cellBg: '--kn-sheet-cell-bg',
    cellFg: '--kn-sheet-cell-fg',
    headBg: '--kn-sheet-head-bg',
    headFg: '--kn-sheet-head-fg',
    line: '--kn-sheet-line',
    hover: '--kn-sheet-hover',
    selection: '--kn-sheet-range',
    accent: '--kn-sheet-accent',
    // Menu surfaces come from the host popover tokens, which are themed too.
    menuBg: '--popover',
    menuFg: '--popover-foreground',
}

/**
 * Read the tokens off an element.
 *
 * `--popover` is defined as a bare HSL triple (`0 0% 100%`), not a colour, so it
 * is wrapped before use — passing it through would hand the engine an invalid
 * colour and render every menu surface black.
 */
export function readThemeTokens(
    read: (name: string) => string | undefined,
    dark: boolean,
): ThemeTokens {
    const fallback = fallbackTokens(dark)
    const token = (key: keyof ThemeTokens): string => {
        const raw = read(TOKEN_VARIABLES[key])?.trim()
        if (!raw) return fallback[key]
        if (key === 'menuBg' || key === 'menuFg') {
            // A bare HSL triple needs wrapping; a full colour is already usable.
            return /^[\d.]+(\s+[\d.]+%){2}/.test(raw) ? `hsl(${raw})` : raw
        }
        return raw
    }
    return {
        cellBg: token('cellBg'),
        cellFg: token('cellFg'),
        headBg: token('headBg'),
        headFg: token('headFg'),
        line: token('line'),
        hover: token('hover'),
        selection: token('selection'),
        accent: token('accent'),
        menuBg: token('menuBg'),
        menuFg: token('menuFg'),
    }
}

/** A compact cell body, matching the block's 23px row height. */
export function buildTheme(tokens: ThemeTokens): Record<string, unknown> {
    const cellPadding = [4, 8, 4, 8]
    const base = {
        fontSize: 13,
        fontFamily:
            '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
        padding: cellPadding,
        borderColor: tokens.line,
        // The engine draws its own grid lines; a fully transparent underlay lets
        // the CSS background show through instead of painting over it.
        lineHeight: 13,
    }

    const bodyStyle = {
        ...base,
        color: tokens.cellFg,
        bgColor: tokens.cellBg,
        hover: { cellBgColor: tokens.hover, inlineRowBgColor: tokens.hover, inlineColumnBgColor: tokens.hover },
    }

    const headerStyle = {
        ...base,
        color: tokens.headFg,
        bgColor: tokens.headBg,
        fontWeight: 'normal' as const,
        hover: {
            cellBgColor: tokens.hover,
            inlineRowBgColor: tokens.hover,
            inlineColumnBgColor: tokens.hover,
        },
    }

    return {
        underlayBackgroundColor: 'transparent',
        // Every slot the engine reads is filled: a missing one falls back to the
        // packaged light default, which shows up as a pale band inside a dark
        // block (frozen panes and group titles are the easy ones to miss).
        defaultStyle: headerStyle,
        headerStyle,
        rowHeaderStyle: headerStyle,
        cornerHeaderStyle: headerStyle,
        cornerRightTopCellStyle: headerStyle,
        cornerLeftBottomCellStyle: headerStyle,
        cornerRightBottomCellStyle: headerStyle,
        rightFrozenStyle: bodyStyle,
        bottomFrozenStyle: bodyStyle,
        groupTitleStyle: headerStyle,
        bodyStyle,
        frameStyle: {
            borderColor: tokens.line,
            borderLineWidth: 1,
        },
        columnResize: {
            lineColor: tokens.accent,
            bgColor: tokens.accent,
            width: 3,
        },
        rowResize: {
            lineColor: tokens.accent,
            bgColor: tokens.accent,
            width: 3,
        },
        selectionStyle: {
            cellBgColor: tokens.selection,
            cellBorderColor: tokens.accent,
            cellBorderLineWidth: 2,
        },
        // VTableSheet paints the context menu from the top-level `menuStyle`; see
        // {@link buildSheetTheme}. Kept here as well so the {@link buildTheme}
        // contract stays a complete table palette.
        menuStyle: {
            color: tokens.menuFg,
            bgColor: tokens.menuBg,
            highlightColor: tokens.accent,
        },
    }
}

/**
 * Style of the Excel-style row/column headers (the A/B/C letters and the row
 * numbers) and of the corner "select all" cell between them.
 *
 * The `TableSeriesNumber` plugin shallow-merges this over its own defaults, so
 * every sub-object has to be complete: supplying only `text.fill` would drop
 * `fontSize`/`padding` and supplying only `bgColor` would leave the text at the
 * plugin's light grey. That is why the shape mirrors the plugin's default.
 */
export function buildSeriesNumberStyle(tokens: ThemeTokens): Record<string, unknown> {
    return {
        bgColor: tokens.headBg,
        text: {
            fontSize: 12,
            fill: tokens.headFg,
            textAlign: 'center',
            textBaseline: 'middle',
            padding: [2, 4, 2, 4],
        },
        borderLine: {
            stroke: tokens.line,
            lineWidth: 1,
        },
        states: {
            hover: { fill: tokens.hover, opacity: 0.9 },
            select: { fill: tokens.selection, opacity: 1 },
        },
    }
}

/**
 * The VTableSheet theme object: the canvas palette plus the DOM-ish surfaces
 * (series-number headers and the sheet menu) that live outside `tableTheme`.
 */
export interface SheetTheme {
    tableTheme: Record<string, unknown>
    rowSeriesNumberCellStyle: Record<string, unknown>
    colSeriesNumberCellStyle: Record<string, unknown>
    menuStyle: Record<string, unknown>
}

export function buildSheetTheme(tokens: ThemeTokens): SheetTheme {
    const seriesNumber = buildSeriesNumberStyle(tokens)
    return {
        tableTheme: buildTheme(tokens),
        rowSeriesNumberCellStyle: seriesNumber,
        colSeriesNumberCellStyle: seriesNumber,
        menuStyle: {
            color: tokens.menuFg,
            bgColor: tokens.menuBg,
        },
    }
}


/** Wrap icon paths in a 24×24, currentColor SVG. */
function menuIcon(paths: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
}

/**
 * Context-menu icons, keyed by the engine's `iconName` or `menuKey`.
 *
 * The bundled `ContextMenuPlugin` draws its icons as emoji (`createIcon` in
 * `@visactor/vtable-plugins`); replacing them with inline SVGs that use
 * `currentColor` keeps the menu consistent with the app's icon set and lets the
 * glyph follow the themed text colour.
 */
export const CONTEXT_MENU_ICONS: Record<string, string> = {
    "copy": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"9\" y=\"9\" width=\"13\" height=\"13\" rx=\"2\"/><path d=\"M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1\"/></svg>",
    "cut": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"6\" cy=\"6\" r=\"3\"/><path d=\"M8.12 8.12 12 12\"/><path d=\"M20 4 8.12 15.88\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><path d=\"M14.8 14.8 20 20\"/></svg>",
    "paste": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"8\" y=\"2\" width=\"8\" height=\"4\" rx=\"1\"/><path d=\"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2\"/></svg>",
    "insert": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 5v14\"/><path d=\"M5 12h14\"/></svg>",
    "delete": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 6h18\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"/><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/></svg>",
    "sort": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m3 16 4 4 4-4\"/><path d=\"M7 20V4\"/><path d=\"m21 8-4-4-4 4\"/><path d=\"M17 4v16\"/></svg>",
    "protect": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"11\" width=\"18\" height=\"11\" rx=\"2\"/><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/></svg>",
    "hide": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68\"/><path d=\"M6.61 6.61A13.5 13.5 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61\"/><path d=\"m2 2 20 20\"/></svg>",
    "freeze": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 2v20\"/><path d=\"M2 12h20\"/><path d=\"m4.93 4.93 14.14 14.14\"/><path d=\"m19.07 4.93-14.14 14.14\"/></svg>",
    "unfreeze": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 2v20\"/><path d=\"M2 12h20\"/><path d=\"m4.93 4.93 14.14 14.14\"/><path d=\"m19.07 4.93-14.14 14.14\"/><path d=\"m2 2 20 20\"/></svg>",
    "up-arrow": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 19V5\"/><path d=\"m5 12 7-7 7 7\"/></svg>",
    "down-arrow": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 5v14\"/><path d=\"m19 12-7 7-7-7\"/></svg>",
    "left-arrow": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M19 12H5\"/><path d=\"m12 19-7-7 7-7\"/></svg>",
    "right-arrow": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 12h14\"/><path d=\"m12 5 7 7-7 7\"/></svg>",
    "merge_cells": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 12h18\"/><path d=\"M12 3v18\"/></svg>",
    "unmerge_cells": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 12h7\"/><path d=\"M14 12h7\"/><path d=\"M12 3v18\"/></svg>",
    "row": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M3 10h18\"/><path d=\"M3 14h18\"/></svg>",
    "column": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"4\" y=\"3\" width=\"16\" height=\"18\" rx=\"2\"/><path d=\"M10 3v18\"/><path d=\"M14 3v18\"/></svg>",
    "filter": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M22 3H2l8 9.46V19l4 2v-8.54L22 3z\"/></svg>",
    "hide_column": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"4\" y=\"3\" width=\"16\" height=\"18\" rx=\"2\"/><path d=\"M10 3v18\"/><path d=\"m2 2 20 20\"/></svg>",
    "sort_asc": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M11 5h10\"/><path d=\"M11 9h7\"/><path d=\"M11 13h4\"/><path d=\"m3 17 3 3 3-3\"/><path d=\"M6 18V4\"/></svg>"
};

/** The part of a menu style map this module writes. */
export interface ContextMenuStyles {
    [key: string]: Record<string, string>
}

/**
 * Re-point the engine's inline menu styles at the block palette.
 *
 * `MenuManager` applies these as **inline** styles, so a stylesheet cannot theme
 * them; mutating the map it holds is what makes the menu follow dark mode.
 * `ContextMenuPlugin.mergeStyles` keeps the engine's layout keys, so only the
 * colours are replaced here.
 */
export function themeContextMenuStyles(styles: ContextMenuStyles, tokens: ThemeTokens): void {
    const merge = (key: string, patch: Record<string, string>) => {
        if (styles[key]) Object.assign(styles[key], patch)
        else styles[key] = { ...patch }
    }
    merge('menuContainer', { backgroundColor: tokens.menuBg, color: tokens.menuFg })
    merge('submenuContainer', { backgroundColor: tokens.menuBg, color: tokens.menuFg })
    merge('menuItem', { color: tokens.menuFg })
    merge('menuItemHover', { backgroundColor: tokens.hover })
    merge('menuItemDisabled', { color: tokens.headFg })
    merge('menuItemSeparator', { backgroundColor: tokens.line })
    merge('menuItemShortcut', { color: tokens.headFg })
    merge('submenuArrow', { color: tokens.headFg })
    merge('inputContainer', { color: tokens.menuFg })
    merge('inputLabel', { color: tokens.menuFg })
    merge('inputField', {
        borderColor: tokens.line,
        backgroundColor: tokens.cellBg,
        color: tokens.menuFg,
    })
    merge('button', { backgroundColor: tokens.accent })
}

/** True when the document is in dark mode, according to the block's own rules. */
export function prefersDarkMode(container: HTMLElement | null): boolean {
    if (!container) return false
    if (typeof getComputedStyle !== 'function') return false
    // `sheet.css` themes the block through `.dark .kn-sheet`, so ask the element
    // which cell background it actually resolved to and compare against the
    // light fallback. Cheaper and more reliable than walking ancestors.
    const bg = getComputedStyle(container).getPropertyValue('--kn-sheet-cell-bg').trim()
    if (!bg) return false
    const light = fallbackTokens(false).cellBg
    return bg !== light && isDarkColor(bg)
}

/** Convert an HSL triple (degrees, percent, percent) to 0-255 RGB. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const saturation = s / 100
    const lightness = l / 100
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
    const hue = (((h % 360) + 360) % 360) / 60
    const secondary = chroma * (1 - Math.abs((hue % 2) - 1))
    let r = 0
    let g = 0
    let b = 0
    if (hue < 1) [r, g, b] = [chroma, secondary, 0]
    else if (hue < 2) [r, g, b] = [secondary, chroma, 0]
    else if (hue < 3) [r, g, b] = [0, chroma, secondary]
    else if (hue < 4) [r, g, b] = [0, secondary, chroma]
    else if (hue < 5) [r, g, b] = [secondary, 0, chroma]
    else [r, g, b] = [chroma, 0, secondary]
    const match = lightness - chroma / 2
    return [(r + match) * 255, (g + match) * 255, (b + match) * 255]
}

/**
 * Parse an `rgb()/rgba()/#rgb/#rrggbb/hsl()/hsla()` colour and report whether it
 * is dark. Only needs to be right for the token values this app uses.
 *
 * HSL matters: the block's CSS tokens are declared as `hsl(var(--background))`
 * triples, and `getComputedStyle` reports them back in HSL form, so a reader
 * that only understood rgb/hex silently classified every dark token as light.
 */
export function isDarkColor(color: string): boolean {
    const text = color.trim().toLowerCase()
    let r = 255
    let g = 255
    let b = 255

    const rgb = text.match(/rgba?\(([^)]+)\)/)
    const hsl = text.match(/hsla?\(([^)]+)\)/)
    if (rgb) {
        const parts = rgb[1]!.split(/[\s,/]+/).filter(Boolean).map(Number)
        r = parts[0] ?? 255
        g = parts[1] ?? 255
        b = parts[2] ?? 255
    } else if (hsl) {
        const parts = hsl[1]!.split(/[\s,/]+/).filter(Boolean)
        const h = Number.parseFloat(parts[0] ?? '0')
        const s = Number.parseFloat(parts[1] ?? '0')
        const l = Number.parseFloat(parts[2] ?? '0')
        if (![h, s, l].every(Number.isFinite)) return false
        ;[r, g, b] = hslToRgb(h, s, l)
    } else if (text.startsWith('#')) {
        const hex = text.slice(1)
        const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
        r = Number.parseInt(full.slice(0, 2), 16) || 0
        g = Number.parseInt(full.slice(2, 4), 16) || 0
        b = Number.parseInt(full.slice(4, 6), 16) || 0
    } else {
        return false
    }

    // Rec. 709 relative luminance; 0.5 is the usual light/dark cut for UI surfaces.
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    return luminance < 0.5
}
