import { DESKTOP_BRIDGE_VERSION } from '@kn/plugin-api'
import { createStorageBridge, type StorageHostBridge } from './storage-bridge'
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
    DevRemoveOptions,
    DevRemoveResult,
    DevDeleteFileOptions,
    DevDeleteFileResult,
    SshBridge,
    SshExecOptions,
    SshExecResult,
    SshForgetOptions,
    SshGrant,
    SshTransferOptions,
    SshTransferResult,
    SshSftpListOptions,
    SshSftpListResult,
    SshSftpMkdirOptions,
    SshSftpMutationResult,
    SshSftpPathOptions,
    SshSftpRemoveOptions,
    SshSftpRenameOptions,
    SshSftpStatResult,
    SshShellEvent,
    SshShellOpenOptions,
    SshShellResizeOptions,
    SshShellSession,
    SshShellTarget,
    SshShellWriteOptions,
    SshCredentialInput,
    SshCredentialMetadata,
    SshCredentialMutationResult,
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
    'dev.remove',
    'dev.deleteFile',
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
        removeProject: (options: DevRemoveOptions): Promise<DevRemoveResult> => {
            requireCapability('dev.remove')
            return invoke('dev.remove', options)
        },
        deleteFile: (options: DevDeleteFileOptions): Promise<DevDeleteFileResult> => {
            requireCapability('dev.deleteFile')
            return invoke('dev.deleteFile', options)
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

/** Capabilities the ssh group adds; their presence gates {@link SshBridge}. */
const SSH_CAPABILITIES: DesktopCapability[] = [
    'ssh.exec',
    'ssh.put',
    'ssh.get',
    'ssh.hosts',
    'ssh.forget',
    'ssh.sftpList',
    'ssh.sftpStat',
    'ssh.sftpMkdir',
    'ssh.sftpRename',
    'ssh.sftpRemove',
    'ssh.shellOpen',
    'ssh.shellWrite',
    'ssh.shellResize',
    'ssh.shellClose',
    'ssh.shells',
    'ssh.credentialsAvailable',
    'ssh.credentialsList',
    'ssh.credentialsSet',
    'ssh.credentialsRemove',
]

const createSshBridge = (
    host: DesktopHostBridge,
    capabilities: readonly string[],
): SshBridge | undefined => {
    if (!SSH_CAPABILITIES.some((capability) => capabilities.includes(capability))) {
        // A desktop build that predates the ssh group: `desktop.ssh` stays
        // undefined so plugins degrade instead of throwing per call.
        return undefined
    }

    const invoke = <C extends DesktopCapability>(capability: C, params?: unknown) =>
        host.invoke(capability, params) as Promise<DesktopCapabilityContract[C]['result']>

    return {
        exec: (options: SshExecOptions): Promise<SshExecResult> => invoke('ssh.exec', options),
        put: (options: SshTransferOptions): Promise<SshTransferResult> => invoke('ssh.put', options),
        get: (options: SshTransferOptions): Promise<SshTransferResult> => invoke('ssh.get', options),
        list: (options: SshSftpListOptions): Promise<SshSftpListResult> => invoke('ssh.sftpList', options),
        stat: (options: SshSftpPathOptions): Promise<SshSftpStatResult> => invoke('ssh.sftpStat', options),
        mkdir: (options: SshSftpMkdirOptions): Promise<SshSftpMutationResult> => invoke('ssh.sftpMkdir', options),
        rename: (options: SshSftpRenameOptions): Promise<SshSftpMutationResult> => invoke('ssh.sftpRename', options),
        remove: (options: SshSftpRemoveOptions): Promise<SshSftpMutationResult> => invoke('ssh.sftpRemove', options),
        shell: (options: SshShellOpenOptions): Promise<SshShellSession> => invoke('ssh.shellOpen', options),
        shellWrite: (options: SshShellWriteOptions): Promise<boolean> => invoke('ssh.shellWrite', options),
        shellResize: (options: SshShellResizeOptions): Promise<boolean> => invoke('ssh.shellResize', options),
        shellClose: (options: SshShellTarget): Promise<boolean> => invoke('ssh.shellClose', options),
        shellSessions: (): Promise<SshShellSession[]> => invoke('ssh.shells'),
        /**
         * One event channel for every session; filter by `sessionId` here so a
         * component only sees its own terminal.
         */
        onShell: (listener) =>
            host.on('ssh', (value) => listener(value as SshShellEvent)),
        hosts: (): Promise<SshGrant[]> => invoke('ssh.hosts'),
        forget: (options: SshForgetOptions): Promise<boolean> => invoke('ssh.forget', options),
        credentials: {
            available: (): Promise<boolean> => invoke('ssh.credentialsAvailable'),
            list: (): Promise<SshCredentialMetadata[]> => invoke('ssh.credentialsList'),
            set: (input: SshCredentialInput): Promise<SshCredentialMutationResult> =>
                invoke('ssh.credentialsSet', input),
            remove: (options: { id: string }): Promise<SshCredentialMutationResult> =>
                invoke('ssh.credentialsRemove', options),
        },
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
    const storage = createStorageBridge(host, capabilities)
    const ssh = createSshBridge(host, capabilities)

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
        ...(storage ? { storage } : {}),
        ...(ssh ? { ssh } : {}),
    }
}
