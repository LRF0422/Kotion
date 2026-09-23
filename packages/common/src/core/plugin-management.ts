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
    /** Uninstall an active plugin with the same runtime name first. */
    replace?: boolean
    /** Label used in logs. */
    sourceLabel?: string
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
    /** Install an in-memory bundle (a local build). */
    installFromSource(options: PluginSourceInstallOptions): Promise<boolean>
    /** Uninstall by runtime name. Returns false when not active or removable. */
    uninstall(name: string): boolean
    /** False for host-owned (system) plugins, which cannot be removed. */
    isRemovable(name: string): boolean
    /** Subscribe to registry changes (install / uninstall / re-init). */
    subscribe(listener: () => void): () => void
}
