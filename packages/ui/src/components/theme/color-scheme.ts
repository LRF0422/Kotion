/**
 * Color scheme engine — runtime "skinning" on top of the shadcn CSS-variable system.
 *
 * The base palette lives in globals.css (`:root` / `.dark`). This engine overrides it
 * at runtime by writing INLINE CSS variables on <html>, which win over the stylesheet
 * selectors. Light/dark need different values, so callers pass the resolved mode and the
 * engine applies the matching set. State is persisted to localStorage (key below) and is
 * orthogonal to the light/dark mode (`vite-ui-theme`).
 *
 * Used by ThemeProvider (applies on boot + on mode change) and by the theme plugin's
 * settings UI (writes a new scheme → all subscribers re-apply live).
 */

export type ResolvedMode = "light" | "dark"

/** Map of CSS variable name → HSL triple string, e.g. `{ "--primary": "211 90% 48%" }`. */
export type ColorVars = Record<string, string>

export interface ThemePreset {
    id: string
    name: string
    /** Small preview swatch for cards (HSL triple strings). */
    swatch: { bg: string; primary: string }
    /** Variable overrides relative to globals.css. `default` preset leaves both empty. */
    light: ColorVars
    dark: ColorVars
}

export interface ColorScheme {
    /** Selected preset id (see PRESETS). */
    presetId: string
    /** Optional primary-color override as an HSL triple ("h s% l%"). Wins over the preset. */
    accent?: string
}

const STORAGE_KEY = "kn-color-scheme"

/**
 * Every variable the engine may set. On each apply we first remove ALL of these, then set
 * only what the active preset/accent defines — guaranteeing a clean fall-back to globals.css
 * (e.g. when switching back to the `default` preset).
 */
export const MANAGED_VARS: string[] = [
    "--primary",
    "--primary-foreground",
    "--ring",
    "--accent",
    "--accent-foreground",
    "--sidebar-primary",
    "--sidebar-primary-foreground",
    "--sidebar-ring",
    "--chart-1",
    "--chart-2",
    "--chart-3",
    "--chart-4",
    "--chart-5",
]

export const PRESETS: ThemePreset[] = [
    {
        id: "default",
        name: "默认",
        swatch: { bg: "0 0% 100%", primary: "30 6% 16%" },
        light: {},
        dark: {},
    },
    {
        id: "ocean",
        name: "海洋蓝",
        swatch: { bg: "0 0% 100%", primary: "211 90% 48%" },
        light: {
            "--primary": "211 90% 48%",
            "--primary-foreground": "0 0% 100%",
            "--ring": "211 90% 48%",
            "--accent": "211 80% 95%",
            "--accent-foreground": "211 60% 25%",
            "--sidebar-primary": "211 90% 48%",
            "--sidebar-primary-foreground": "0 0% 100%",
            "--sidebar-ring": "211 90% 48%",
            "--chart-1": "211 90% 48%",
            "--chart-2": "190 70% 45%",
            "--chart-3": "230 65% 60%",
        },
        dark: {
            "--primary": "211 85% 62%",
            "--primary-foreground": "211 60% 12%",
            "--ring": "211 85% 62%",
            "--accent": "211 40% 22%",
            "--accent-foreground": "211 80% 88%",
            "--sidebar-primary": "211 85% 62%",
            "--sidebar-primary-foreground": "211 60% 12%",
            "--sidebar-ring": "211 85% 62%",
            "--chart-1": "211 85% 62%",
            "--chart-2": "190 70% 55%",
            "--chart-3": "230 65% 68%",
        },
    },
    {
        id: "forest",
        name: "森林绿",
        swatch: { bg: "0 0% 100%", primary: "152 55% 38%" },
        light: {
            "--primary": "152 55% 38%",
            "--primary-foreground": "0 0% 100%",
            "--ring": "152 55% 38%",
            "--accent": "152 45% 93%",
            "--accent-foreground": "152 50% 22%",
            "--sidebar-primary": "152 55% 38%",
            "--sidebar-primary-foreground": "0 0% 100%",
            "--sidebar-ring": "152 55% 38%",
            "--chart-1": "152 55% 38%",
            "--chart-2": "173 58% 39%",
            "--chart-3": "120 40% 50%",
        },
        dark: {
            "--primary": "152 50% 55%",
            "--primary-foreground": "152 60% 10%",
            "--ring": "152 50% 55%",
            "--accent": "152 30% 20%",
            "--accent-foreground": "152 60% 85%",
            "--sidebar-primary": "152 50% 55%",
            "--sidebar-primary-foreground": "152 60% 10%",
            "--sidebar-ring": "152 50% 55%",
            "--chart-1": "152 50% 55%",
            "--chart-2": "173 58% 50%",
            "--chart-3": "120 40% 58%",
        },
    },
    {
        id: "sunset",
        name: "暖橙",
        swatch: { bg: "0 0% 100%", primary: "24 90% 52%" },
        light: {
            "--primary": "24 90% 52%",
            "--primary-foreground": "0 0% 100%",
            "--ring": "24 90% 52%",
            "--accent": "24 90% 95%",
            "--accent-foreground": "24 70% 30%",
            "--sidebar-primary": "24 90% 52%",
            "--sidebar-primary-foreground": "0 0% 100%",
            "--sidebar-ring": "24 90% 52%",
            "--chart-1": "24 90% 52%",
            "--chart-2": "43 74% 56%",
            "--chart-3": "12 76% 61%",
        },
        dark: {
            "--primary": "24 85% 60%",
            "--primary-foreground": "24 60% 12%",
            "--ring": "24 85% 60%",
            "--accent": "24 40% 22%",
            "--accent-foreground": "24 80% 85%",
            "--sidebar-primary": "24 85% 60%",
            "--sidebar-primary-foreground": "24 60% 12%",
            "--sidebar-ring": "24 85% 60%",
            "--chart-1": "24 85% 60%",
            "--chart-2": "43 74% 60%",
            "--chart-3": "12 76% 64%",
        },
    },
    {
        id: "violet",
        name: "雅紫",
        swatch: { bg: "0 0% 100%", primary: "262 60% 55%" },
        light: {
            "--primary": "262 60% 55%",
            "--primary-foreground": "0 0% 100%",
            "--ring": "262 60% 55%",
            "--accent": "262 60% 95%",
            "--accent-foreground": "262 50% 32%",
            "--sidebar-primary": "262 60% 55%",
            "--sidebar-primary-foreground": "0 0% 100%",
            "--sidebar-ring": "262 60% 55%",
            "--chart-1": "262 60% 55%",
            "--chart-2": "291 60% 55%",
            "--chart-3": "220 65% 60%",
        },
        dark: {
            "--primary": "262 70% 70%",
            "--primary-foreground": "262 60% 12%",
            "--ring": "262 70% 70%",
            "--accent": "262 35% 24%",
            "--accent-foreground": "262 70% 88%",
            "--sidebar-primary": "262 70% 70%",
            "--sidebar-primary-foreground": "262 60% 12%",
            "--sidebar-ring": "262 70% 70%",
            "--chart-1": "262 70% 70%",
            "--chart-2": "291 60% 68%",
            "--chart-3": "220 65% 68%",
        },
    },
]

/** Curated, readable primary colors for the quick-pick row (HSL triple strings). */
export const ACCENT_SWATCHES: string[] = [
    "211 90% 48%", // blue
    "152 55% 38%", // green
    "24 90% 52%", // orange
    "262 60% 55%", // violet
    "340 75% 55%", // pink
    "0 72% 51%", // red
    "47 95% 50%", // amber
    "190 80% 42%", // teal
]

export const DEFAULT_SCHEME: ColorScheme = { presetId: "default" }

function getPreset(id: string): ThemePreset {
    return PRESETS.find((p) => p.id === id) || PRESETS[0]
}

/* ------------------------------------------------------------------ color math */

/** Parse "#rrggbb" → [r,g,b] in 0..255, or null if not a valid hex color. */
function hexToRgb(hex: string): [number, number, number] | null {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
    if (!m) return null
    const int = parseInt(m[1], 16)
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

/** Convert "#rrggbb" → an HSL triple string "h s% l%" matching the CSS-variable format. */
export function hexToHsl(hex: string): string | null {
    const rgb = hexToRgb(hex)
    if (!rgb) return null
    const [r, g, b] = rgb.map((v) => v / 255)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    let h = 0
    let s = 0
    const d = max - min
    if (d !== 0) {
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0)
                break
            case g:
                h = (b - r) / d + 2
                break
            default:
                h = (r - g) / d + 4
        }
        h /= 6
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

/** Convert an HSL triple string "h s% l%" → "#rrggbb" (for native <input type=color>). */
export function hslToHex(hsl: string): string {
    const m = /^\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*$/.exec(hsl)
    if (!m) return "#000000"
    const h = parseFloat(m[1]) / 360
    const s = parseFloat(m[2]) / 100
    const l = parseFloat(m[3]) / 100
    const hue = (p: number, q: number, t: number) => {
        if (t < 0) t += 1
        if (t > 1) t -= 1
        if (t < 1 / 6) return p + (q - p) * 6 * t
        if (t < 1 / 2) return q
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
        return p
    }
    let r: number
    let g: number
    let b: number
    if (s === 0) {
        r = g = b = l
    } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s
        const p = 2 * l - q
        r = hue(p, q, h + 1 / 3)
        g = hue(p, q, h)
        b = hue(p, q, h - 1 / 3)
    }
    const toHex = (v: number) =>
        Math.round(v * 255)
            .toString(16)
            .padStart(2, "0")
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** Pick a readable foreground (near-black or white) for a given HSL background triple. */
function foregroundFor(hsl: string): string {
    const m = /([\d.]+)%\s*$/.exec(hsl)
    const l = m ? parseFloat(m[1]) : 50
    return l > 60 ? "30 6% 16%" : "0 0% 100%"
}

/* ------------------------------------------------------------------ persistence */

function readStorage(): ColorScheme {
    if (typeof window === "undefined") return DEFAULT_SCHEME
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return DEFAULT_SCHEME
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed.presetId === "string") return parsed as ColorScheme
    } catch {
        /* ignore malformed value */
    }
    return DEFAULT_SCHEME
}

let current: ColorScheme = readStorage()
const listeners = new Set<() => void>()

export function getColorScheme(): ColorScheme {
    return current
}

export function setColorScheme(next: ColorScheme): void {
    current = next
    if (typeof window !== "undefined") {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch {
            /* storage may be unavailable (private mode) — apply in-memory only */
        }
    }
    listeners.forEach((fn) => fn())
}

/** Subscribe to scheme changes. Returns an unsubscribe function. */
export function subscribe(fn: () => void): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
}

/* ------------------------------------------------------------------ apply */

/**
 * Apply the current scheme for the given resolved mode by writing inline CSS variables
 * on <html>. Removes all managed vars first so unset ones fall back to globals.css.
 */
export function applyColorScheme(mode: ResolvedMode): void {
    if (typeof document === "undefined") return
    const root = document.documentElement
    const preset = getPreset(current.presetId)
    const vars = mode === "dark" ? preset.dark : preset.light

    for (const name of MANAGED_VARS) root.style.removeProperty(name)
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value)

    if (current.accent) {
        const fg = foregroundFor(current.accent)
        root.style.setProperty("--primary", current.accent)
        root.style.setProperty("--primary-foreground", fg)
        root.style.setProperty("--ring", current.accent)
        root.style.setProperty("--sidebar-primary", current.accent)
        root.style.setProperty("--sidebar-primary-foreground", fg)
        root.style.setProperty("--sidebar-ring", current.accent)
    }
}
