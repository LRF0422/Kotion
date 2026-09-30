/**
 * Plugin icon rendering — deterministic, offline, React-free, import-free.
 *
 * A plugin needs two icons and they are NOT the same thing:
 *
 *  - the **rail icon** the app renders (`dockPanels[].icon`): a ReactNode in
 *    source, so the studio can only hand the author a snippet with a real,
 *    existing icon name (`railIconSnippets` + `listPluginIcons` do that);
 *  - the **marketplace icon**: an uploaded *image* — the publish wizard renders
 *    it as `<img src={resolvePath(icon)}>`, so an emoji string would break.
 *
 * This module produces the second one for real: a self-contained SVG built from
 * a glyph (emoji) and a colour, both derived from the plugin's own name and
 * purpose keywords. Deterministic on purpose — the same plugin always gets the
 * same icon, which is what makes it reviewable, diffable and testable. No
 * network, no API key, no image encoder.
 *
 * It also owns applying that icon to a project (`applyPluginIcon`), with the
 * file operations injected so the agent tool, the dock panel and the tests all
 * run the same rules.
 *
 * Deliberately free of imports: `icon-art.test.mjs` and `studio-tools.test.mjs`
 * import this file directly (Node cannot resolve an extensionless TS→TS import),
 * and the tool layer receives it as an injected toolkit.
 */

/** Where the generated asset lives inside a project, and what the manifest says. */
export const PLUGIN_ICON_DIR = 'assets'
export const PLUGIN_ICON_FILE = 'icon.svg'
export const PLUGIN_ICON_RELATIVE_PATH = `${PLUGIN_ICON_DIR}/${PLUGIN_ICON_FILE}`

/** Canvas size of the generated artwork (the SVG scales to anything). */
export const PLUGIN_ICON_SIZE = 512

/**
 * Purpose keyword → glyph.
 *
 * The glyph is what makes an icon "suitable" without asking a model: a chart
 * plugin gets a chart, a music plugin gets a note. Keys are matched
 * case-insensitively against the caller's keywords AND the plugin name, so
 * `createPluginProject({ name: 'word-count' })` still lands on 📝.
 */
export const PLUGIN_GLYPH_KEYWORDS: Record<string, string> = {
    chart: '📊', graph: '📊', analytics: '📈', stats: '📈', metric: '📈',
    music: '🎵', audio: '🎵', sound: '🔊', podcast: '🎙️', speech: '🎙️',
    video: '🎬', movie: '🎬', player: '▶️', stream: '📺',
    image: '🖼️', photo: '📷', picture: '🖼️', gallery: '🖼️', camera: '📷', design: '🎨', draw: '🎨', paint: '🎨',
    translate: '🌐', language: '🌐', i18n: '🌐', locale: '🌐', globe: '🌐',
    github: '🐙', git: '🐙', code: '💻', dev: '💻', developer: '💻', script: '💻', api: '🔌', plugin: '🧩', sdk: '🔌',
    calendar: '📅', schedule: '📅', date: '📅', time: '⏰', clock: '⏰', timer: '⏱️', pomodoro: '⏱️',
    task: '✅', todo: '✅', check: '✅', kanban: '🗂️', board: '🗂️', project: '🗂️',
    book: '📚', note: '📝', doc: '📄', document: '📄', page: '📄', wiki: '📚', read: '📖', markdown: '📝', word: '📝', count: '🔢',
    mail: '✉️', email: '✉️', message: '💬', chat: '💬', comment: '💬', chatbot: '🤖',
    ai: '🤖', assistant: '🤖', agent: '🤖', llm: '🤖', model: '🧠', ml: '🧠',
    map: '🗺️', location: '📍', geo: '🗺️', travel: '✈️',
    file: '📁', folder: '📁', storage: '🗄️', drive: '🗄️', upload: '⬆️', download: '⬇️', sync: '🔄',
    search: '🔍', find: '🔍', explore: '🔍',
    weather: '⛅', finance: '💰', money: '💰', crypto: '🪙', price: '💰', trade: '📉',
    health: '❤️', fitness: '🏃', food: '🍜', recipe: '🍜', game: '🎮', quiz: '❓',
    link: '🔗', reference: '🔗', backlink: '🔗', table: '🧮', sheet: '🧮', spreadsheet: '🧮', formula: '🧮',
    mind: '🧠', outline: '🧠',
    diagram: '📐', flow: '📐', mermaid: '🧜', excalidraw: '✏️', canvas: '🎨',
    theme: '🎨', style: '🎨', dark: '🌙', light: '☀️', font: '🔤', icon: '✨',
    security: '🔒', auth: '🔑', login: '🔑', privacy: '🔒', permission: '🔒', admin: '🛡️',
    zhihu: '🟦', bilibili: '📺', netease: '🎵', office: '📊', sticky: '🗒️', bitable: '🧮',
    logic: '🧩', voice: '🎙️', transcribe: '📝', tts: '🔊',
}

/**
 * Colour pairs. Chosen for contrast against both light and dark app surfaces
 * (the marketplace renders the icon on a card, not on a fixed background).
 */
export const PLUGIN_ICON_PALETTE: Array<{ from: string; to: string }> = [
    { from: '#6366f1', to: '#4338ca' }, // indigo
    { from: '#0ea5e9', to: '#0369a1' }, // sky
    { from: '#14b8a6', to: '#0f766e' }, // teal
    { from: '#10b981', to: '#047857' }, // emerald
    { from: '#f59e0b', to: '#b45309' }, // amber
    { from: '#ef4444', to: '#b91c1c' }, // red
    { from: '#ec4899', to: '#be185d' }, // pink
    { from: '#8b5cf6', to: '#6d28d9' }, // violet
    { from: '#64748b', to: '#334155' }, // slate
]

/** Stable 32-bit hash (djb2). Same input → same icon, across machines. */
export const stableHash = (value: string): number => {
    let hash = 5381
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0
    }
    return Math.abs(hash)
}

/** XML-escape text destined for the SVG. */
export const escapeXml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')

/** The emoji a keyword maps to, when it maps to one. */
export const glyphForKeyword = (keyword: string): string | undefined => {
    const needle = keyword.trim().toLowerCase()
    if (!needle) return undefined
    if (PLUGIN_GLYPH_KEYWORDS[needle]) return PLUGIN_GLYPH_KEYWORDS[needle]
    // Prefix match so "kanban-board" and "charting" still hit.
    const hit = Object.keys(PLUGIN_GLYPH_KEYWORDS).find((key) => needle.includes(key))
    return hit ? PLUGIN_GLYPH_KEYWORDS[hit] : undefined
}

/** Emoji suggestions for a free-text query (the discovery half). */
export const suggestGlyphs = (query: string, limit = 6): Array<{ keyword: string; glyph: string }> => {
    const needle = query.trim().toLowerCase()
    const entries = Object.entries(PLUGIN_GLYPH_KEYWORDS)
    const matched = needle
        ? entries.filter(([keyword, glyph]) => keyword.includes(needle) || glyph === needle)
        : entries
    const seen = new Set<string>()
    const out: Array<{ keyword: string; glyph: string }> = []
    for (const [keyword, glyph] of matched) {
        if (seen.has(glyph)) continue
        seen.add(glyph)
        out.push({ keyword, glyph })
        if (out.length >= limit) break
    }
    return out
}

export interface PluginIconInput {
    /** Plugin name / key; drives both the fallback glyph and the colour. */
    seed: string
    /** Human title, used for the SVG's accessible name. */
    title?: string
    /** Explicit glyph (an emoji) — wins over keywords. */
    glyph?: string
    /** Explicit base colour (`#rrggbb`) — wins over the palette. */
    color?: string
    /** Purpose keywords ("chart", "translate", …) used to pick a glyph. */
    keywords?: string[]
}

export interface PluginIconArtwork {
    /** The emoji or letter actually drawn. */
    glyph: string
    /** True when the glyph is a single letter (no keyword matched). */
    isInitial: boolean
    /** Base colour used for the gradient's top stop. */
    color: string
    /** Gradient's bottom stop. */
    colorTo: string
    /** The SVG source. */
    svg: string
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** Darken a `#rgb`/`#rrggbb` colour by a fixed factor (for the gradient). */
export const darken = (color: string, factor = 0.42): string => {
    const raw = color.replace('#', '')
    const full = raw.length === 3 ? raw.split('').map((char) => char + char).join('') : raw
    const channels = [0, 2, 4].map((offset) => {
        const value = Number.parseInt(full.slice(offset, offset + 2), 16)
        const next = Math.max(0, Math.min(255, Math.round(value * (1 - factor))))
        return next.toString(16).padStart(2, '0')
    })
    return `#${channels.join('')}`
}

/** The glyph: explicit → keyword hit → first alphanumeric character. */
export const pickGlyph = (input: PluginIconInput): { glyph: string; isInitial: boolean } => {
    const explicit = input.glyph?.trim()
    if (explicit) return { glyph: explicit, isInitial: false }

    const candidates = [...(input.keywords ?? []), input.seed]
    for (const candidate of candidates) {
        const glyph = glyphForKeyword(candidate)
        if (glyph) return { glyph, isInitial: false }
    }

    const initial = (input.seed.match(/[A-Za-z0-9\u4e00-\u9fa5]/) ?? ['P'])[0]
    return { glyph: initial.toUpperCase(), isInitial: true }
}

/** The colour pair: explicit colour → hash of the seed → palette. */
export const pickColors = (input: PluginIconInput): { color: string; colorTo: string } => {
    const explicit = input.color?.trim()
    if (explicit && HEX_COLOR.test(explicit)) {
        return { color: explicit, colorTo: darken(explicit) }
    }
    const entry = PLUGIN_ICON_PALETTE[stableHash(input.seed) % PLUGIN_ICON_PALETTE.length]
    return { color: entry.from, colorTo: entry.to }
}

const EMOJI_FONTS = [
    '"Apple Color Emoji"',
    '"Segoe UI Emoji"',
    '"Noto Color Emoji"',
    'sans-serif',
].join(', ')

/**
 * Render the icon.
 *
 * Self-contained on purpose: no `<image>`, no external font file, no CSS class —
 * the marketplace stores this and renders it through `<img src>`, where nothing
 * outside the document can be resolved.
 */
export const renderPluginIconSvg = (input: PluginIconInput): PluginIconArtwork => {
    const { glyph, isInitial } = pickGlyph(input)
    const { color, colorTo } = pickColors(input)
    const title = input.title?.trim() || input.seed
    const size = PLUGIN_ICON_SIZE
    const radius = Math.round(size * 0.22)
    const fontSize = isInitial ? Math.round(size * 0.5) : Math.round(size * 0.46)

    const svg = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeXml(title)}">`,
        `  <title>${escapeXml(title)}</title>`,
        '  <defs>',
        '    <linearGradient id="plugingradient" x1="0" y1="0" x2="0" y2="1">',
        `      <stop offset="0" stop-color="${color}"/>`,
        `      <stop offset="1" stop-color="${colorTo}"/>`,
        '    </linearGradient>',
        '  </defs>',
        `  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#plugingradient)"/>`,
        `  <rect x="4" y="4" width="${size - 8}" height="${size - 8}" rx="${radius - 4}" fill="none" stroke="#000000" stroke-opacity="0.10" stroke-width="8"/>`,
        `  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="${EMOJI_FONTS}" font-size="${fontSize}"${isInitial ? ' font-weight="700" fill="#ffffff"' : ''}>${escapeXml(glyph)}</text>`,
        '</svg>',
        '',
    ].join('\n')

    return { glyph, isInitial, color, colorTo, svg }
}

/**
 * The exact source snippet for the app-visible rail icon.
 *
 * `dockPanels[].icon` is a ReactNode, so the generated *image* cannot be used
 * there — the author (or the agent) pastes one of these instead, with an icon
 * name that really exists in `@kn/icon`.
 */
export const railIconSnippets = (iconName: string, emoji?: string) => ({
    /** For `src/index.tsx` compiled by the studio's bundler (no JSX transform). */
    createElement: `icon: React.createElement(${iconName}, { className: 'h-4 w-4' }),`,
    /** For a `.tsx` file with the JSX transform. */
    jsx: `<${iconName} className="h-4 w-4" />`,
    /** Emoji form: no import, and it doubles as the marketplace glyph. */
    emoji: emoji ? `icon: React.createElement('span', { className: 'text-base leading-none' }, '${emoji}'),` : '',
    /** The import line that makes the component names above resolve. */
    importLine: `import { ${iconName} } from '@kn/icon'`,
})

/* ------------------------------------------------------------------ *
 * Applying the icon to a project
 *
 * Transport-agnostic: the agent tool passes the desktop dev bridge's
 * read/writeFile, the dock panel passes the same, tests pass a recorder.
 * ------------------------------------------------------------------ */

/** The two file operations this needs — both callers already have them. */
export interface PluginIconIo {
    readFile(options: { path: string }): Promise<string>
    writeFile(options: { path: string; contents: string }): Promise<void>
}

export interface ApplyPluginIconInput {
    /** Absolute project root. */
    root: string
    /** Fallback seed (plugin key / project name) when the manifest has none. */
    seed: string
    io: PluginIconIo
    /** Human title for the SVG's accessible name. */
    title?: string
    /** Explicit glyph (emoji) — wins over keywords. */
    glyph?: string
    /** Explicit base colour (`#rrggbb`). */
    color?: string
    /** Purpose keywords ("chart", "translate", …) used to pick a glyph. */
    keywords?: string[]
    /** Patch the source rail icon too. Defaults to true. */
    apply?: boolean
}

export type PluginIconRailStatus = 'updated' | 'no-match' | 'no-entry' | 'disabled' | 'unreadable'

export interface ApplyPluginIconResult {
    /** Absolute path of the written artwork. */
    iconFile: string
    /** Project-relative path, also what the manifest now declares. */
    relativePath: string
    glyph: string
    /** True when no keyword matched and a letter was drawn instead. */
    isInitial: boolean
    color: string
    colorTo: string
    svg: string
    manifest: {
        updated: boolean
        /** The icon value that was there before, if any. */
        previous: string | null
        /** Manifest block that was written (`knPluginStudio` / legacy `knPlugin`). */
        block: string
    }
    /** The app-visible rail icon (`dockPanels[].icon`). */
    railIcon: {
        updated: boolean
        status: PluginIconRailStatus
        /** The emoji expression to paste when the patch was skipped. */
        snippet: string
    }
}

const trimSlash = (value: string): string => value.replace(/[\\/]+$/, '')

/** Join a project root with a project-relative path, platform-agnostically. */
export const joinProjectPath = (root: string, relative: string): string =>
    `${trimSlash(root)}/${relative.replace(/^[\\/]+/, '')}`

/** The scaffold's emoji rail icon: `icon: React.createElement('span', null, '🛠')`. */
const SPAN_ICON = /(icon:\s*React\.createElement\(\s*['"]span['"]\s*,\s*(?:null|\{\s*\})\s*,\s*['"])([^'"]*)(['"]\s*\))/

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

/**
 * Render the icon, write it to the project, point the manifest at it, and — when
 * the project still carries the scaffold's emoji rail icon — swap that glyph.
 *
 * The rail patch is best-effort by design: a project whose icon the author
 * already hand-made gets the snippet to paste instead of a source rewrite.
 */
export const applyPluginIcon = async (input: ApplyPluginIconInput): Promise<ApplyPluginIconResult> => {
    const { root, io } = input
    if (!root) throw new Error('插件工程根目录不能为空')

    const manifestPath = joinProjectPath(root, 'package.json')
    let manifest: Record<string, unknown>
    try {
        const parsed = asRecord(JSON.parse(await io.readFile({ path: manifestPath })))
        if (!parsed) throw new Error('package.json 不是一个对象')
        manifest = parsed
    } catch (error) {
        throw new Error(`无法读取工程清单 ${manifestPath}：${(error as Error)?.message ?? error}`)
    }

    // Prefer the studio block; keep writing wherever the project already declared
    // its plugin metadata, so a legacy `knPlugin` project stays consistent.
    const studioKey = manifest.knPluginStudio ? 'knPluginStudio' : manifest.knPlugin ? 'knPlugin' : 'knPluginStudio'
    const block = asRecord(manifest[studioKey]) ?? {}
    const seed =
        input.seed
        || (typeof block.pluginKey === 'string' && block.pluginKey)
        || (typeof manifest.name === 'string' && manifest.name)
        || trimSlash(root).split(/[\\/]/).pop()
        || 'plugin'
    const title =
        input.title
        || (typeof block.displayName === 'string' ? block.displayName : undefined)
        || (typeof manifest.name === 'string' ? manifest.name : undefined)
        || seed

    const artwork = renderPluginIconSvg({
        seed,
        title,
        glyph: input.glyph,
        color: input.color,
        keywords: input.keywords,
    })

    // 1) the image the marketplace uploads.
    const iconFile = joinProjectPath(root, PLUGIN_ICON_RELATIVE_PATH)
    await io.writeFile({ path: iconFile, contents: artwork.svg })

    // 2) the manifest pointer.
    const previous = typeof block.icon === 'string' ? block.icon : null
    manifest[studioKey] = { ...block, icon: PLUGIN_ICON_RELATIVE_PATH }
    await io.writeFile({ path: manifestPath, contents: JSON.stringify(manifest, null, 2) + '\n' })

    // 3) the app-visible rail icon, when the scaffold's expression is still there.
    const railSnippet = `icon: React.createElement('span', { className: 'text-base leading-none' }, '${artwork.glyph}'),`
    let railStatus: PluginIconRailStatus = 'no-match'
    if (input.apply === false) {
        railStatus = 'disabled'
    } else {
        const entryRelative =
            (typeof block.entry === 'string' && block.entry)
            || (typeof manifest.source === 'string' && manifest.source)
            || 'src/index.tsx'
        const entryPath = joinProjectPath(root, entryRelative)
        let entrySource: string | undefined
        try {
            entrySource = await io.readFile({ path: entryPath })
        } catch {
            railStatus = 'no-entry'
        }
        if (entrySource !== undefined) {
            if (SPAN_ICON.test(entrySource)) {
                await io.writeFile({ path: entryPath, contents: entrySource.replace(SPAN_ICON, `$1${artwork.glyph}$3`) })
                railStatus = 'updated'
            } else {
                railStatus = 'no-match'
            }
        }
    }

    return {
        iconFile,
        relativePath: PLUGIN_ICON_RELATIVE_PATH,
        glyph: artwork.glyph,
        isInitial: artwork.isInitial,
        color: artwork.color,
        colorTo: artwork.colorTo,
        svg: artwork.svg,
        manifest: { updated: true, previous, block: studioKey },
        railIcon: { updated: railStatus === 'updated', status: railStatus, snippet: railSnippet },
    }
}

/** The manifest field `publishPluginProject` reads to find the icon file. */
export const readDeclaredIcon = (manifestText: string): string | null => {
    try {
        const manifest = asRecord(JSON.parse(manifestText))
        const block = asRecord(manifest?.knPluginStudio) ?? asRecord(manifest?.knPlugin)
        const icon = block?.icon
        return typeof icon === 'string' && icon ? icon : null
    } catch {
        return null
    }
}

/** Content type for an icon file, by extension. */
export const iconMimeType = (fileName: string): string => {
    const lower = fileName.toLowerCase()
    if (lower.endsWith('.svg')) return 'image/svg+xml'
    if (lower.endsWith('.png')) return 'image/png'
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
    if (lower.endsWith('.webp')) return 'image/webp'
    if (lower.endsWith('.gif')) return 'image/gif'
    return 'application/octet-stream'
}

/** True when the declared icon is a project file we can upload (not a URL/data URI). */
export const isUploadableIcon = (icon: string | null): boolean => {
    if (!icon) return false
    if (/^(https?:|data:)/i.test(icon)) return false
    return true
}

/**
 * Component names worth offering as rail icons.
 *
 * `@kn/icon` re-exports lucide + several react-icons sets, so the namespace also
 * contains helpers (`createLucideIcon`, `default`, …). Keep the PascalCase,
 * alphanumeric, reasonably short names — that is what a component looks like.
 */
export const filterIconNames = (names: readonly string[], query: string, limit = 24): string[] => {
    const needle = query.trim().toLowerCase()
    const seen = new Set<string>()
    const out: string[] = []
    for (const name of names) {
        if (typeof name !== 'string') continue
        if (!/^[A-Z][A-Za-z0-9]{1,39}$/.test(name)) continue
        if (seen.has(name)) continue
        seen.add(name)
        if (needle && !name.toLowerCase().includes(needle)) continue
        out.push(name)
        if (out.length >= limit) break
    }
    return out
}
