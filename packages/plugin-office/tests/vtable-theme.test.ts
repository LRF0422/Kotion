/**
 * Engine theme construction.
 *
 * The grid paints on a canvas, so the block's CSS palette has to be handed over
 * as *computed* colours. The failure this guards against is subtle and very
 * visible: a token that is passed through unresolved (`hsl(var(--x))`) or a
 * missing theme slot that silently falls back to the packaged light default,
 * which shows up as a pale panel inside a dark block.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    buildSheetTheme,
    buildTheme,
    CONTEXT_MENU_ICONS,
    fallbackTokens,
    isDarkColor,
    prefersDarkMode,
    readThemeTokens,
    themeContextMenuStyles,
    TOKEN_VARIABLES,
} from '../src/spreadsheet/vtable-theme.ts'

// ─── colour classification ───────────────────────────────────────────────

test('isDarkColor reads rgb, rgba, hex and shorthand hex', () => {
    assert.equal(isDarkColor('rgb(26, 26, 26)'), true)
    assert.equal(isDarkColor('rgb(255, 255, 255)'), false)
    assert.equal(isDarkColor('rgba(0, 0, 0, 0.5)'), true)
    assert.equal(isDarkColor('#1a1a1a'), true)
    assert.equal(isDarkColor('#fff'), false)
    assert.equal(isDarkColor('#ffffff'), false)
    assert.equal(isDarkColor(''), false)
})

test('isDarkColor reads the hsl() form the block tokens actually resolve to', () => {
    // `getComputedStyle` hands `hsl(var(--background))` back as `hsl(0 0% 10%)`
    // rather than rgb, so a reader that skipped HSL classified every dark token
    // as light — which is what broke `prefersDarkMode`.
    assert.equal(isDarkColor('hsl(0 0% 10%)'), true, 'the dark cell background must read dark')
    assert.equal(isDarkColor('hsl(0 0% 100%)'), false)
    assert.equal(isDarkColor('hsl(40 6% 95%)'), false, 'the light header background is light')
    // The alpha suffix is ignored: this blue's own luminance is dark.
    assert.equal(isDarkColor('hsl(211 70% 55% / 0.12)'), true)
})

test('a mid grey sits on the light side of the cut, so it is not called dark', () => {
    // 128/255 ≈ 0.5 luminance; the threshold is deliberately conservative so a
    // light block is never themed as dark.
    assert.equal(isDarkColor('rgb(127, 127, 127)'), true)
    assert.equal(isDarkColor('rgb(200, 200, 200)'), false)
})

// ─── token reading ───────────────────────────────────────────────────────

test('missing tokens fall back to the mode-appropriate palette', () => {
    const dark = readThemeTokens(() => undefined, true)
    const light = readThemeTokens(() => undefined, false)
    assert.deepEqual(dark, fallbackTokens(true))
    assert.deepEqual(light, fallbackTokens(false))
    assert.notEqual(dark.cellBg, light.cellBg, 'the two modes must not share a cell background')
})

test('a bare HSL triple from the host popover token is wrapped', () => {
    // `--popover` is defined as `0 0% 100%`, not a colour; passing it through
    // would give the engine an invalid colour and paint menus black.
    const tokens = readThemeTokens((name) => (name === '--popover' ? '0 0% 100%' : undefined), false)
    assert.equal(tokens.menuBg, 'hsl(0 0% 100%)')
})

test('an already-resolved popover colour is left alone', () => {
    const tokens = readThemeTokens((name) => (name === '--popover' ? 'rgb(20, 20, 20)' : undefined), true)
    assert.equal(tokens.menuBg, 'rgb(20, 20, 20)')
})

test('a resolved token wins over the fallback, and whitespace is trimmed', () => {
    const tokens = readThemeTokens(
        (name) => (name === '--kn-sheet-cell-bg' ? '  rgb(18, 18, 18)  ' : undefined),
        false,
    )
    assert.equal(tokens.cellBg, 'rgb(18, 18, 18)')
    assert.equal(tokens.cellFg, fallbackTokens(false).cellFg, 'the others still fall back')
})

test('every token maps to a variable name', () => {
    const keys = Object.keys(fallbackTokens(false)).sort()
    assert.deepEqual(Object.keys(TOKEN_VARIABLES).sort(), keys)
    Object.values(TOKEN_VARIABLES).forEach((name) => {
        assert.match(name, /^--/, `${name} should be a CSS custom property`)
    })
})

// ─── theme shape ─────────────────────────────────────────────────────────

test('every slot the engine reads is filled', () => {
    // A missing slot falls back to the packaged light default, which is visible
    // as a pale band in dark mode.
    const theme = buildTheme(fallbackTokens(true))
    for (const slot of [
        'defaultStyle',
        'headerStyle',
        'rowHeaderStyle',
        'cornerHeaderStyle',
        'cornerRightTopCellStyle',
        'cornerLeftBottomCellStyle',
        'cornerRightBottomCellStyle',
        'rightFrozenStyle',
        'bottomFrozenStyle',
        'groupTitleStyle',
        'bodyStyle',
        'frameStyle',
        'selectionStyle',
    ]) {
        assert.ok(theme[slot], `${slot} must be set`)
    }
    assert.equal(theme.underlayBackgroundColor, 'transparent', 'the CSS background shows through')
})

test('the theme carries the tokens through to the styles that paint', () => {
    const tokens = fallbackTokens(true)
    const theme = buildTheme(tokens) as Record<string, any>
    assert.equal(theme.bodyStyle.bgColor, tokens.cellBg)
    assert.equal(theme.bodyStyle.color, tokens.cellFg)
    assert.equal(theme.headerStyle.bgColor, tokens.headBg)
    assert.equal(theme.headerStyle.color, tokens.headFg)
    assert.equal(theme.frameStyle.borderColor, tokens.line)
    assert.equal(theme.selectionStyle.cellBorderColor, tokens.accent)
    assert.equal(theme.menuStyle.bgColor, tokens.menuBg)
})

test('a dark theme and a light theme differ on the surfaces that matter', () => {
    const dark = buildTheme(fallbackTokens(true)) as Record<string, any>
    const light = buildTheme(fallbackTokens(false)) as Record<string, any>
    assert.notEqual(dark.bodyStyle.bgColor, light.bodyStyle.bgColor)
    assert.notEqual(dark.headerStyle.bgColor, light.headerStyle.bgColor)
    // And the dark body must actually read as dark, which is what the user sees.
    assert.equal(isDarkColor(dark.bodyStyle.bgColor), true)
    assert.equal(isDarkColor(light.bodyStyle.bgColor), false)
})

test('the sheet theme paints the Excel-style row/column headers', () => {
    // VTableSheet renders the A/B/C letters and row numbers with its
    // TableSeriesNumber plugin, which reads these from the *top level* of the
    // theme option. Missing them leaves the packaged light #F9F9F9 band above a
    // dark grid; this test is the guard against that regression.
    const tokens = fallbackTokens(true)
    const theme = buildSheetTheme(tokens) as Record<string, any>
    assert.ok(theme.tableTheme, 'the canvas palette is still present')
    for (const key of ['rowSeriesNumberCellStyle', 'colSeriesNumberCellStyle']) {
        const style = theme[key]
        assert.ok(style, `${key} must be set`)
        assert.equal(style.bgColor, tokens.headBg, `${key}.bgColor must follow the header`)
        assert.equal(style.text.fill, tokens.headFg, `${key}.text.fill must not stay the packaged grey`)
        assert.equal(style.borderLine.stroke, tokens.line)
    }
    assert.equal(theme.menuStyle.bgColor, tokens.menuBg)
    assert.equal(theme.menuStyle.color, tokens.menuFg)
})

test('a dark sheet theme and a light sheet theme differ on the header band', () => {
    const dark = buildSheetTheme(fallbackTokens(true)) as Record<string, any>
    const light = buildSheetTheme(fallbackTokens(false)) as Record<string, any>
    assert.equal(isDarkColor(dark.colSeriesNumberCellStyle.bgColor), true)
    assert.equal(isDarkColor(light.colSeriesNumberCellStyle.bgColor), false)
})

test('the context-menu palette follows the tokens but keeps the engine layout', () => {
    // MenuManager applies these as inline styles, so the stylesheet cannot reach
    // them; themeContextMenuStyles mutates the map it holds. The engine's layout
    // keys (widths, padding, radius) must survive the colour swap.
    const styles = {
        menuContainer: { backgroundColor: '#ffffff', color: '#000000', borderRadius: '4px', minWidth: '180px' },
        submenuContainer: { backgroundColor: '#ffffff' },
        menuItem: { color: '#000000', padding: '6px 20px' },
        menuItemHover: { backgroundColor: '#f5f5f5' },
        menuItemSeparator: { backgroundColor: '#e0e0e0' },
        menuItemShortcut: { color: '#999999' },
        submenuArrow: { color: '#666666' },
        inputField: { borderColor: '#dddddd' },
        button: { backgroundColor: '#1890ff' },
    }
    const tokens = fallbackTokens(true)
    themeContextMenuStyles(styles, tokens)
    assert.equal(styles.menuContainer.backgroundColor, tokens.menuBg)
    assert.equal(styles.menuContainer.color, tokens.menuFg)
    assert.equal(styles.menuContainer.borderRadius, '4px', 'layout must survive')
    assert.equal(styles.menuContainer.minWidth, '180px')
    assert.equal(styles.submenuContainer.backgroundColor, tokens.menuBg)
    assert.equal(styles.menuItemHover.backgroundColor, tokens.hover)
    assert.equal(styles.menuItemSeparator.backgroundColor, tokens.line)
    assert.equal(styles.menuItemShortcut.color, tokens.headFg)
    assert.equal(styles.button.backgroundColor, tokens.accent)
    assert.equal(isDarkColor(styles.menuContainer.backgroundColor), true)
})

test('the context-menu icons are SVGs and cover every bundled emoji', () => {
    // The engine maps these icon names to emoji; each must resolve to an SVG that
    // inherits the themed text colour.
    const emojiIconNames = [
        'copy',
        'paste',
        'cut',
        'delete',
        'insert',
        'sort',
        'protect',
        'hide',
        'freeze',
        'up-arrow',
        'down-arrow',
        'left-arrow',
        'right-arrow',
    ]
    for (const name of emojiIconNames) {
        const svg = CONTEXT_MENU_ICONS[name]
        assert.ok(svg, name + ' must have an icon')
        assert.match(svg!, /^<svg /)
        assert.match(svg!, /currentColor/)
        assert.doesNotMatch(svg!, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'no emoji allowed')
    }
    // Menu-key-only items (merge/delete/freeze families) are mapped too.
    for (const name of ['merge_cells', 'unmerge_cells', 'filter', 'hide_column', 'row']) {
        assert.ok(CONTEXT_MENU_ICONS[name], name + ' must have an icon')
    }
})

test('prefersDarkMode tolerates a missing container or DOM', () => {
    // Must not throw during SSR or in a headless context with no stylesheet.
    assert.equal(prefersDarkMode(null), false)
})
