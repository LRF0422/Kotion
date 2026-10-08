/**
 * Plugin icon art test.
 *
 * The icon is user-visible artwork that ends up in a marketplace listing, so the
 * things worth pinning are: it is deterministic (the same plugin always gets the
 * same image), it is valid standalone SVG (the listing renders it through
 * `<img src>`, where nothing outside the document resolves), text is escaped and
 * attributes never nest quotes (an unescaped `&` or a raw `"` in an attribute
 * value produces a broken image instead of the icon), and applying it touches
 * exactly the files it claims to.
 *
 * Run: node packages/plugin-plugin-studio/src/icons/icon-art.test.mjs
 */
import {
    PLUGIN_ICON_RELATIVE_PATH,
    applyPluginIcon,
    darken,
    escapeXml,
    filterIconNames,
    glyphForKeyword,
    iconMimeType,
    isUploadableIcon,
    pickColors,
    pickGlyph,
    railIconSnippets,
    readDeclaredIcon,
    renderPluginIconSvg,
    stableHash,
    suggestGlyphs,
    writePluginIconSvg,
} from './icon-art.ts'

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

/* ------------------------------------------------------------------ *
 * Determinism and shapes
 * ------------------------------------------------------------------ */
const art = renderPluginIconSvg({ seed: 'word-count', title: 'Word Count' })
const again = renderPluginIconSvg({ seed: 'word-count', title: 'Word Count' })
check('art: the same plugin always gets the same icon', art.svg === again.svg)
check(
    'art: different plugins get different colours',
    renderPluginIconSvg({ seed: 'alpha' }).color !== renderPluginIconSvg({ seed: 'omega' }).color,
    `${renderPluginIconSvg({ seed: 'alpha' }).color} vs ${renderPluginIconSvg({ seed: 'omega' }).color}`,
)
check('art: keyword picks a fitting glyph', glyphForKeyword('chart') === '📊' && glyphForKeyword('translate') === '🌐')
check(
    'art: the plugin name itself is searched for a keyword',
    renderPluginIconSvg({ seed: 'netease-music' }).glyph === '🎵',
    renderPluginIconSvg({ seed: 'netease-music' }).glyph,
)
check(
    'art: an explicit glyph wins over keywords',
    renderPluginIconSvg({ seed: 'music', glyph: '🚀' }).glyph === '🚀',
)
const initial = pickGlyph({ seed: '1234-unknown-thing' })
check('art: falls back to the first character', initial.isInitial === true && initial.glyph === '1', JSON.stringify(initial))
check(
    'art: an explicit colour is respected, and darkened for the gradient',
    pickColors({ seed: 'x', color: '#3366ff' }).color === '#3366ff'
        && pickColors({ seed: 'x', color: '#3366ff' }).colorTo === darken('#3366ff'),
)
check('art: an invalid colour falls back to the palette', pickColors({ seed: 'x', color: 'red' }).color.startsWith('#'))

check(
    'svg: is self-contained (no external refs)',
    art.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')
        && art.svg.includes('viewBox="0 0 512 512"')
        && art.svg.includes('<linearGradient')
        && art.svg.includes('<rect width="512" height="512"')
        && art.svg.trim().endsWith('</svg>')
        && !art.svg.includes('<image'),
)

/**
 * Well-formedness probe for this document shape: after an attribute's closing
 * quote must come whitespace, `/` or `>` — never a bare letter, which is what
 * a nested quote leaves behind. `font-family=""Apple Color Emoji"…` was
 * emitted once and made the SVG invalid XML, so the studio preview and the
 * marketplace both showed a broken image.
 */
const attributesWellFormed = (svg) => !/[a-zA-Z-]+="[^"]*"[^\s/>]/.test(svg)
check(
    'svg: every attribute is a single quoted token (no nested quotes)',
    attributesWellFormed(art.svg)
        && attributesWellFormed(renderPluginIconSvg({ seed: 'gitlab' }).svg)
        && attributesWellFormed(renderPluginIconSvg({ seed: 'a', title: 'A "quoted" & <odd> name' }).svg),
)
check(
    'svg: declares the emoji font stack in single quotes',
    art.svg.includes(`font-family="'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif"`),
)
check('svg: carries an accessible name', art.svg.includes('<title>Word Count</title>') && art.svg.includes('role="img"'))
check('svg: draws the glyph', art.svg.includes(`>${art.glyph}</text>`))
check(
    'svg: escapes text that would break the document',
    escapeXml(`A & B <x> "y" 'z'`) === 'A &amp; B &lt;x&gt; &quot;y&quot; &apos;z&apos;'
        && renderPluginIconSvg({ seed: 'a', title: 'A & B <C>' }).svg.includes('A &amp; B &lt;C&gt;'),
)
check(
    'svg: an initial is drawn bold in white, an emoji is not',
    renderPluginIconSvg({ seed: '42xyzzy' }).svg.includes('font-weight="700" fill="#ffffff"')
        && !renderPluginIconSvg({ seed: 'chart' }).svg.includes('font-weight="700"'),
)

check('hash: stable and non-negative', stableHash('abc') === stableHash('abc') && stableHash('abc') >= 0)
check(
    'suggest: keywords map to emoji, and a query filters them',
    suggestGlyphs('chart').some((entry) => entry.glyph === '📊')
        && suggestGlyphs('chart').length < suggestGlyphs('').length,
)

/* ------------------------------------------------------------------ *
 * Rail icons
 * ------------------------------------------------------------------ */
const snippets = railIconSnippets('ChartLine', '📊')
check(
    'rail: snippets are paste-ready',
    snippets.importLine === "import { ChartLine } from '@kn/icon'"
        && snippets.createElement.includes('React.createElement(ChartLine')
        && snippets.jsx === '<ChartLine className="h-4 w-4" />'
        && snippets.emoji.includes('📊'),
)
check(
    'names: only PascalCase components survive, filtered by query',
    filterIconNames(['ChartLine', 'createLucideIcon', 'default', 'chart-bar', 'ChartBar'], 'chart').join(',') === 'ChartLine,ChartBar',
)
check('names: honours the limit', filterIconNames(['Aa', 'Ab', 'Ac'], '', 2).length === 2)

/* ------------------------------------------------------------------ *
 * Applying it to a project
 * ------------------------------------------------------------------ */
const files = new Map()
const io = {
    async readFile({ path }) {
        if (!files.has(path)) throw new Error('ENOENT ' + path)
        return files.get(path)
    },
    async writeFile({ path, contents }) {
        files.set(path, contents)
    },
}

const ROOT = '/projects/my-plugin'
const manifestPath = `${ROOT}/package.json`
const entryPath = `${ROOT}/src/index.tsx`
const reset = (manifest, entry) => {
    files.clear()
    files.set(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
    if (entry !== undefined) files.set(entryPath, entry)
}

/* The scaffold's shape: the rail icon is an emoji span. */
reset(
    { name: 'my-plugin', knPluginStudio: { pluginKey: 'my-plugin', displayName: 'My Plugin', entry: 'src/index.tsx' } },
    `import { KPlugin } from '@kn/common'\nimport React from 'react'\n\nexport const p = new KPlugin({\n    dockPanels: [\n        { id: 'p', title: 'P', icon: React.createElement('span', null, '🛠'), component: Panel },\n    ],\n})\n`,
)
const applied = await applyPluginIcon({ root: ROOT, seed: 'my-plugin', keywords: ['chart'], io })
check(
    'apply: writes the artwork where the manifest points',
    applied.relativePath === PLUGIN_ICON_RELATIVE_PATH
        && files.get(`${ROOT}/${PLUGIN_ICON_RELATIVE_PATH}`) === applied.svg
        && applied.svg.includes('📊'),
    applied.relativePath,
)
const writtenManifest = JSON.parse(files.get(manifestPath))
check(
    'apply: points knPluginStudio.icon at it without dropping the rest',
    writtenManifest.knPluginStudio.icon === PLUGIN_ICON_RELATIVE_PATH
        && writtenManifest.knPluginStudio.pluginKey === 'my-plugin'
        && writtenManifest.knPluginStudio.entry === 'src/index.tsx',
    JSON.stringify(writtenManifest.knPluginStudio),
)
check(
    'apply: swaps the scaffold emoji rail icon for the same glyph',
    applied.railIcon.updated === true
        && applied.railIcon.status === 'updated'
        && files.get(entryPath).includes("React.createElement('span', null, '📊')"),
    files.get(entryPath).split('\n').find((line) => line.includes('icon:')),
)
check(
    'apply: reports the previous icon so a regeneration is visible',
    applied.manifest.previous === null && applied.manifest.block === 'knPluginStudio',
)

/* A hand-made rail icon must NOT be rewritten. */
reset(
    { name: 'my-plugin', knPluginStudio: { pluginKey: 'my-plugin', entry: 'src/index.tsx' } },
    `import { ChartLine } from '@kn/icon'\nexport const p = { dockPanels: [{ id: 'p', icon: React.createElement(ChartLine, { className: 'h-4 w-4' }), component: Panel }] }\n`,
)
const kept = await applyPluginIcon({ root: ROOT, seed: 'my-plugin', io })
check(
    'apply: leaves a hand-made rail icon alone, and supplies the snippet',
    kept.railIcon.updated === false
        && kept.railIcon.status === 'no-match'
        && files.get(entryPath).includes('ChartLine')
        && kept.railIcon.snippet.includes('React.createElement'),
    kept.railIcon.status,
)
check(
    'apply: disabling the source patch reports why',
    (await applyPluginIcon({ root: ROOT, seed: 'my-plugin', io, apply: false })).railIcon.status === 'disabled',
)

/* A legacy knPlugin block is updated where it lives. */
reset({ name: 'legacy', knPlugin: { pluginKey: 'legacy' } }, undefined)
const legacy = await applyPluginIcon({ root: ROOT, seed: 'legacy', io })
check(
    'apply: legacy knPlugin projects stay in their own block',
    legacy.manifest.block === 'knPlugin'
        && JSON.parse(files.get(manifestPath)).knPlugin.icon === PLUGIN_ICON_RELATIVE_PATH
        && JSON.parse(files.get(manifestPath)).knPluginStudio === undefined,
)
check('apply: a missing entry file is reported, not fatal', legacy.railIcon.status === 'no-entry', legacy.railIcon.status)

/* A directory that is not a project is refused. */
files.clear()
let refused = ''
try {
    await applyPluginIcon({ root: '/nope', seed: 'nope', io })
} catch (error) {
    refused = error.message
}
check('apply: refuses a directory without a manifest', /无法读取工程清单/.test(refused), refused)

/* ------------------------------------------------------------------ *
 * Applying externally designed artwork (the AI designer's output)
 * ------------------------------------------------------------------ */
const aiArtwork = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
    '  <rect width="512" height="512" rx="112" fill="#6366f1"/>',
    '  <circle cx="256" cy="256" r="96" fill="#ffffff" fill-opacity="0.9"/>',
    '</svg>',
].join('\n')

/* Same file/manifest contract as the deterministic path, minus the rail swap. */
reset({ name: 'ai-made', keep: true, knPluginStudio: { pluginKey: 'ai-made', displayName: 'AI Made', entry: 'src/index.tsx' } })
const aiApplied = await writePluginIconSvg({ root: ROOT, io, svg: aiArtwork })
const aiManifest = JSON.parse(files.get(manifestPath))
check(
    'ai: writes the artwork under the same file/manifest contract',
    aiApplied.manifest.block === 'knPluginStudio'
        && aiApplied.manifest.previous === null
        && files.get(`${ROOT}/${PLUGIN_ICON_RELATIVE_PATH}`) === aiArtwork + '\n'
        && aiManifest.knPluginStudio.icon === PLUGIN_ICON_RELATIVE_PATH
        && aiManifest.knPluginStudio.pluginKey === 'ai-made'
        && aiManifest.keep === true,
    aiApplied.relativePath,
)

/* A legacy knPlugin block is updated where it lives, like applyPluginIcon. */
reset({ name: 'legacy-ai', knPlugin: { pluginKey: 'legacy-ai' } }, undefined)
const legacyAi = await writePluginIconSvg({ root: ROOT, io, svg: aiArtwork })
check(
    'ai: a legacy knPlugin project stays in its own block',
    legacyAi.manifest.block === 'knPlugin'
        && JSON.parse(files.get(manifestPath)).knPlugin.icon === PLUGIN_ICON_RELATIVE_PATH
        && JSON.parse(files.get(manifestPath)).knPluginStudio === undefined,
)
check(
    'ai: reports the icon it replaced',
    (await writePluginIconSvg({ root: ROOT, io, svg: aiArtwork })).manifest.previous === PLUGIN_ICON_RELATIVE_PATH,
)

let refusedSvg = ''
try {
    await writePluginIconSvg({ root: ROOT, io, svg: '<div>not an svg</div>' })
} catch (error) {
    refusedSvg = error.message
}
check('ai: refuses an incomplete document', /图标 SVG 不完整/.test(refusedSvg), refusedSvg)

/* ------------------------------------------------------------------ *
 * Publishing helpers
 * ------------------------------------------------------------------ */
check(
    'publish: reads the declared icon from either block',
    readDeclaredIcon(JSON.stringify({ knPluginStudio: { icon: 'assets/icon.svg' } })) === 'assets/icon.svg'
        && readDeclaredIcon(JSON.stringify({ knPlugin: { icon: 'assets/a.png' } })) === 'assets/a.png'
        && readDeclaredIcon('{ not json') === null
        && readDeclaredIcon(JSON.stringify({ knPluginStudio: {} })) === null,
)
check(
    'publish: only project files are uploadable',
    isUploadableIcon('assets/icon.svg') === true
        && isUploadableIcon('/oss/plugins/icon.png') === true
        && isUploadableIcon('https://cdn.example.com/i.png') === false
        && isUploadableIcon('data:image/svg+xml,<svg/>') === false
        && isUploadableIcon(null) === false,
)
check(
    'publish: mime type follows the extension',
    iconMimeType('icon.svg') === 'image/svg+xml'
        && iconMimeType('ICON.PNG') === 'image/png'
        && iconMimeType('icon.webp') === 'image/webp'
        && iconMimeType('icon.bin') === 'application/octet-stream',
)

const failedChecks = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed`)
process.exit(failedChecks.length ? 1 : 0)
