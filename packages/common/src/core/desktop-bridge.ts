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
    // ---- plugin development (plugin-studio) --------------------------------
    | 'dev.start'
    | 'dev.stop'
    | 'dev.build'
    | 'dev.status'
    | 'dev.logs'
    | 'dev.scaffold'
    | 'dev.list'
    | 'dev.readFile'
    | 'dev.writeFile'
    | 'dev.hostApi'
    | 'dev.files'

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

/* ------------------------------------------------------------------ *
 * Plugin development (plugin-studio)
 *
 * These capabilities turn a plugin *source project* on disk into a bundle the
 * host can install into the running window. The bundler runs in a separate
 * Node child process (`ELECTRON_RUN_AS_NODE`), watches the project, and hands
 * back freshly built source over NDJSON — so no plugin needs a public HTTP
 * origin, and a broken build never takes the host down with it.
 * ------------------------------------------------------------------ */

export type DevSessionState = 'idle' | 'starting' | 'watching' | 'failed' | 'stopped'

/** Where a built bundle came from, for the studio's provenance display. */
export interface DevBuildOutput {
    /** Bundled, host-runtime-ready JavaScript (UMD-ish IIFE). */
    code: string
    /** Absolute path of the bundle on disk, when it was written. */
    outFile?: string
    /** Size of `code` in bytes. */
    bytes: number
    /** Build duration in ms. */
    durationMs: number
    /** Files the bundler pulled into this build (project-relative). */
    modules: string[]
}

/** What a project's manifest declares about the plugin it builds. */
export interface DevPluginDescriptor {
    /** Registry key the host looks the plugin up by. */
    pluginKey: string
    /** Human-readable name shown in the studio. */
    name: string
    /** Optional icon (emoji or URL) for the studio list. */
    icon?: string
}

export interface DevSessionStatus {
    /** Absolute project directory. */
    root: string
    state: DevSessionState
    plugin: DevPluginDescriptor
    /** Last successful build; absent before the first successful build. */
    build?: DevBuildOutput
    /** Last error message (build failure or spawn failure). */
    error?: string
    /** Monotonic counter incremented on every successful build. */
    buildCount: number
    /** Epoch ms of the last successful build. */
    updatedAt: number
    /** True when at least one file watcher is active. */
    watching: boolean
}

export interface DevStartOptions {
    /** Absolute path of the plugin project (must be inside an allowed root). */
    root: string
    /** Rebuild on file change. Defaults to true. */
    watch?: boolean
    /** Also write the bundle to disk (dist/index.js) on every build. */
    writeToDisk?: boolean
    /**
     * Extra import specifiers to treat as host globals. Merged with the
     * built-in host map (@kn/common, react, …).
     */
    externals?: string[]
}

export interface DevBuildOptions {
    root: string
    writeToDisk?: boolean
    externals?: string[]
}

export interface DevStopOptions {
    root: string
}

export interface DevStatusOptions {
    /** Omit to list every known session. */
    root?: string
}

export interface DevLogsOptions {
    root: string
    /** Max entries to return (most recent last). Defaults to 200. */
    limit?: number
}

export interface DevLogEntry {
    level: 'info' | 'warn' | 'error'
    message: string
    at: number
}

export interface DevScaffoldOptions {
    /**
     * Directory to create the project in. Optional: when omitted the host uses
     * its own managed projects directory (`<userData>/plugin-projects`), which
     * is already inside the fs allowlist — so scaffolding needs no native dialog
     * and an agent can create a project end to end on its own.
     */
    parentDir?: string
    /** Project folder name and package name suffix. */
    name: string
    /** Human-readable plugin name; defaults to `name`. */
    displayName?: string
    /** Registry key; defaults to a slug of `name`. */
    pluginKey?: string
    /** Overwrite an existing directory. Defaults to false. */
    overwrite?: boolean
}

export interface DevScaffoldResult {
    root: string
    pluginKey: string
    files: string[]
    /** True when the host chose the managed directory (no `parentDir` given). */
    managed: boolean
}

/** One plugin project the host can enumerate from disk. */
export interface DevProjectEntry {
    /** Absolute project directory. */
    root: string
    /** Directory name, used as the default display label. */
    name: string
    /** Registry key from `knPluginStudio.pluginKey`. */
    pluginKey?: string
    /** Display name from `knPluginStudio.displayName`. */
    displayName?: string
    /** Resolved entry file, when one was found. */
    entry?: string
    /** Epoch ms of the last change to the project's package.json. */
    updatedAt?: number
    /** True when a dev session is currently running for this project. */
    active?: boolean
}

/** Subdirectory of `system.paths().userData` that the studio owns. */
export const DEV_PROJECTS_DIR_NAME = 'plugin-projects'

export interface DevListOptions {
    /** Directory to scan; defaults to the managed projects directory. */
    dir?: string
}

/** Read/write a file inside a plugin project (path validated against the allowlist). */
export interface DevFileOptions {
    /** Absolute path of the file. */
    path: string
    /** Only for dev.writeFile; UTF-8 text. */
    contents?: string
}

/* ------------------------------------------------------------------ *
 * Host package API reference (plugin-studio authoring)
 *
 * The agent writes plugins against the standard host packages (@kn/common,
 * @kn/ui, …), so the studio exposes their TypeScript source as a read-only
 * reference. It is resolved by the desktop main process from the checkout;
 * a packaged build without source reports the surface as unavailable.
 * ------------------------------------------------------------------ */

/** One standard host package exposed to the studio's API reference. */
export interface DevHostPackage {
    /** Package name, for example `@kn/common`. */
    name: string
    /** Version from the package's package.json. */
    version?: string
    /** Absolute package directory. */
    root: string
    /** Package-relative entry file, when one exists. */
    entry?: string
}

/** A single source line matched by a host-API search. */
export interface DevHostApiMatch {
    /** Package name, for example `@kn/common`. */
    package: string
    /** Package-relative file path. */
    path: string
    /** 1-based line number. */
    line: number
    /** The matching line, trimmed. */
    text: string
}

/**
 * Host-API access options. Omit `query`/`path` to list packages; pass `query`
 * to search the source; pass `package` + `path` to read one file.
 */
export interface DevHostApiOptions {
    /** Package name (`@kn/common`) or short name (`common`). */
    package?: string
    /** Package-relative file path; requires `package`. */
    path?: string
    /** Case-insensitive substring to search for. */
    query?: string
    /** Maximum matches for `query`. Defaults to 60, capped at 200. */
    limit?: number
}

/** Result of a {@link DevBridge.hostApi} call, discriminated by `kind`. */
export type DevHostApiResult =
    | { kind: 'list'; root: string; packages: DevHostPackage[] }
    | { kind: 'search'; matches: DevHostApiMatch[]; truncated: boolean }
    | { kind: 'file'; package: string; path: string; contents: string; bytes: number }

/** A source line matched by a plugin-project search. */
export interface DevFileMatch {
    /** Project-relative file path. */
    path: string
    /** 1-based line number. */
    line: number
    /** The matching line, trimmed. */
    text: string
}

/** List or search the files of one plugin project. */
export interface DevFilesOptions {
    /** Absolute project root (validated against the fs allowlist). */
    root: string
    /** Case-insensitive substring to search for; omit to list files. */
    query?: string
    /** Optional substring filter on project-relative paths. */
    include?: string
    /** Max files (list) or matches (search). */
    limit?: number
}

/** Result of {@link DevBridge.files}, discriminated by `kind`. */
export type DevFilesResult =
    | { kind: 'list'; root: string; files: string[]; truncated: boolean }
    | { kind: 'search'; root: string; matches: DevFileMatch[]; truncated: boolean }

/**
 * The plugin-development surface of the desktop bridge. Separate from
 * {@link DesktopBridge} so a plugin can feature-detect a dev-capable host:
 * `desktop.dev` is undefined on builds without the studio runtime.
 */
export interface DevBridge {
    /** Start (or restart) a watched dev build for a project. */
    start(options: DevStartOptions): Promise<DevSessionStatus>
    /** Stop the child process and drop the session. */
    stop(options: DevStopOptions): Promise<boolean>
    /** One-shot rebuild; resolves with the session status after the build. */
    build(options: DevBuildOptions): Promise<DevSessionStatus>
    /** Status of one session, or of every known session. */
    status(options?: DevStatusOptions): Promise<DevSessionStatus[]>
    /** Tail of a session's build log. */
    logs(options: DevLogsOptions): Promise<DevLogEntry[]>
    /** Write a minimal plugin project to disk and return its layout. */
    scaffold(options: DevScaffoldOptions): Promise<DevScaffoldResult>
    /** Enumerate plugin projects on disk (managed directory by default). */
    list(options?: DevListOptions): Promise<DevProjectEntry[]>
    /** Read a project file as UTF-8 text (throws when outside the allowlist). */
    readFile(options: DevFileOptions): Promise<string>
    /** Write a project file as UTF-8 text, creating parent directories. */
    writeFile(options: DevFileOptions): Promise<void>
    /**
     * Read the standard host packages' TypeScript source as an authoring
     * reference. Omit options to list packages, pass `query` to search, or
     * pass `package` + `path` to read one file.
     */
    hostApi(options?: DevHostApiOptions): Promise<DevHostApiResult>
    /** Enumerate or search the files of one project. */
    files(options: DevFilesOptions): Promise<DevFilesResult>
    /**
     * Subscribe to successful rebuilds. `root` filters to one project; omit to
     * receive every project's rebuilds. Returns an unsubscribe function.
     */
    onBuild(listener: (status: DevSessionStatus) => void, root?: string): () => void
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
    'dev.start': { params: DevStartOptions; result: DevSessionStatus }
    'dev.stop': { params: DevStopOptions; result: boolean }
    'dev.build': { params: DevBuildOptions; result: DevSessionStatus }
    'dev.status': { params?: DevStatusOptions; result: DevSessionStatus[] }
    'dev.logs': { params: DevLogsOptions; result: DevLogEntry[] }
    'dev.scaffold': { params: DevScaffoldOptions; result: DevScaffoldResult }
    'dev.list': { params?: DevListOptions; result: DevProjectEntry[] }
    'dev.readFile': { params: DevFileOptions; result: string }
    'dev.writeFile': { params: DevFileOptions; result: void }
    'dev.hostApi': { params: DevHostApiOptions; result: DevHostApiResult }
    'dev.files': { params: DevFilesOptions; result: DevFilesResult }
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
    /**
     * Plugin-development surface. Present on desktop builds that ship the
     * studio runtime; undefined elsewhere. Feature-detect before using it.
     */
    readonly dev?: DevBridge
}
