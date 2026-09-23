import { DESKTOP_BRIDGE_VERSION } from '@kn/plugin-api'
import type {
    DesktopBridge,
    DesktopCapability,
    DesktopCapabilityContract,
    DesktopPlatform,
    DevBridge,
    DevScaffoldOptions,
    DevScaffoldResult,
    DevProjectEntry,
    DevListOptions,
    DevFileOptions,
    DevSessionStatus,
    DevStartOptions,
    DevBuildOptions,
    DevStatusOptions,
    DevLogsOptions,
    DevLogEntry,
    DevHostApiOptions,
    DevHostApiResult,
    DevFilesOptions,
    DevFilesResult,
    DevInstallOptions,
    DevInstallResult,
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

/** Capabilities the studio runtime adds; their presence gates {@link DevBridge}. */
const DEV_CAPABILITIES: DesktopCapability[] = [
    'dev.start',
    'dev.stop',
    'dev.build',
    'dev.status',
    'dev.logs',
    'dev.scaffold',
    'dev.list',
    'dev.readFile',
    'dev.writeFile',
    'dev.hostApi',
    'dev.files',
    'dev.installDependencies',
]

const createDevBridge = (
    host: DesktopHostBridge,
    capabilities: readonly string[],
): DevBridge | undefined => {
    if (!DEV_CAPABILITIES.some((capability) => capabilities.includes(capability))) {
        // A desktop build without the studio runtime: `desktop.dev` stays
        // undefined so the studio plugin can degrade instead of throwing.
        return undefined
    }

    const invoke = <C extends DesktopCapability>(capability: C, params?: unknown) =>
        host.invoke(capability, params) as Promise<DesktopCapabilityContract[C]['result']>

    const requireCapability = (capability: DesktopCapability) => {
        if (!capabilities.includes(capability)) {
            throw new Error(
                `This desktop build has no "${capability}" capability; update the desktop app to use the plugin studio.`,
            )
        }
    }

    return {
        start: (options: DevStartOptions): Promise<DevSessionStatus> => {
            requireCapability('dev.start')
            return invoke('dev.start', options)
        },
        stop: (options): Promise<boolean> => {
            requireCapability('dev.stop')
            return invoke('dev.stop', options)
        },
        build: (options: DevBuildOptions): Promise<DevSessionStatus> => {
            requireCapability('dev.build')
            return invoke('dev.build', options)
        },
        status: (options?: DevStatusOptions): Promise<DevSessionStatus[]> => {
            requireCapability('dev.status')
            return invoke('dev.status', options)
        },
        logs: (options: DevLogsOptions): Promise<DevLogEntry[]> => {
            requireCapability('dev.logs')
            return invoke('dev.logs', options)
        },
        scaffold: (options: DevScaffoldOptions): Promise<DevScaffoldResult> => {
            requireCapability('dev.scaffold')
            return invoke('dev.scaffold', options)
        },
        list: (options?: DevListOptions): Promise<DevProjectEntry[]> => {
            requireCapability('dev.list')
            return invoke('dev.list', options)
        },
        readFile: (options): Promise<string> => {
            requireCapability('dev.readFile')
            return invoke('dev.readFile', options)
        },
        writeFile: (options): Promise<void> => {
            requireCapability('dev.writeFile')
            return invoke('dev.writeFile', options)
        },
        hostApi: (options?: DevHostApiOptions): Promise<DevHostApiResult> => {
            requireCapability('dev.hostApi')
            return invoke('dev.hostApi', options)
        },
        files: (options: DevFilesOptions): Promise<DevFilesResult> => {
            requireCapability('dev.files')
            return invoke('dev.files', options)
        },
        installDependencies: (options: DevInstallOptions): Promise<DevInstallResult> => {
            requireCapability('dev.installDependencies')
            return invoke('dev.installDependencies', options)
        },
        /**
         * The main process broadcasts one `dev` event channel; filtering by root
         * happens here so a studio panel only sees its own project's rebuilds.
         */
        onBuild: (listener, root) =>
            host.on('dev', (value) => {
                const payload = value as { type?: string; status?: DevSessionStatus }
                if (payload?.type !== 'build' || !payload.status) return
                if (root && payload.status.root !== root) return
                listener(payload.status)
            }),
    }
}

/**
 * Build the `desktop` core service, or undefined on the web (where the preload
 * bridge is absent). The host registers it via PluginManager coreServices.
 */
export const createDesktopBridge = (): DesktopBridge | undefined => {
    const host = readDesktopHost()
    if (!host) return undefined

    const capabilities = (host.capabilities ?? []) as DesktopCapability[]
    const dev = createDevBridge(host, capabilities)

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
        ...(dev ? { dev } : {}),
    }
}
