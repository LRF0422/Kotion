/**
 * Host whitelist for agent CONTEXT providers (contract decision 3).
 *
 * A context provider reads user data (open page, selection, workspace state)
 * and hands it to the model, so declaring one is not enough: the hosting
 * application must explicitly authorize its id. Everything is denied until it
 * does — a plugin that ships a provider is silently inert, never a data leak.
 *
 * Enforcement lives in PluginManager#resolveAgentCapabilities, at the point
 * provider definitions become capabilities, so an unauthorized provider cannot
 * even be observed by a surface, let alone run.
 *
 * This is deliberately a host bridge, not a plugin-facing API: plugins declare,
 * the app authorizes.
 */

let whitelist: ReadonlySet<string> | null = null

/**
 * Authorize context providers by id. `null` / empty denies everything (the
 * default), which is what an app that has not thought about context exposure
 * should get.
 */
export function setAgentContextWhitelist(ids: readonly string[] | null | undefined): void {
    if (!ids) {
        whitelist = null
        return
    }
    whitelist = new Set(ids.map(id => (id ?? '').trim()).filter(Boolean))
}

/** The current whitelist, or null when nothing is authorized. */
export function getAgentContextWhitelist(): ReadonlySet<string> | null {
    return whitelist
}

/** Whether a context provider id may be exposed to a surface. */
export function isAgentContextAllowed(id: string | undefined | null): boolean {
    if (!id) return false
    return whitelist !== null && whitelist.has(id)
}

/** Clear the whitelist (tests only — the default is already deny-all). */
export function clearAgentContextWhitelist(): void {
    whitelist = null
}
