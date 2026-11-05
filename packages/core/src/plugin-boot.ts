/**
 * Boot policy for plugins that failed to load, and the summary the shell shows.
 *
 * A remote plugin that cannot be fetched, evaluated, activated or planned is a
 * missing feature — a dock panel, an editor node, a menu entry — not a reason to
 * keep the user out of the workspace. The shell therefore boots with whatever did
 * load and reports the rest through one non-blocking toast; it must never
 * reintroduce the hard failure that a single bad artifact used to cause
 * ("Failed to load required plugins: <name>" followed by a retry-only screen).
 *
 * **Both** kinds of failure can leave a document schema incomplete: a known-failed
 * plugin is missing just like an unknown one. The difference is what the shell can
 * say about it. A plugin failure is attributable and actionable ("ai could not be
 * fetched: 404" — retry, update or uninstall it), so it degrades the boot. When the
 * installed-plugin *list itself* cannot be read, the shell cannot even name what is
 * missing and an empty list is indistinguishable from an account with no plugins;
 * that is why `resolvePluginBootOutcome` keeps that one fatal. Readers should not
 * mistake this for "a failed plugin is safe to edit under" — the toast is the
 * mitigation, not a guarantee.
 *
 * This module is the pure half of the policy: the boot decision, plus turning the
 * registry's failure list (names from `PluginInitResult.failedPlugins`, reasons
 * from `PluginInitResult.failures`) into one short, deduped, reason-carrying
 * summary that is safe for a log line and a toast.
 *
 * Kept dependency-free on purpose: the shell formats what the registry reports,
 * and a check script can exercise this without React or i18n.
 */

/** One plugin that did not load, with the reason the registry gave (if any). */
export interface PluginBootFailure {
    /** Name or registry key of the plugin. */
    key: string
    /** Why it was skipped, when the registry knows (see `PluginInitResult.failures`). */
    reason?: string
}

/** The short list a degraded boot reports. */
export interface PluginBootFailureReport {
    /** Distinct plugins that did not load. */
    total: number
    /** The failures that fit the preview, in the order the registry reported them. */
    visible: PluginBootFailure[]
    /** How many failures `visible` leaves out. */
    hidden: number
    /** One-line rendering of `visible`: `name: reason` pairs joined by `; `. */
    summary: string
}

/** How many names a toast can show before it stops being readable. */
export const PLUGIN_BOOT_FAILURE_PREVIEW = 3

/** A toast line is not the place for a stack trace or an HTML error page. */
export const PLUGIN_BOOT_FAILURE_REASON_MAX = 160

/**
 * Upper bound for the whole `summary`, so three long reasons cannot produce a
 * toast taller than the phone. Entries that do not fit are counted in `hidden`.
 */
export const PLUGIN_BOOT_SUMMARY_MAX = 300

/** What the shell may do about the failures it just observed. */
export type PluginBootOutcome =
    /** No failures: mount the shell normally. */
    | 'clean'
    /** Some plugins are missing: mount the shell without them and report them. */
    | 'degraded'
    /** The installed set is unknown: do not mount editable documents at all. */
    | 'fatal'

/** What the shell learned before/while initializing plugins. */
export interface PluginBootSignals {
    /**
     * The installed-plugin list itself could not be read — the request failed, or
     * a 200 answered with something that is not a list. The shell cannot tell
     * which editor contributions the account's plugins would add.
     */
    installedListUnavailable?: boolean
    /** How many plugins the boot round reported as failed to load/activate. */
    failedPlugins?: number
}

/**
 * Decide whether a boot is clean, degraded, or fatal.
 *
 * The invariant this encodes — and what the check pins — is that **plugin-level
 * failures never block the boot**. Only an unreadable installed list does.
 */
export const resolvePluginBootOutcome = (signals: PluginBootSignals = {}): PluginBootOutcome => {
    if (signals.installedListUnavailable) return 'fatal'
    return (signals.failedPlugins ?? 0) > 0 ? 'degraded' : 'clean'
}

const normalizeKey = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const normalizeReason = (value: unknown): string => {
    if (typeof value !== 'string') return ''
    const text = value.replace(/\s+/g, ' ').trim()
    return text.length > PLUGIN_BOOT_FAILURE_REASON_MAX
        ? `${text.slice(0, PLUGIN_BOOT_FAILURE_REASON_MAX - 1).trimEnd()}…`
        : text
}

const renderFailure = (failure: PluginBootFailure): string =>
    failure.reason ? `${failure.key}: ${failure.reason}` : failure.key

/**
 * Merge the registry's two failure views into one list, deduped by key.
 *
 * `failedPlugins` decides the order and membership (it is the stable contract);
 * `failures` only supplies reasons. Reasons for a key the name list does not
 * mention still make it in — a caller may hand over just the diagnostic half —
 * so nothing the registry reported is silently dropped.
 */
export const collectPluginBootFailures = (
    failedPlugins: readonly string[] = [],
    failures: readonly PluginBootFailure[] = [],
): PluginBootFailure[] => {
    const reasons = new Map<string, string>()
    for (const failure of failures) {
        const key = normalizeKey(failure?.key)
        if (!key) continue
        const reason = normalizeReason(failure.reason)
        // Prefer a non-empty reason (a later failure can carry the detail an
        // earlier one lacked), but never let a later stage overwrite a real one:
        // the first failure is the root cause.
        const previous = reasons.get(key)
        if (previous === undefined || (!previous && reason)) reasons.set(key, reason)
    }

    const result: PluginBootFailure[] = []
    const seen = new Set<string>()
    for (const name of failedPlugins) {
        const key = normalizeKey(name)
        if (!key || seen.has(key)) continue
        seen.add(key)
        const reason = reasons.get(key) || undefined
        result.push(reason ? { key, reason } : { key })
    }
    for (const [key, reason] of reasons) {
        if (seen.has(key)) continue
        seen.add(key)
        result.push(reason ? { key, reason } : { key })
    }
    return result
}

/**
 * Build the degraded-boot report for the logs and the toast.
 *
 * `visible` stops at `limit` entries **and** at {@link PLUGIN_BOOT_SUMMARY_MAX}
 * characters, whichever comes first; everything left over is counted in `hidden`
 * so the toast can say "and N more" instead of dropping it silently.
 */
export const summarizePluginBootFailures = (
    failedPlugins: readonly string[] = [],
    failures: readonly PluginBootFailure[] = [],
    options: { limit?: number } = {},
): PluginBootFailureReport => {
    const limit = Math.max(0, Math.trunc(options.limit ?? PLUGIN_BOOT_FAILURE_PREVIEW))
    const all = collectPluginBootFailures(failedPlugins, failures)

    const visible: PluginBootFailure[] = []
    let length = 0
    for (const failure of all) {
        if (visible.length >= limit) break
        const rendered = renderFailure(failure)
        const lengthWithSeparator = visible.length === 0 ? rendered.length : length + 2 + rendered.length
        // Always keep the first entry (the most important one), even if a single
        // name+reason is already over the budget; `normalizeReason` bounds it.
        if (visible.length > 0 && lengthWithSeparator > PLUGIN_BOOT_SUMMARY_MAX) break
        visible.push(failure)
        length = lengthWithSeparator
    }

    return {
        total: all.length,
        visible,
        hidden: all.length - visible.length,
        summary: visible.map(renderFailure).join('; '),
    }
}
