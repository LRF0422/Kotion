/**
 * Host-side plugin lifecycle contract.
 *
 * `PluginManager` owns the plugin registry, but plugins cannot import it: the
 * manager is a host singleton built in the app entry, and `@kn/core` is only
 * available to plugins as a runtime global. This service is the narrow,
 * typed surface a plugin needs to install or uninstall *other* plugins — which
 * is exactly what the plugin studio does when it hot-reloads a project.
 *
 * Registered by the host as a core service. Use
 * `useOptionalService("pluginHost")` (or `usePluginHost()`).
 */
export interface PluginHostService {
    /**
     * Install a plugin from JavaScript source held in memory.
     *
     * Used by the studio: the dev bundler hands back a bundle, and this installs
     * it through the same activation path as a remote artifact (API version
     * handshake, `KPlugin` extraction, service registration).
     */
    installFromSource(options: {
        code: string
        pluginKey: string
        name: string
        version?: string
        /** Uninstall an active plugin with the same runtime name first. */
        replace?: boolean
        /** Label used in logs. */
        sourceLabel?: string
    }): Promise<boolean>
    /** Uninstall by runtime plugin name. Returns false when it was not active. */
    uninstall(name: string): boolean
    has(name: string): boolean
    /** Names of every currently active plugin, host-owned ones included. */
    getActiveNames(): string[]
    /**
     * Subscribe to plugin-registry changes (install / uninstall / re-init).
     * Returns an unsubscribe function.
     */
    subscribe(listener: () => void): () => void
}
