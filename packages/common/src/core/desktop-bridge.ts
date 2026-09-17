/**
 * Desktop (Electron) capability bridge contract.
 *
 * Canonical declaration lives here in @kn/common; @kn/plugin-api re-exports
 * these types for plugin authors, and @kn/core provides the implementation.
 * The transport is a narrow preload bridge plus validated main-process
 * handlers — plugins never touch ipcRenderer directly.
 *
 * All plugins are trusted (no untrusted-plugin sandbox), so capabilities are a
 * contract + host validation, not an enforced permission boundary.
 */

export type DesktopPlatform = 'darwin' | 'win32' | 'linux' | 'other'

/** Every desktop capability exposed to plugins. */
export type DesktopCapability =
    | 'system.info'
    | 'system.paths'
    | 'http.request'
    | 'capture.sources'
    | 'capture.selectRegion'
    | 'capture.region.context'
    | 'capture.region.submit'
    | 'dialog.openFile'
    | 'dialog.openFolder'
    | 'dialog.saveFile'
    | 'dialog.message'
    | 'fs.readFile'
    | 'fs.writeFile'
    | 'fs.exists'
    | 'fs.mkdir'
    | 'fs.remove'
    | 'fs.readdir'
    | 'fs.stat'
    | 'fs.copy'
    | 'fs.move'
    | 'window.setFullScreen'
    | 'window.isFullScreen'
    | 'window.setTrafficLights'

export interface DesktopAppInfo {
    version: string
    name: string
    platform: string
    arch: string
    userDataPath: string
    locale: string
}

export interface DesktopPaths {
    userData: string
    downloads: string
    documents: string
    desktop: string
    temp: string
}

export interface DesktopFileFilter {
    name: string
    extensions: string[]
}

export interface DesktopOpenFileOptions {
    title?: string
    filters?: DesktopFileFilter[]
    multiSelections?: boolean
}

export interface DesktopOpenFolderOptions {
    title?: string
}

export interface DesktopSaveFileOptions {
    title?: string
    defaultPath?: string
    filters?: DesktopFileFilter[]
}

export interface DesktopMessageOptions {
    type?: 'none' | 'info' | 'error' | 'question' | 'warning'
    title?: string
    message: string
    detail?: string
    buttons?: string[]
}

export interface DesktopDirEntry {
    name: string
    isDirectory: boolean
    isFile: boolean
}

export interface DesktopFileStat {
    size: number
    isDirectory: boolean
    isFile: boolean
    createdAt: number
    modifiedAt: number
}

export interface DesktopDialogFileResult {
    canceled: boolean
    filePaths: string[]
}

export interface DesktopDialogFolderResult {
    canceled: boolean
    folderPath: string | null
}

export interface DesktopDialogSaveResult {
    canceled: boolean
    filePath: string | null
}

/** File operations report failures inline instead of rejecting. */
export interface DesktopFileResult<T = never> {
    data?: T | null
    success?: boolean
    error?: string
}

export interface DesktopTrafficLightPosition {
    x: number
    y: number
}

export type DesktopCaptureSourceType = 'screen' | 'window'

export interface DesktopCaptureRect {
    x: number
    y: number
    width: number
    height: number
}

/** What the full-screen region overlay renders. */
export interface DesktopRegionContext {
    /** PNG data URL of the display at full resolution. */
    url: string
    width: number
    height: number
    locale: 'zh' | 'en'
}

/** The cropped region returned by the overlay. */
export interface DesktopRegionResult {
    imageDataUrl: string
    width: number
    height: number
}

export interface DesktopCaptureSource {
    /** Pass as chromeMediaSourceId to getUserMedia. */
    id: string
    name: string
    /** PNG data URL of the source thumbnail; empty when unavailable. */
    thumbnail: string
    displayId: string
}

export interface DesktopHttpRequest {
    method?: string
    url: string
    headers?: Record<string, string>
    /** Raw request body (text). */
    body?: string
    /**
     * Base64-encoded binary request body. Takes precedence over `body` when
     * present, letting plugins stream binary uploads through the main process
     * (e.g. a release asset) without a browser CORS preflight.
     */
    bodyBase64?: string
    timeoutMs?: number
    maxResponseBytes?: number
}

export interface DesktopHttpRedirect {
    status: number
    location: string
}

export interface DesktopHttpResponse {
    status: number
    statusText: string
    headers: Record<string, string>
    bodyText: string
    bodyBytes: number
    durationMs: number
    /** True when the body hit maxResponseBytes and was cut short. */
    truncated: boolean
    redirects: DesktopHttpRedirect[]
    /** Final URL after redirects. */
    finalUrl: string
}

/**
 * Per-capability params/result contract. Plugins call
 * DesktopBridge.invoke(capability, params) and get the matching result type.
 */
export interface DesktopCapabilityContract {
    'system.info': { params?: void; result: DesktopAppInfo }
    'system.paths': { params?: void; result: DesktopPaths }
    'http.request': { params: DesktopHttpRequest; result: DesktopHttpResponse }
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
}

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
}
