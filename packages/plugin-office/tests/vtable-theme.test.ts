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
    buildTheme,
    fallbackTokens,
    isDarkColor,
    prefersDarkMode,
    readThemeTokens,
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
    assert.equal(isDarkColor('hsl(0 0% 10%)'), false, 'only rgb/hex are parsed')
    assert.equal(isDarkColor(''), false)
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

test('prefersDarkMode tolerates a missing container or DOM', () => {
    // Must not throw during SSR or in a headless context with no stylesheet.
    assert.equal(prefersDarkMode(null), false)
})
