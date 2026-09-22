/**
 * Style translation for the VTableSheet adapter.
 *
 * The persisted model stores styles as **CSS declaration text** (`"font-weight:
 * bold; background-color: #ff0"`) keyed by A1 reference. VTable wants a style
 * object with its own property names (`{ fontWeight: 'bold', bgColor: '#ff0' }`),
 * registered once and then arranged onto cells/roles.
 *
 * The two vocabularies only partly overlap, so the mapping is an explicit
 * allow-list rather than a mechanical key rename:
 *
 * - VTable-expressible: bold, italic, underline, colours, font size, alignment.
 * - Ours only: the `--kn-cell-border` trick that pins borders against the
 *   editor's table rules. It has no VTable equivalent (`border` goes through
 *   VTable's own border model), so it is dropped on the way in and never
 *   round-tripped. Documented in the migration plan as a known loss.
 *
 * Kept free of runtime imports so the Node test runner can load it.
 */

/** The subset of CSS declarations this adapter understands, in both directions. */
interface StyleKeyMap {
    /** CSS declaration name. */
    css: string
    /** VTable style property name. */
    vtable: string
    /** How a CSS value maps to a VTable value. */
    toVTable: (value: string) => unknown
    /** How a VTable value maps back to a CSS value. */
    fromVTable: (value: unknown) => string | null
}

const identity = (value: string): unknown => value
const asString = (value: unknown): string | null =>
    typeof value === "string" && value !== "" ? value : null
const asNumberString = (value: unknown): string | null => {
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
    if (typeof value === "string" && value.trim() !== "") return value.trim()
    return null
}

/**
 * Font-weight is the one property whose vocabulary genuinely differs: CSS uses
 * the keyword (or a numeric weight), VTable uses `'bold' | 'normal'`.
 */
const toBold = (value: string): unknown => (value.trim() === "bold" || Number(value) >= 600 ? "bold" : "normal")
const fromBold = (value: unknown): string | null => (value === "bold" ? "bold" : value === "normal" ? "normal" : null)

const STYLE_KEYS: StyleKeyMap[] = [
    { css: "font-weight", vtable: "fontWeight", toVTable: toBold, fromVTable: fromBold },
    {
        css: "font-style",
        vtable: "fontStyle",
        toVTable: (value) => (value.trim() === "italic" ? "italic" : "normal"),
        fromVTable: (value) => (value === "italic" ? "italic" : value === "normal" ? "normal" : null),
    },
    {
        css: "text-decoration",
        vtable: "textDecoration",
        toVTable: (value) => (value.includes("underline") ? "underline" : "none"),
        fromVTable: (value) => (value === "underline" ? "underline" : value === "none" ? "none" : null),
    },
    { css: "font-size", vtable: "fontSize", toVTable: identity, fromVTable: asNumberString },
    { css: "color", vtable: "color", toVTable: identity, fromVTable: asString },
    { css: "background-color", vtable: "bgColor", toVTable: identity, fromVTable: asString },
    {
        css: "text-align",
        vtable: "textAlign",
        toVTable: (value) => value.trim(),
        fromVTable: (value) => (value === "left" || value === "center" || value === "right" ? value : null),
    },
]

/** CSS declaration text → VTable style object. Unknown declarations are dropped. */
export function toVTableStyle(cssText: string | undefined): Record<string, unknown> | undefined {
    if (!cssText) return undefined
    const declarations = parseDeclarations(cssText)
    const style: Record<string, unknown> = {}
    for (const key of STYLE_KEYS) {
        const raw = declarations[key.css]
        if (raw === undefined || raw === "") continue
        style[key.vtable] = key.toVTable(raw)
    }
    return Object.keys(style).length > 0 ? style : undefined
}

/** VTable style object → CSS declaration text, for re-seeding the toolbar. */
export function fromVTableStyle(style: Record<string, unknown> | undefined | null): string {
    if (!style || typeof style !== "object") return ""
    const parts: string[] = []
    for (const key of STYLE_KEYS) {
        const value = key.fromVTable(style[key.vtable])
        if (value) parts.push(`${key.css}: ${value}`)
    }
    return parts.join("; ")
}

/**
 * Toolbar style → VTable, preserving "clear this property" intent.
 *
 * The toolbar sends `null` to mean "remove this declaration", which is different
 * from "leave it alone": an explicit `normal`/`none` has to be written so the
 * cell actually stops being bold rather than inheriting the previous style.
 */
export function toVTableStylePatch(
    patch: Record<string, string | null>,
): Record<string, unknown> | undefined {
    const style: Record<string, unknown> = {}
    for (const [cssName, value] of Object.entries(patch)) {
        const key = STYLE_KEYS.find((candidate) => candidate.css === cssName)
        if (!key) continue
        if (value === null || value === "") {
            // Reset to the neutral value for this property.
            style[key.vtable] = key.fromVTable(undefined) ?? neutralValue(key.vtable)
            continue
        }
        style[key.vtable] = key.toVTable(value)
    }
    return Object.keys(style).length > 0 ? style : undefined
}

/** The value that means "this property is off" in VTable's vocabulary. */
function neutralValue(vtableKey: string): unknown {
    switch (vtableKey) {
        case "fontWeight":
        case "fontStyle":
            return "normal"
        case "textDecoration":
            return "none"
        default:
            return undefined
    }
}

/**
 * Merge a previously captured style with a new patch.
 *
 * Applying bold to an already-italic cell must not drop the italic: VTable's
 * `arrangeCustomCellStyle` replaces the arranged style wholesale, so the adapter
 * has to merge against the cell's current declarations first.
 */
export function mergeStyleText(
    current: string | undefined,
    patch: Record<string, string | null>,
): string | undefined {
    const merged = parseDeclarations(current)
    for (const [cssName, value] of Object.entries(patch)) {
        if (value === null || value === "") delete merged[cssName]
        else merged[cssName] = value
    }
    const text = Object.entries(merged)
        .map(([key, value]) => `${key}: ${value}`)
        .join("; ")
    return text || undefined
}

/**
 * `"a: b; c: d"` → `{ a: 'b', c: 'd' }`.
 *
 * Deliberately a near-copy of `grid-utils.textToStyle` rather than an import:
 * this module must stay import-free for the Node test runner, and the format is
 * a three-line contract pinned by tests on both sides.
 */
export function parseDeclarations(cssText: string | undefined): Record<string, string> {
    const out: Record<string, string> = {}
    if (!cssText) return out
    String(cssText)
        .split(";")
        .forEach((part) => {
            const index = part.indexOf(":")
            if (index <= 0) return
            const key = part.slice(0, index).trim().toLowerCase()
            const value = part.slice(index + 1).trim()
            if (key && value) out[key] = value
        })
    return out
}
