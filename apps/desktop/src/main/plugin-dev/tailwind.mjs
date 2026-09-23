/**
 * Per-plugin Tailwind compilation (dev-server side).
 *
 * The host's Tailwind build scans the workspace, not dynamically-installed
 * plugin projects, so utilities used only by a plugin would not exist. This
 * module compiles exactly the plugin's own utilities with the host's Tailwind
 * theme (so classes and CSS variables match) and hands the CSS back to the
 * bundler, which injects it alongside the plugin.
 */
import { createRequire } from 'node:module'
import { readdir } from 'node:fs/promises'
import { extname, join } from 'node:path'

const require = createRequire(import.meta.url)

const CONTENT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.html'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', 'release', '.git', '.turbo', 'coverage'])

const collectContentFiles = async (dir, acc = []) => {
    let entries
    try {
        entries = await readdir(dir, { withFileTypes: true })
    } catch {
        return acc
    }
    for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) await collectContentFiles(full, acc)
        } else if (CONTENT_EXTENSIONS.has(extname(entry.name))) {
            acc.push(full)
        }
    }
    return acc
}

/** Load the host's Tailwind config (override with KN_TAILWIND_CONFIG). */
export const loadTailwindConfig = (configPath) => {
    const candidates = [configPath, process.env.KN_TAILWIND_CONFIG, '@kn/ui/tailwind.config'].filter(Boolean)
    for (const candidate of candidates) {
        try {
            return { config: require(candidate), from: candidate }
        } catch {
            // try the next candidate
        }
    }
    return { config: null, from: null }
}

/**
 * Compile the plugin's Tailwind utilities.
 *
 * Never throws: CSS is a nice-to-have, so a missing config or a Tailwind error
 * degrades to a warning and the JS build still succeeds.
 */
export const buildPluginCss = async ({ root, configPath } = {}) => {
    const loaded = loadTailwindConfig(configPath)
    if (!loaded.config) {
        return { css: '', warnings: ['Tailwind config not found; plugin CSS was skipped'] }
    }
    let postcss
    let tailwindcss
    try {
        const postcssModule = await import('postcss')
        postcss = postcssModule.default || postcssModule
        const tailwindModule = await import('tailwindcss')
        tailwindcss = tailwindModule.default || tailwindModule
    } catch (error) {
        return { css: '', warnings: ['Tailwind unavailable: ' + error.message] }
    }
    const files = await collectContentFiles(root)
    if (files.length === 0) return { css: '', warnings: [] }
    try {
        // Override content (the plugin's own files) and drop the host safelist:
        // its classes already exist in the host stylesheet, so re-emitting them
        // for every plugin would bloat each bundle.
        const result = await postcss([tailwindcss({ ...loaded.config, content: files, safelist: [] })]).process('@tailwind utilities;', {
            from: undefined,
        })
        // Drop @keyframes: tailwindcss-animate emits enter/exit on every compile,
        // and a style tag appended after the host stylesheet would let one plugin
        // globally override animations the host and other plugins use. The host
        // already ships those keyframes, so plugin animate-* utilities still work.
        const parsed = postcss.parse(result.css)
        parsed.walkAtRules((atRule) => {
            if (atRule.name === 'keyframes' || atRule.name === '-webkit-keyframes') atRule.remove()
        })
        return { css: parsed.toString(), warnings: [] }
    } catch (error) {
        return { css: '', warnings: ['Tailwind compile failed: ' + error.message] }
    }
}
