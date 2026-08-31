/**
 * Host-independent descriptor for a remotely loaded plugin artifact.
 *
 * Backend DTOs must be adapted to this shape before they enter the plugin
 * runtime. `PluginManager` still accepts the legacy aliases below so existing
 * published callers continue to work.
 */
export interface RemotePluginDescriptor {
    /** Stable package/plugin key used by the global plugin registry. */
    pluginKey: string
    /** Human-readable runtime plugin name. */
    name: string
    /** Stable artifact version identifier when the backend provides one. */
    versionId?: string | number
    /** Semantic/display version when available. */
    version?: string
    /** Plugin bundle resource path or absolute URL. */
    resourcePath: string
    /** Optional Subresource Integrity hash. */
    integrity?: string
}

interface LegacyPluginVersionDescriptor {
    id?: string | number
    version?: string
    resourcePath?: string
    integrity?: string
}

/**
 * Compatibility input accepted from callers built before
 * `RemotePluginDescriptor` was introduced.
 */
export interface LegacyRemotePluginDescriptor {
    pluginKey?: string
    name?: string
    versionId?: string | number
    version?: string
    resourcePath?: string
    integrity?: string
    /** @deprecated Use versionId. */
    id?: string | number
    /** @deprecated Normalize backend DTOs in @kn/core and use versionId. */
    currentVersionId?: string | number
    /** @deprecated Normalize backend DTOs in @kn/core. */
    currentVersion?: string | LegacyPluginVersionDescriptor
}

export type RemotePluginInput = LegacyRemotePluginDescriptor

const nonEmptyString = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() ? value.trim() : undefined

/**
 * Normalize legacy plugin metadata without leaking backend DTO knowledge into
 * the rest of the plugin runtime.
 */
export const normalizeRemotePluginDescriptor = (
    input: RemotePluginInput,
): RemotePluginDescriptor | null => {
    if (!input || typeof input !== "object") return null

    const legacyVersion = typeof input.currentVersion === "object"
        ? input.currentVersion
        : undefined
    const currentVersion = typeof input.currentVersion === "string"
        ? input.currentVersion
        : legacyVersion?.version
    const name = nonEmptyString(input.name) ?? nonEmptyString(input.pluginKey)
    const pluginKey = nonEmptyString(input.pluginKey) ?? name
    const resourcePath = nonEmptyString(input.resourcePath)
        ?? nonEmptyString(legacyVersion?.resourcePath)
    const version = nonEmptyString(input.version) ?? nonEmptyString(currentVersion)
    const versionId = input.versionId
        ?? input.currentVersionId
        ?? legacyVersion?.id
        ?? input.id
    const integrity = nonEmptyString(input.integrity)
        ?? nonEmptyString(legacyVersion?.integrity)

    if (!name || !pluginKey || !resourcePath) return null

    return {
        pluginKey,
        name,
        versionId,
        version,
        resourcePath,
        integrity,
    }
}

export const getRemotePluginInputName = (input: RemotePluginInput): string =>
    nonEmptyString(input?.name) ?? nonEmptyString(input?.pluginKey) ?? "unknown"
