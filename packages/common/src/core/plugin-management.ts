/**
 * Core plugin-management contract.
 *
 * A stable, host-agnostic view over the runtime plugin registry: what is
 * active, where it came from, and the lifecycle operations any plugin may
 * perform. `@kn/core` registers the implementation as the `pluginManagement`
 * core service; the older `pluginHost` remains as the narrow subset existing
 * callers already depend on.
 */
import type { RemotePluginInput } from './plugin-runtime'
import type { PluginBundle, PluginInstallOutcome } from './plugin-bundle'

/** Where an active plugin came from. */
export type PluginSource = 'system' | 'installed' | 'dev'

/** One active runtime plugin, as seen by management UIs and agent tools. */
export interface PluginManagementEntry {
    /** Runtime plugin name; the key `uninstall` takes. */
    name: string
    /** Stable artifact/package key. */
    pluginKey: string
    /** Display or semantic version when the artifact descriptor had one. */
    version?: string
    /** system = host-owned, installed = remote artifact, dev = local build. */
    source: PluginSource
    /** The plugin needs desktop (Electron) capabilities. */
    desktopOnly: boolean
}

/** Install an in-memory bundle (the studio's hot-reload path). */
export interface PluginSourceInstallOptions {
    code: string
    pluginKey: string
    name: string
    version?: string
    /**
     * `false` keeps the legacy "install, do not touch what is running" meaning:
     * an active registry key is refused instead of reloaded. Omit (or `true`) and
     * the registry decides — an existing key is a reload.
     */
    replace?: boolean
    /** Label used in logs. */
    sourceLabel?: string
    /**
     * Why the install was refused, verbatim: a boolean return cannot distinguish
     * a bundle that threw while being evaluated from a name collision, and the
     * caller is the one that has to tell a developer which it was.
     */
    onRejected?: (reason: string) => void
}

/** Service surface for managing the runtime plugin set. */
export interface PluginManagementService {
    /** Every active plugin, host-owned ones included. */
    list(): PluginManagementEntry[]
    /** One active plugin by runtime name. */
    get(name: string): PluginManagementEntry | undefined
    has(name: string): boolean
    /** Names of every currently active plugin. */
    getActiveNames(): string[]
    /** Install a remote artifact through the standard activation path. */
    install(input: RemotePluginInput): Promise<boolean>
    /**
     * Install an in-memory bundle (a local build) and report what happened.
     *
     * The typed entry point: `mode` says whether a first install or a reload
     * happened (i.e. whether the previous panel state survived), and `reason`
     * says why nothing changed. Prefer it over `installFromSource`.
     */
    installBundle(bundle: PluginBundle): Promise<PluginInstallOutcome>
    /**
     * @deprecated Boolean view of {@link installBundle}, kept for callers written
     * against the older contract.
     */
    installFromSource(options: PluginSourceInstallOptions): Promise<boolean>
    /** Uninstall by runtime name. Returns false when not active or removable. */
    uninstall(name: string): boolean
    /** False for host-owned (system) plugins, which cannot be removed. */
    isRemovable(name: string): boolean
    /** Subscribe to registry changes (install / uninstall / re-init). */
    subscribe(listener: () => void): () => void
}
