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
        menuStyle: {
            color: tokens.menuFg,
            bgColor: tokens.menuBg,
            highlightColor: tokens.accent,
        },
    }
}

/** True when the document is in dark mode, according to the block's own rules. */
export function prefersDarkMode(container: HTMLElement | null): boolean {
    if (!container) return false
    if (typeof getComputedStyle !== 'function') return false
    // `sheet.css` themes the block through `.dark .kn-sheet` or `.kn-sheet.jss-dark`,
    // so ask the element which cell background it actually resolved to and compare
    // against the light fallback. Cheaper and more reliable than walking ancestors.
    const bg = getComputedStyle(container).getPropertyValue('--kn-sheet-cell-bg').trim()
    if (!bg) return false
    const light = fallbackTokens(false).cellBg
    return bg !== light && isDarkColor(bg)
}

/**
 * Parse an `rgb()/rgba()/#rgb/#rrggbb/hsl()` colour and report whether it is
 * dark. Only needs to be right for the token values this app uses.
 */
export function isDarkColor(color: string): boolean {
    const text = color.trim().toLowerCase()
    let r = 255
    let g = 255
    let b = 255

    const rgb = text.match(/rgba?\(([^)]+)\)/)
    if (rgb) {
        const parts = rgb[1]!.split(/[\s,/]+/).filter(Boolean).map(Number)
        r = parts[0] ?? 255
        g = parts[1] ?? 255
        b = parts[2] ?? 255
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
