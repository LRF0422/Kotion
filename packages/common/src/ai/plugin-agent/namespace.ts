/**
 * Agent tool namespacing.
 *
 * Wire name = `{namespace}__{toolName}`. Double underscore, not colon: the
 * OpenAI / Anthropic function-name grammar is `^[a-zA-Z0-9_-]{1,64}$`, so a
 * colon is rejected outright and the total length must stay within 64 chars.
 */

export const AGENT_TOOL_NAMESPACE_SEPARATOR = '__'

/** Provider hard limit for a function name. */
export const AGENT_TOOL_WIRE_NAME_MAX = 64

/**
 * Turn an arbitrary plugin key into a wire-safe namespace segment:
 * lowercase, `[a-z0-9_-]` only, collapsed separators, bounded length.
 */
export function sanitizeNamespaceSegment(input: string): string {
    const cleaned = (input || '')
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^[_-]+|[_-]+$/g, '')
    return cleaned || 'plugin'
}

/** Resolve a plugin's namespace segment (idempotent). */
export function agentNamespace(pluginKey: string): string {
    return sanitizeNamespaceSegment(pluginKey).slice(0, 24)
}

/**
 * Build the model-facing tool name. `localName` is assumed already safe; it is
 * truncated only if the namespace leaves no room.
 */
export function toAgentWireName(pluginKey: string, localName: string): string {
    const ns = agentNamespace(pluginKey)
    const budget = AGENT_TOOL_WIRE_NAME_MAX - ns.length - AGENT_TOOL_NAMESPACE_SEPARATOR.length
    const safeLocal = (localName || 'tool').slice(0, Math.max(1, budget))
    return `${ns}${AGENT_TOOL_NAMESPACE_SEPARATOR}${safeLocal}`
}

/**
 * Map a list of tool names through a plugin's local→wire table. Names that are
 * not local to the plugin pass through unchanged, so cross-plugin references
 * (already-qualified wire names) survive.
 */
export function resolveAgentToolNames(
    names: string[] | undefined,
    localToWire: ReadonlyMap<string, string>,
): string[] | undefined {
    return names?.map(name => localToWire.get(name) ?? name)
}
