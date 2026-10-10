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
import type { PluginBundle, PluginInstallOutcome } from './plugin-bundle'
export interface PluginHostService {
    /**
     * Install a bundle and report what happened — whether it was a first
     * install or a reload, and (on refusal) why nothing was committed.
     *
     * The typed entry point; `installFromSource` is its boolean predecessor.
     */
    installBundle(bundle: PluginBundle): Promise<PluginInstallOutcome>
    /**
     * Install a plugin from JavaScript source held in memory.
     *
     * Used by the studio: the dev bundler hands back a bundle, and this installs
     * it through the same activation path as a remote artifact (API version
     * handshake, `KPlugin` extraction, service registration).
     *
     * With `replace`, the bundle is loaded and validated before anything is
     * committed and the active plugin is swapped **in place** — the host keeps
     * rendering its components, so a reload preserves panel state, and a rejected
     * bundle leaves the running version untouched.
     */
    installFromSource(options: {
        code: string
        pluginKey: string
        name: string
        version?: string
        /**
         * `false` keeps the legacy "install, do not touch what is running"
         * meaning: an active registry key is refused instead of reloaded. Omit
         * (or `true`) and the registry decides — an existing key is a reload.
         */
        replace?: boolean
        /** Label used in logs. */
        sourceLabel?: string
        /** Why the install was refused, verbatim (see `PluginSourceInstallOptions`). */
        onRejected?: (reason: string) => void
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
