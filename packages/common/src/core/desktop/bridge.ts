import type { DesktopPlatform } from './platform'
import type { DesktopCapability } from './capabilities'
import type { NetBridge } from './net'
import type { BrowserBridge } from './browser'
import type { SecretBridge } from './secrets'
import type { NotificationBridge } from './notifications'
import type { BackgroundBridge } from './background'
import type { TaskBridge } from './tasks'
import type { DevBridge } from './dev'
import type { SshBridge } from './ssh'
import type { DesktopCapabilityContract } from './contract'
import type { StorageService } from '../../storage/types'

/**
 * The `desktop` core service: the renderer-side view of the host bridge.
 *
 * On the web the service is not registered at all (use `useOptionalService`).
 * Typed sub-bridges (`net`, `browser`, `secrets`, `notifications`,
 * `background`, `storage`, `ssh`, `dev`) are individually optional, so every
 * call site must feature-detect with `desktop?.has(...)` / `desktop?.ssh`.
 */
/**
 * The desktop bridge registered as the `desktop` core service on Electron.
 * On the web the service is not registered (use useOptionalService).
 */
export interface DesktopBridge {
    /** Desktop bridge contract version; MAJOR changes are incompatible. */
    readonly version: string
    readonly platform: DesktopPlatform
    readonly capabilities: readonly DesktopCapability[]
    has(capability: DesktopCapability): boolean
    invoke<C extends DesktopCapability>(
        capability: C,
        params?: DesktopCapabilityContract[C]['params'],
    ): Promise<DesktopCapabilityContract[C]['result']>
    /** Subscribe to native fullscreen changes; returns an unsubscribe function. */
    onFullScreenChange(listener: (isFullScreen: boolean) => void): () => void
    /**
     * Plugin-development surface. Present on desktop builds that ship the
     * studio runtime; undefined elsewhere. Feature-detect before using it.
     */
    readonly dev?: DevBridge
    /**
     * Durable storage, backed by SQLite in the main process. Present on desktop
     * builds that expose the `storage.*` capabilities; `@kn/core` registers a
     * `StorageService` either way, so prefer `useStorage()` over reaching for
     * this field.
     */
    readonly storage?: StorageService
    /**
     * SSH surface. Present on desktop builds that expose the `ssh.*`
     * capabilities; undefined on older builds and on the web. Every call needs
     * the network policy's blessing and, on first use per host in an app run,
     * an explicit user confirmation — so treat this as user-consented remote
     * execution, not as a silent utility.
     */
    readonly ssh?: SshBridge
    /**
     * Raw TCP / TLS byte streams. Present on desktop builds that expose the
     * `net.socket*` capabilities. The host moves bytes; the protocol (and its
     * framing, keep-alive and reconnection policy) belongs to the plugin.
     *
     * Every connection is gated by the network policy and by a per-target user
     * confirmation on first use in this app run — a raw stream to an arbitrary
     * host is a stronger capability than an HTTP request, so it always asks.
     */
    readonly net?: NetBridge
    /**
     * The system browser plus a loopback redirect listener, so a plugin can run
     * an OAuth authorization-code flow. Present on desktop builds that expose the
     * `shell.browserOpen` capability.
     */
    readonly browser?: BrowserBridge
    /**
     * Plugin-scoped encrypted key-value storage (OS keychain at rest). Present on
     * desktop builds that expose the `storage.secret*` capabilities. Prefer this
     * over `storage.*` for anything that is a credential.
     */
    readonly secrets?: SecretBridge
    /** OS notifications and the app badge. Present when `notification.*` exists. */
    readonly notifications?: NotificationBridge
    /**
     * Host-driven timers: the main process owns the clock, so a scheduled task
     * keeps ticking while the plugin's panel is closed. Present when
     * `background.*` exists.
     */
    readonly background?: BackgroundBridge
    /**
     * Generic long-task registry: progress, incremental logs, cancellation and
     * a state that survives a page refresh. Present when `task.*` exists. Most
     * plugins should use the `runLongTask` helper instead of calling this
     * directly — it degrades to a no-op on hosts without the bridge.
     */
    readonly tasks?: TaskBridge
    /**
     * Subscribe to any capability event channel by name (the same names the
     * main process broadcasts on: `ssh`, `net`, `background`, …). Prefer the
     * typed helpers above; this exists so a new channel does not need a bridge
     * change to become reachable.
     */
    on(event: string, listener: (value: unknown) => void): () => void
}
