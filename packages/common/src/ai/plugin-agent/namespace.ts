/**
 * Agent tool naming.
 *
 * **Tools are NOT namespaced.** A plugin's tool reaches the model under its bare
 * local name (`insertChart`, `searchPages`), the same name the plugin declared,
 * the same name the system prompt uses, and the same name the executor is keyed
 * by. There is exactly one name to write down.
 *
 * This replaced the `{namespace}__{toolName}` scheme (see git history). That
 * scheme kept two plugins from colliding on a local name, but it made every
 * plugin tool reachable only through a name no human or prompt ever spelled:
 * the model had to reconstruct `<pluginKey>__` prefixes it never saw written,
 * and when it guessed wrong (`editor_insertBlocks`) a perfectly registered tool
 * answered `TOOL_NOT_FOUND`. The collision it prevented is handled instead where
 * it actually happens: a duplicate local name overwrites with a warning
 * (see PluginManager's tool instantiation).
 *
 * The helpers below remain because they are still the normaliser the routing
 * fallback uses, and because `toAgentWireName` must keep its exported shape for
 * external callers.
 */

/** Joins the parts of a historical namespaced name. Kept for the fallback parser. */
export const AGENT_TOOL_NAMESPACE_SEPARATOR = '__'

/** Provider hard limit for a function name (`^[a-zA-Z0-9_-]{1,64}$`). */
export const AGENT_TOOL_WIRE_NAME_MAX = 64

/**
 * Normalise an arbitrary string into a wire-safe token: lowercase,
 * `[a-z0-9_-]` only, collapsed separators, bounded length.
 */
export function sanitizeNamespaceSegment(input: string): string {
    const cleaned = (input || '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^[_-]+|[_-]+$/g, '')
    return cleaned || 'plugin'
}

/** @deprecated Tools are no longer namespaced; returns the sanitised input. */
export function agentNamespace(pluginKey: string): string {
    return sanitizeNamespaceSegment(pluginKey).slice(0, 24)
}

/**
 * The model-facing name of a plugin tool: **the bare local name**.
 *
 * @deprecated The identity of `localName` — kept so external callers that still
 * pass a plugin key keep compiling. Read the module comment: namespacing was
 * removed because it made tools reachable only by a name nobody ever wrote.
 */
export function toAgentWireName(_pluginKey: string, localName: string): string {
    return (localName || 'tool').slice(0, AGENT_TOOL_WIRE_NAME_MAX)
}

/**
 * Map a list of tool names through a plugin's local→name table. Names that are
 * not local to the plugin pass through unchanged, so cross-plugin references
 * (already-qualified names) survive.
 */
export function resolveAgentToolNames(
    names: string[] | undefined,
    localToWire: ReadonlyMap<string, string>,
): string[] | undefined {
    return names?.map(name => localToWire.get(name) ?? name)
}
