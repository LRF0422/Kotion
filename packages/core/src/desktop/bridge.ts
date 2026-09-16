import { DESKTOP_BRIDGE_VERSION } from '@kn/plugin-api'
import type {
    DesktopBridge,
    DesktopCapability,
    DesktopCapabilityContract,
    DesktopPlatform,
} from '@kn/common'

/**
 * The raw bridge exposed by apps/desktop's preload script. Deliberately narrow:
 * a fixed capability list plus invoke/on — no ipcRenderer, no arbitrary channel.
 */
interface DesktopHostBridge {
    platform: string
    capabilities: readonly string[]
    invoke(capability: string, params?: unknown): Promise<unknown>
    on(event: string, listener: (value: unknown) => void): () => void
}

const readDesktopHost = (): DesktopHostBridge | undefined => {
    if (typeof window === 'undefined') return undefined
    const host = (window as unknown as { knDesktop?: DesktopHostBridge }).knDesktop
    return host && typeof host.invoke === 'function' ? host : undefined
}

/**
 * Build the `desktop` core service, or undefined on the web (where the preload
 * bridge is absent). The host registers it via PluginManager coreServices.
 */
export const createDesktopBridge = (): DesktopBridge | undefined => {
    const host = readDesktopHost()
    if (!host) return undefined

    const capabilities = (host.capabilities ?? []) as DesktopCapability[]

    return {
        version: DESKTOP_BRIDGE_VERSION,
        platform: (host.platform ?? 'other') as DesktopPlatform,
        capabilities,
        has: (capability) => capabilities.includes(capability),
        invoke: <C extends DesktopCapability>(
            capability: C,
            params?: DesktopCapabilityContract[C]['params'],
        ) => host.invoke(capability, params) as Promise<DesktopCapabilityContract[C]['result']>,
        onFullScreenChange: (listener) =>
            host.on('fullscreen', (value) => listener(Boolean(value))),
    }
}
