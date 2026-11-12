import type { DesktopStorageEnvelope } from './storage-envelope'
import type { DesktopAppInfo, DesktopPaths } from './system'
import type { DesktopOpenFileOptions, DesktopOpenFolderOptions, DesktopSaveFileOptions, DesktopMessageOptions, DesktopDialogFileResult, DesktopDialogFolderResult, DesktopDialogSaveResult } from './dialog'
import type { DesktopDirEntry, DesktopFileStat, DesktopFileResult } from './fs'
import type { DesktopTrafficLightPosition } from './window'
import type { DesktopSavedCredentials, DesktopSaveCredentialsInput } from './credentials'
import type { DesktopCaptureSourceType, DesktopCaptureRect, DesktopRegionContext, DesktopRegionResult, DesktopCaptureSource } from './capture'
import type { DesktopHttpRequest, DesktopNetPolicy, DesktopHttpResponse } from './http'
import type { DesktopNetSocketOpenOptions, DesktopNetSocketSession, DesktopNetSocketWriteOptions, DesktopNetSocketCloseOptions } from './net'
import type { DesktopBrowserOpenOptions, DesktopBrowserOpenResult, DesktopOAuthStartOptions, DesktopOAuthCallbackSession, DesktopOAuthCallbackResult } from './browser'
import type { DesktopSecretMetadata, DesktopSecretEntry, DesktopSecretSetOptions, DesktopSecretKeyOptions, DesktopSecretNamespaceInfo, DesktopSecretMutationResult } from './secrets'
import type { DesktopNotificationOptions, DesktopNotificationResult } from './notifications'
import type { DesktopBackgroundTask, DesktopBackgroundScheduleOptions } from './background'
import type { DevSessionStatus, DevStartOptions, DevBuildOptions, DevStopOptions, DevStatusOptions, DevLogsOptions, DevLogEntry, DevLogsSinceOptions, DevLogsPage, DevScaffoldOptions, DevScaffoldResult, DevRemoveOptions, DevRemoveResult, DevDeleteFileOptions, DevDeleteFileResult, DevProjectEntry, DevListOptions, DevFileOptions, DevHostApiOptions, DevHostApiResult, DevFilesOptions, DevFilesResult, DevInstallOptions, DevInstallResult } from './dev'
import type { DesktopTaskSnapshot, DesktopTaskStartOptions, DesktopTaskReportOptions, DesktopTaskReportResult, DesktopTaskLogsSinceOptions, DesktopTaskLogsPage, DesktopTaskListOptions, DesktopTaskGetOptions, DesktopTaskTouchOptions, DesktopTaskRemoveOptions, DesktopTaskRemoveResult, DesktopTaskFinishOptions, DesktopTaskCancelOptions, DesktopTaskCancelResult } from './tasks'
import type { SshCredentialMetadata, SshCredentialInput, SshCredentialMutationResult, SshExecOptions, SshExecResult, SshTransferOptions, SshTransferResult, SshGrant, SshForgetOptions, SshSftpPathOptions, SshSftpMkdirOptions, SshSftpRenameOptions, SshSftpRemoveOptions, SshSftpListOptions, SshSftpListResult, SshSftpStatResult, SshSftpMutationResult, SshShellOpenOptions, SshShellSession, SshShellWriteOptions, SshShellResizeOptions, SshShellTarget, SshTunnelOptions, SshTunnelSession, SshTunnelCloseOptions } from './ssh'
import type { DesktopBridge } from './bridge'
import type { StorageBatchOperation, StorageBatchResult, StorageEntry, StorageInfo, StorageListOptions, StorageListResult, StorageSetOptions } from '../../storage/types'

/**
 * Per-capability params/result contract.
 *
 * Plugins call `DesktopBridge.invoke(capability, params)` and get the matching
 * result type. This interface is the exhaustive registry: `DesktopCapability`
 * lists the names, this maps each name to its payload, and `./catalog.ts` adds
 * the human/agent-facing metadata (summary, guards, call shape, example).
 */
export interface DesktopCapabilityContract {
    'system.info': { params?: void; result: DesktopAppInfo }
    'system.paths': { params?: void; result: DesktopPaths }
    'http.request': { params: DesktopHttpRequest; result: DesktopHttpResponse }
    /**
     * The policy the SSRF guard is enforcing right now. Read it before warning
     * about a private gateway: `allowPrivateNetwork: false` means the request
     * will be refused by the main process.
     */
    'net.policy.get': { params?: void; result: DesktopNetPolicy }
    /** Replace the policy (the Settings toggle). Answers with the stored value. */
    'net.policy.set': { params: Partial<DesktopNetPolicy>; result: DesktopNetPolicy }
    // ---- net.socket: raw TCP / TLS streams ---------------------------------
    'net.socketOpen': { params: DesktopNetSocketOpenOptions; result: DesktopNetSocketSession }
    'net.socketWrite': { params: DesktopNetSocketWriteOptions; result: boolean }
    'net.socketClose': { params: DesktopNetSocketCloseOptions; result: boolean }
    'net.socketSessions': { params?: void; result: DesktopNetSocketSession[] }
    // ---- shell: system browser + loopback OAuth redirect --------------------
    'shell.browserOpen': { params: DesktopBrowserOpenOptions; result: DesktopBrowserOpenResult }
    'shell.oauthStart': { params?: DesktopOAuthStartOptions; result: DesktopOAuthCallbackSession }
    /** Await a session's redirect; resolves with `timedOut`/`cancelled` set. */
    'shell.oauthWait': { params: { sessionId: string }; result: DesktopOAuthCallbackResult }
    'shell.oauthSessions': { params?: void; result: DesktopOAuthCallbackSession[] }
    'shell.oauthCancel': { params: { sessionId: string }; result: boolean }
    // ---- storage.secret: plugin-scoped encrypted KV -------------------------
    'storage.secretAvailable': { params?: void; result: boolean }
    'storage.secretSet': {
        params: DesktopSecretSetOptions
        result: DesktopSecretMutationResult
    }
    'storage.secretGet': { params: DesktopSecretKeyOptions; result: DesktopSecretEntry | null }
    'storage.secretHas': { params: DesktopSecretKeyOptions; result: boolean }
    'storage.secretList': { params: { namespace: string }; result: DesktopSecretMetadata[] }
    'storage.secretRemove': { params: DesktopSecretKeyOptions; result: DesktopSecretMutationResult }
    'storage.secretClear': { params: { namespace: string }; result: number }
    'storage.secretNamespaces': { params?: void; result: DesktopSecretNamespaceInfo[] }
    // ---- notifications ------------------------------------------------------
    'notification.available': { params?: void; result: boolean }
    'notification.show': {
        params: DesktopNotificationOptions
        result: DesktopNotificationResult
    }
    'notification.setBadge': { params: { count?: number; text?: string }; result: boolean }
    'notification.clear': { params?: void; result: boolean }
    // ---- host-driven timers -------------------------------------------------
    'background.schedule': {
        params: DesktopBackgroundScheduleOptions
        result: DesktopBackgroundTask
    }
    'background.list': { params?: void; result: DesktopBackgroundTask[] }
    'background.cancel': { params: { taskId: string }; result: boolean }
    'background.cancelAll': { params?: { scope?: 'all' }; result: number }
    'capture.sources': {
        params?: { types?: DesktopCaptureSourceType[]; thumbnailWidth?: number }
        result: DesktopCaptureSource[]
    }
    /** Open the full-screen region overlay; null when the user cancels. */
    'capture.selectRegion': {
        params?: { displayId?: string; locale?: 'zh' | 'en' }
        result: DesktopRegionResult | null
    }
    'capture.region.context': { params?: void; result: DesktopRegionContext }
    'capture.region.submit': { params: DesktopCaptureRect | null; result: void }
    'dialog.openFile': { params?: DesktopOpenFileOptions; result: DesktopDialogFileResult }
    'dialog.openFolder': { params?: DesktopOpenFolderOptions; result: DesktopDialogFolderResult }
    'dialog.saveFile': { params?: DesktopSaveFileOptions; result: DesktopDialogSaveResult }
    'dialog.message': { params: DesktopMessageOptions; result: { response: number } }
    'fs.readFile': { params: { path: string; encoding?: 'utf8' | 'base64' }; result: DesktopFileResult<string> }
    'fs.writeFile': { params: { path: string; data: string; encoding?: 'utf8' | 'base64' }; result: DesktopFileResult }
    'fs.exists': { params: { path: string }; result: boolean }
    'fs.mkdir': { params: { path: string }; result: DesktopFileResult }
    'fs.remove': { params: { path: string }; result: DesktopFileResult }
    'fs.readdir': { params: { path: string }; result: DesktopFileResult<DesktopDirEntry[]> }
    'fs.stat': { params: { path: string }; result: DesktopFileResult<DesktopFileStat> }
    'fs.copy': { params: { src: string; dest: string }; result: DesktopFileResult }
    'fs.move': { params: { src: string; dest: string }; result: DesktopFileResult }
    'window.setFullScreen': { params: { value: boolean }; result: void }
    'window.isFullScreen': { params?: void; result: boolean }
    'window.setTrafficLights': { params: DesktopTrafficLightPosition; result: void }
    /** Toggle Chromium DevTools for the sender's window. */
    'window.toggleDevTools': { params?: void; result: void }
    /** Quit the desktop app (the menu's 退出 action). */
    'app.quit': { params?: void; result: void }
    /**
     * True when this machine can encrypt at rest (OS keychain reachable, e.g.
     * not a Linux box without a keyring daemon). The login page hides the
     * "remember password" option when false.
     */
    'credentials.available': { params?: void; result: boolean }
    /** Read the remembered credentials; null when nothing is stored. */
    'credentials.load': { params?: void; result: DesktopSavedCredentials | null }
    'credentials.save': { params: DesktopSaveCredentialsInput; result: DesktopSavedCredentials }
    /** Forget the remembered credentials (also drops the file when empty). */
    'credentials.clear': { params?: void; result: void }
    'dev.start': { params: DevStartOptions; result: DevSessionStatus }
    'dev.stop': { params: DevStopOptions; result: boolean }
    'dev.build': { params: DevBuildOptions; result: DevSessionStatus }
    'dev.status': { params?: DevStatusOptions; result: DevSessionStatus[] }
    'dev.logs': { params: DevLogsOptions; result: DevLogEntry[] }
    'dev.logsSince': { params: DevLogsSinceOptions; result: DevLogsPage }
    'dev.scaffold': { params: DevScaffoldOptions; result: DevScaffoldResult }
    'dev.list': { params?: DevListOptions; result: DevProjectEntry[] }
    'dev.readFile': { params: DevFileOptions; result: string }
    'dev.writeFile': { params: DevFileOptions; result: void }
    'dev.hostApi': { params: DevHostApiOptions; result: DevHostApiResult }
    'dev.files': { params: DevFilesOptions; result: DevFilesResult }
    'dev.installDependencies': { params: DevInstallOptions; result: DevInstallResult }
    'dev.remove': { params: DevRemoveOptions; result: DevRemoveResult }
    'dev.deleteFile': { params: DevDeleteFileOptions; result: DevDeleteFileResult }
    // ---- generic long tasks ------------------------------------------------
    'task.start': { params: DesktopTaskStartOptions; result: DesktopTaskSnapshot }
    'task.report': { params: DesktopTaskReportOptions; result: DesktopTaskReportResult }
    'task.logsSince': { params: DesktopTaskLogsSinceOptions; result: DesktopTaskLogsPage }
    'task.list': { params?: DesktopTaskListOptions; result: DesktopTaskSnapshot[] }
    'task.get': { params: DesktopTaskGetOptions; result: DesktopTaskSnapshot | null }
    'task.touch': { params: DesktopTaskTouchOptions; result: DesktopTaskSnapshot }
    'task.remove': { params: DesktopTaskRemoveOptions; result: DesktopTaskRemoveResult }
    'task.finish': { params: DesktopTaskFinishOptions; result: DesktopTaskSnapshot }
    'task.cancel': { params: DesktopTaskCancelOptions; result: DesktopTaskCancelResult }
    'ssh.exec': { params: SshExecOptions; result: SshExecResult }
    'ssh.put': { params: SshTransferOptions; result: SshTransferResult }
    'ssh.get': { params: SshTransferOptions; result: SshTransferResult }
    'ssh.hosts': { params?: void; result: SshGrant[] }
    'ssh.forget': { params: SshForgetOptions; result: boolean }
    'ssh.sftpList': { params: SshSftpListOptions; result: SshSftpListResult }
    'ssh.sftpStat': { params: SshSftpPathOptions; result: SshSftpStatResult }
    'ssh.sftpMkdir': { params: SshSftpMkdirOptions; result: SshSftpMutationResult }
    'ssh.sftpRename': { params: SshSftpRenameOptions; result: SshSftpMutationResult }
    'ssh.sftpRemove': { params: SshSftpRemoveOptions; result: SshSftpMutationResult }
    'ssh.shellOpen': { params: SshShellOpenOptions; result: SshShellSession }
    'ssh.shellWrite': { params: SshShellWriteOptions; result: boolean }
    'ssh.shellResize': { params: SshShellResizeOptions; result: boolean }
    'ssh.shellClose': { params: SshShellTarget; result: boolean }
    'ssh.shells': { params?: void; result: SshShellSession[] }
    'ssh.tunnelOpen': { params: SshTunnelOptions; result: SshTunnelSession }
    'ssh.tunnelClose': { params: SshTunnelCloseOptions; result: boolean }
    'ssh.tunnels': { params?: void; result: SshTunnelSession[] }
    'ssh.credentialsAvailable': { params?: void; result: boolean }
    'ssh.credentialsList': { params?: void; result: SshCredentialMetadata[] }
    'ssh.credentialsSet': { params: SshCredentialInput; result: SshCredentialMutationResult }
    'ssh.credentialsRemove': { params: { id: string }; result: SshCredentialMutationResult }
    'storage.info': { params?: void; result: DesktopStorageEnvelope<StorageInfo> }
    'storage.get': {
        params: { namespace: string; key: string }
        result: DesktopStorageEnvelope<StorageEntry | null>
    }
    'storage.getMany': {
        params: { namespace: string; keys: string[] }
        result: DesktopStorageEnvelope<StorageEntry[]>
    }
    'storage.set': {
        params: { namespace: string; key: string; value: unknown } & StorageSetOptions
        result: DesktopStorageEnvelope<StorageEntry>
    }
    'storage.delete': {
        params: { namespace: string; key: string }
        result: DesktopStorageEnvelope<boolean>
    }
    'storage.keys': {
        params: { namespace: string; prefix?: string }
        result: DesktopStorageEnvelope<string[]>
    }
    'storage.list': { params: StorageListOptions; result: DesktopStorageEnvelope<StorageListResult> }
    'storage.count': {
        params: { namespace: string; prefix?: string }
        result: DesktopStorageEnvelope<number>
    }
    'storage.clear': {
        params: { namespace: string; prefix?: string }
        result: DesktopStorageEnvelope<number>
    }
    'storage.batch': {
        params: { operations: StorageBatchOperation[] }
        result: DesktopStorageEnvelope<StorageBatchResult>
    }
    'storage.namespaces': { params?: void; result: DesktopStorageEnvelope<string[]> }
}
