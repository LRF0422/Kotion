/**
 * Which spreadsheet engine a block renders with.
 *
 * The swap to VTableSheet is a large, user-visible change, so the jspreadsheet
 * adapter stays reachable as a rollback path for one release. The choice is
 * global for now (a build-time default plus a runtime override), because a
 * per-block setting would mean persisting engine choice into the document, and
 * the persisted `workbookData` format must not change.
 */

export type SpreadsheetEngine = 'vtable' | 'jspreadsheet'

/**
 * Build-time default. `VITE_KN_SPREADSHEET_ENGINE=jspreadsheet` reverts the whole
 * app without a code change; anything else (including unset) selects VTable.
 */
export function defaultEngine(envValue: string | undefined): SpreadsheetEngine {
    return String(envValue ?? '').trim().toLowerCase() === 'jspreadsheet'
        ? 'jspreadsheet'
        : 'vtable'
}

let override: SpreadsheetEngine | null = null

/**
 * Read the engine to render with: an explicit override wins, else the build
 * default.
 */
export function resolveEngine(envValue: string | undefined): SpreadsheetEngine {
    return override ?? defaultEngine(envValue)
}

/**
 * Force an engine at runtime, for support and for A/B comparison on a real
 * document. Pass `null` to fall back to the build default.
 *
 * Not persisted, so a reload returns to the default; that is intentional — a
 * sticky override would outlive the incident it was set for.
 */
export function setEngineOverride(next: SpreadsheetEngine | null): void {
    override = next
}

/**
 * Where the host advertises the chosen engine.
 *
 * Read from a global rather than `import.meta.env`: this package compiles to a
 * single UMD bundle with no `vite-env.d.ts`, so it cannot type `import.meta.env`
 * — and plugins in this repo do not read build-time env directly. The host sets
 * it (see docs/VTABLE_MIGRATION.md), and it stays optional: absent means VTable.
 */
export interface EngineHost {
    spreadsheetEngine?: string
}

/** Read the host's choice, if any. */
export function engineFromHost(host: EngineHost | undefined): SpreadsheetEngine | undefined {
    const value = host?.spreadsheetEngine
    if (value === undefined) return undefined
    return defaultEngine(value)
}

/** The global the host sets to roll back. */
export const ENGINE_GLOBAL_KEY = '__KN_SPREADSHEET_ENGINE__'
