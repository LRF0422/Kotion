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

import type {
    StorageBatchOperation,
    StorageBatchResult,
    StorageEntry,
    StorageErrorCode,
    StorageInfo,
    StorageListOptions,
    StorageListResult,
    StorageService,
    StorageSetOptions,
} from '../storage/types'

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
    | 'window.toggleDevTools'
    | 'app.quit'
    // ---- network policy for http.request (SSRF switch) ---------------------
    | 'net.policy.get'
    | 'net.policy.set'
    // ---- remembered login credentials (OS keychain via safeStorage) --------
    | 'credentials.available'
    | 'credentials.load'
    | 'credentials.save'
    | 'credentials.clear'
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
    | 'dev.installDependencies'
    | 'dev.remove'
    | 'dev.deleteFile'
    // ---- ssh (runs the user's own OpenSSH binaries) ------------------------
    | 'ssh.exec'
    | 'ssh.put'
    | 'ssh.get'
    | 'ssh.hosts'
    | 'ssh.forget'
    // ---- ssh: sftp directory surface ---------------------------------------
    | 'ssh.sftpList'
    | 'ssh.sftpStat'
    | 'ssh.sftpMkdir'
    | 'ssh.sftpRename'
    | 'ssh.sftpRemove'
    // ---- ssh: interactive terminal (remote pty, streamed) ------------------
    | 'ssh.shellOpen'
    | 'ssh.shellWrite'
    | 'ssh.shellResize'
    | 'ssh.shellClose'
    | 'ssh.shells'
    // ---- ssh: credentials the user stores in the host (never given to plugins)
    | 'ssh.credentialsAvailable'
    | 'ssh.credentialsList'
    | 'ssh.credentialsSet'
    | 'ssh.credentialsRemove'
    // ---- durable storage (SQLite in the main process) ----------------------
    | 'storage.info'
    | 'storage.get'
    | 'storage.getMany'
    | 'storage.set'
    | 'storage.delete'
    | 'storage.keys'
    | 'storage.list'
    | 'storage.count'
    | 'storage.clear'
    | 'storage.batch'
    | 'storage.namespaces'

/**
 * Storage capabilities answer with an envelope instead of throwing: Electron
 * flattens a rejected `invoke` into a message string, which would lose the
 * {@link StorageErrorCode} the renderer needs in order to degrade.
 */
export type DesktopStorageEnvelope<T> =
    | { ok: true; value: T }
    | { ok: false; code: StorageErrorCode; message: string }

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

/* ------------------------------------------------------------------ *
 * Remembered login credentials
 *
 * The password is encrypted by Electron's `safeStorage`, which is backed by
 * the OS keychain (macOS Keychain / Windows DPAPI / Linux keyring), and only
 * the ciphertext is written to the app's userData directory. The plaintext
 * never reaches disk and never leaves the device.
 *
 * This is an at-rest guarantee, not a renderer-isolation boundary: callers of
 * `credentials.load` receive the plaintext password, so treat the capability
 * as available to the app shell as a whole (the desktop app also runs
 * remote-fetched plugin bundles in that shell).
 * ------------------------------------------------------------------ */

/** Credentials the user asked the desktop app to remember between launches. */
export interface DesktopSavedCredentials {
    /** Login account (email / username). Always safe to display. */
    account: string
    /** Decrypted password, or `''` when only the account was remembered. */
    password: string
    /** Whether the login page should sign in automatically on startup. */
    autoLogin: boolean
    /** Epoch ms of the last write; absent when nothing has been saved yet. */
    updatedAt?: number
}

/** What `credentials.save` accepts. */
export interface DesktopSaveCredentialsInput {
    account: string
    /** `''` (or omitted) stores the account only, without a password. */
    password?: string
    autoLogin?: boolean
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
    /**
     * Target URL. The main process refuses loopback / private / link-local /
     * cloud-metadata targets unless the user enabled
     * {@link DesktopNetPolicy.allowPrivateNetwork} in Settings — the SSRF guard
     * cannot be overridden per request, so read `net.policy.get` before
     * promising the caller a LAN gateway works.
     */
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

/**
 * What the `http.request` SSRF guard is allowed to reach.
 *
 * `allowPrivateNetwork` is a user preference (Settings → 偏好设置), owned by the
 * desktop main process, not a per-request flag: a plugin cannot widen it by
 * asking. Cloud metadata endpoints stay refused either way.
 */
export interface DesktopNetPolicy {
    /** Allow loopback / RFC1918 / link-local / ULA targets. Default false. */
    allowPrivateNetwork: boolean
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
    /**
     * Compiled CSS for this build (already scoped to the plugin's own DOM).
     *
     * The bundle embeds it too — a published artifact must be self-contained —
     * and the host re-applies this copy when it commits the bundle, so a rejected
     * reload restores the previous stylesheet instead of leaving the panel
     * styled by code that never ran.
     */
    css?: string
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
    /**
     * Which contribution point the project starts from. Defaults to `panel`;
     * every template must build as-is, so the choice only decides the starting
     * shape, never whether the project works.
     */
    template?: DevScaffoldTemplate
    /** Overwrite an existing directory. Defaults to false. */
    overwrite?: boolean
}

/**
 * Scaffold templates, one per contribution point.
 *
 * - `panel` — a side-dock panel
 * - `page` — a whole-page renderer (`pageTypes`)
 * - `settings` — a panel in the host's settings dialog
 * - `command` — an editor slash-menu entry
 * - `blank` — a valid plugin with no contributions yet
 */
export type DevScaffoldTemplate = 'panel' | 'page' | 'settings' | 'command' | 'blank'

export interface DevScaffoldResult {
    root: string
    pluginKey: string
    /** Template the project was generated from. */
    template: DevScaffoldTemplate
    files: string[]
    /** True when the host chose the managed directory (no `parentDir` given). */
    managed: boolean
}

/** Delete a plugin project (its files and any running session). */
export interface DevRemoveOptions {
    /** Absolute project directory, validated against the fs allowlist. */
    root: string
}

/** Result of {@link DevBridge.removeProject}. */
export interface DevRemoveResult {
    root: string
    removed: boolean
    /** Registry key read from the deleted manifest, when it declared one. */
    pluginKey?: string | null
    /** Display name read from the deleted manifest, when it declared one. */
    name?: string | null
}

/** Delete one file inside a plugin project. */
export interface DevDeleteFileOptions {
    /** Absolute project root, validated against the fs allowlist. */
    root: string
    /** Absolute file to delete; must resolve inside `root`. */
    path: string
}

/**
 * Result of {@link DevBridge.deleteFile}.
 *
 * The removed text is echoed back so a mistaken delete can be undone, which is
 * why a delete reports more than "ok".
 */
export interface DevDeleteFileResult {
    root: string
    /** The path that was requested. */
    path: string
    /** Project-relative path, for display and logs. */
    relativePath: string
    removed: boolean
    /** Size of the deleted file in bytes. */
    bytes: number
    /** The deleted text, when it was small enough to echo back. */
    content?: string
    /** True when the file was too large to echo back. */
    truncated: boolean
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

/** One line of grep context, with its own 1-based line number. */
export interface DevFileGrepLine {
    line: number
    text: string
}

/** A `content`-mode grep match, with the context lines around it. */
export interface DevFileGrepMatch {
    /** Project-relative file path. */
    path: string
    /** 1-based line number. */
    line: number
    /** The matching line, trimmed (long lines are truncated with an ellipsis). */
    text: string
    /** Lines before the match (empty unless `context` was requested). */
    before: DevFileGrepLine[]
    /** Lines after the match (empty unless `context` was requested). */
    after: DevFileGrepLine[]
}

/** Per-file match count, for `count` mode. */
export interface DevFileGrepCount {
    path: string
    count: number
}

/** How a grep reports its hits. */
export type DevFilesGrepMode = 'content' | 'files_with_matches' | 'count'

/** Result of a grep over one plugin project's text files. */
export interface DevFilesGrepResult {
    kind: 'grep'
    root: string
    mode: DevFilesGrepMode
    /** The pattern as executed. */
    pattern: string
    /** Populated in `content` mode. */
    matches: DevFileGrepMatch[]
    /** Populated in `files_with_matches` mode. */
    files: string[]
    /** Populated in `count` mode. */
    counts: DevFileGrepCount[]
    /** Files actually read (vendor dirs and oversized files excluded). */
    scanned: number
    /** Files skipped because they exceeded the size cap. */
    skippedLarge: number
    /** A bound was hit (match cap or file cap): the result is partial. */
    truncated: boolean
    /** The wall-clock budget expired before the walk finished. */
    timedOut: boolean
}

/** List, search or grep the files of one plugin project. */
export interface DevFilesOptions {
    /** Absolute project root (validated against the fs allowlist). */
    root: string
    /** Case-insensitive substring to search for; omit to list files. */
    query?: string
    /**
     * Regular-expression pattern to grep for. Takes precedence over `query`.
     * Any JavaScript `RegExp` source is accepted; an invalid pattern is refused
     * with the compiler's message instead of matching nothing.
     */
    pattern?: string
    /**
     * Path filter: a comma-separated mix of globs (`*.tsx`, `src/**`) and plain
     * substrings (`src/`). Applies to `query` and `pattern` alike.
     */
    include?: string
    /** Make the grep case-insensitive (default: case-sensitive). */
    ignoreCase?: boolean
    /** Lines of leading/trailing context per match, `content` mode only (0–5). */
    context?: number
    /** Grep report shape; defaults to `content`. */
    outputMode?: DevFilesGrepMode
    /** Max files (list) or matches (search/grep). */
    limit?: number
}

/** Result of {@link DevBridge.files}, discriminated by `kind`. */
export type DevFilesResult =
    | { kind: 'list'; root: string; files: string[]; truncated: boolean }
    | { kind: 'search'; root: string; matches: DevFileMatch[]; truncated: boolean }
    | DevFilesGrepResult

/** Install npm packages into one plugin project. */
export interface DevInstallOptions {
    /** Absolute project root (validated against the fs allowlist). */
    root: string
    /** Package specs, for example ["date-fns@^3", "@octokit/rest"]. */
    packages: string[]
    /** Save as devDependencies instead of dependencies. */
    dev?: boolean
    /** Force a package manager; otherwise detected from lockfiles. */
    manager?: 'npm' | 'pnpm' | 'yarn'
    /** Kill the install after this many ms. Defaults to 180000. */
    timeoutMs?: number
}

/** Result of {@link DevBridge.installDependencies}. */
export interface DevInstallResult {
    ok: boolean
    /** Package manager that ran. */
    manager: string
    /** Specs that were installed (de-duplicated). */
    packages: string[]
    /** Combined stdout/stderr tail for the studio log. */
    output: string
    error?: string
}

/**
 * Host-key verification policy for an SSH call.
 *
 * - `strict` (default): the host must already be in the user's `known_hosts`;
 *   an unknown or changed key fails.
 * - `accept-new`: trust on first use. The main process asks the user before a
 *   connection is made under this policy, because it is the weaker one.
 */
export type SshHostKeyPolicy = 'strict' | 'accept-new'

/** Which host to talk to. Credentials are never part of this shape. */
export interface SshTarget {
    /** Hostname, IPv4 or IPv6 literal (no brackets needed). */
    host: string
    /** Login user; omitted means the ssh config / local user decides. */
    user?: string | null
    /** TCP port; defaults to 22. */
    port?: number
}

/** Common knobs for one SSH call. */
export interface SshCallOptions extends SshTarget {
    /** Wall-clock budget for the whole call (default 30s, max 10min). */
    timeoutMs?: number
    /** Combined stdout+stderr byte budget (default 1 MiB, max 4 MiB). */
    maxOutputBytes?: number
    /** Host-key policy; defaults to `strict`. */
    hostKeyPolicy?: SshHostKeyPolicy
    /**
     * Which stored credential to authenticate with.
     *
     * Optional: when omitted, the credential saved for this target is used, and
     * without one the connection falls back to the ssh-agent and `~/.ssh` keys.
     * **A password or key is never passed in a call** — it is stored once, in the
     * host, and resolved in the main process.
     */
    credentialId?: string
}

/** How a stored credential authenticates. */
export type SshCredentialKind = 'password' | 'key'

/**
 * A stored SSH credential, as the renderer sees it.
 *
 * Deliberately metadata only: there is no field here that could carry the
 * password or the private key back out of the main process.
 */
export interface SshCredentialMetadata {
    id: string
    host: string
    user: string | null
    port: number
    kind: SshCredentialKind
    label?: string
    createdAt: number
    updatedAt: number
    /** A passphrase is stored alongside the key. */
    hasPassphrase: boolean
    /** `user@host:port` — what a call's target has to match. */
    targetKey: string
}

/** Add or replace the credential for one target. */
export interface SshCredentialInput {
    host: string
    user?: string | null
    port?: number
    kind?: SshCredentialKind
    label?: string
    /** The password, or a PEM private key. */
    secret: string
    /** Passphrase for an encrypted private key. */
    passphrase?: string
}

/** Result of storing/removing a credential: `ok: false` + a reason to show. */
export interface SshCredentialMutationResult {
    ok: boolean
    credential?: SshCredentialMetadata
    error?: string
}

/** The credential surface: everything a settings panel needs, and nothing more. */
export interface SshCredentialBridge {
    /** False when the OS cannot encrypt (no keyring): storing is refused. */
    available(): Promise<boolean>
    list(): Promise<SshCredentialMetadata[]>
    set(input: SshCredentialInput): Promise<SshCredentialMutationResult>
    remove(options: { id: string }): Promise<SshCredentialMutationResult>
}

/** Run one command on a remote host. */
export interface SshExecOptions extends SshCallOptions {
    /** Shell command line executed by the remote login shell. */
    command: string
}

/** Result of {@link SshExecOptions}. */
export interface SshExecResult {
    host: string
    user: string | null
    port: number
    /** The remote command that ran. */
    command: string
    /** True only for exit code 0 without a timeout. */
    ok: boolean
    code: number | null
    signal: string | null
    stdout: string
    stderr: string
    /** Output hit the byte budget: the text is clipped. */
    truncated: boolean
    timedOut: boolean
    durationMs: number
    /** The exact argv that ran, for diagnosing flag problems. */
    argv: string[]
}

/** Copy one file to (`put`) or from (`get`) a remote host. */
export interface SshTransferOptions extends SshCallOptions {
    /** Local path; validated against the same fs allowlist as `fs.*`. */
    localPath: string
    /** Remote path (no quoting needed: it travels as an argv entry). */
    remotePath: string
}

/** Result of {@link SshTransferOptions}. */
export interface SshTransferResult {
    host: string
    user: string | null
    port: number
    direction: 'put' | 'get'
    localPath: string
    remotePath: string
    ok: boolean
    code: number | null
    signal: string | null
    stdout: string
    stderr: string
    truncated: boolean
    timedOut: boolean
    durationMs: number
    argv: string[]
}

/** What an SSH call does, as far as the user's consent is concerned. */
export type SshRequestScope = 'command' | 'transfer' | 'sftp' | 'shell'

/** A host the user has allowed for this app run. */
export interface SshGrant {
    /** `user@host:port` — the identity {@link SshForgetOptions} revokes (every scope). */
    key: string
    host: string
    user: string | null
    port: number
    hostKeyPolicy: SshHostKeyPolicy
    /**
     * What was allowed. Grants are per host **and** per scope: permission to run
     * a command does not imply permission to open an interactive terminal.
     */
    scope: SshRequestScope
    /** Epoch ms of the confirmation. */
    grantedAt: number
}

/** Revoke a grant, either by its key or by naming the target again. */
export interface SshForgetOptions extends Partial<SshTarget> {
    /** The `key` from {@link SshGrant}; takes precedence when present. */
    key?: string
}

/**
 * One remote directory entry (SFTP `readdir`).
 *
 * `path` is already joined with the directory that was listed, so a caller never
 * has to re-assemble it.
 */
export interface SshSftpEntry {
    name: string
    path: string
    /** The server's `ls -l`-style line, when it provides one. */
    longname: string
    directory: boolean
    file: boolean
    symlink: boolean
    size: number
    mode: number
    modifiedAt: number
    uid: number
    gid: number
}

/** Common knobs for every SFTP call. */
export interface SshSftpOptions extends SshCallOptions {}

export interface SshSftpPathOptions extends SshSftpOptions {
    /** Remote path. No quoting needed: it is a protocol field, not a shell word. */
    path: string
}

export interface SshSftpMkdirOptions extends SshSftpPathOptions {
    /** Create missing parents (`mkdir -p`). */
    recursive?: boolean
}

export interface SshSftpRenameOptions extends SshSftpOptions {
    from: string
    to: string
    /** POSIX rename replaces silently; the default refuses an existing target. */
    overwrite?: boolean
}

export interface SshSftpRemoveOptions extends SshSftpPathOptions {
    /** Remove an empty directory instead of a file. */
    directory?: boolean
}

export interface SshSftpListOptions extends SshSftpPathOptions {}

export interface SshSftpListResult {
    host: string
    user: string | null
    port: number
    path: string
    entries: SshSftpEntry[]
    /** The entry cap was hit; the listing is partial. */
    truncated: boolean
}

export interface SshSftpStatResult {
    host: string
    user: string | null
    port: number
    path: string
    size: number
    mode: number
    directory: boolean
    file: boolean
    symlink: boolean
    modifiedAt: number
    accessedAt: number
    uid: number
    gid: number
}

export interface SshSftpMutationResult {
    host: string
    user: string | null
    port: number
    [key: string]: unknown
}

/** Open an interactive terminal: a remote pty with a writable stdin. */
export interface SshShellOpenOptions extends SshCallOptions {
    /** TERM name; sanitized to a boring default when it is not a plain token. */
    term?: string
    cols?: number
    rows?: number
}

/** A live terminal session. Data arrives as `SshShellEvent`s. */
export interface SshShellSession {
    sessionId: string
    host: string
    user: string | null
    port: number
    cols: number
    rows: number
    /** Epoch ms. */
    openedAt: number
}

export interface SshShellWriteOptions {
    sessionId: string
    /** Keystrokes / pasted text (UTF-8). */
    data: string
}

export interface SshShellResizeOptions {
    sessionId: string
    cols: number
    rows: number
}

export interface SshShellTarget {
    sessionId: string
}

/**
 * One terminal event, delivered on the `ssh` desktop event channel.
 *
 * `data` is base64: ssh2 hands over byte chunks that can split a multi-byte
 * character, so the renderer must decode bytes rather than trust a JSON string.
 */
export type SshShellEvent =
    | { type: 'shell-data'; sessionId: string; data: string }
    | { type: 'shell-exit'; sessionId: string; code: number | null; signal: string | null }
    | { type: 'shell-error'; sessionId: string; message: string }

/**
 * The SSH surface of the desktop bridge. Present only on desktop builds that
 * expose the `ssh.*` capabilities; feature-detect before use.
 *
 * Every call is gated by the network policy and by a per-host user confirmation
 * on first use in an app run; an interactive shell says so explicitly in that
 * dialog. There is deliberately no way to pass a password or a key — auth comes
 * from the user's ssh-agent and default identity files.
 */
export interface SshBridge {
    exec(options: SshExecOptions): Promise<SshExecResult>
    /** Upload a local file to the remote host (SFTP). */
    put(options: SshTransferOptions): Promise<SshTransferResult>
    /** Download a remote file to a local path (SFTP). */
    get(options: SshTransferOptions): Promise<SshTransferResult>
    /** List a remote directory. */
    list(options: SshSftpListOptions): Promise<SshSftpListResult>
    /** Stat a remote path. */
    stat(options: SshSftpPathOptions): Promise<SshSftpStatResult>
    /** Create a remote directory (optionally `-p`). */
    mkdir(options: SshSftpMkdirOptions): Promise<SshSftpMutationResult>
    /** Rename/move; refuses an existing target unless `overwrite` is set. */
    rename(options: SshSftpRenameOptions): Promise<SshSftpMutationResult>
    /** Delete a file, or an empty directory when `directory` is set. */
    remove(options: SshSftpRemoveOptions): Promise<SshSftpMutationResult>
    /** Open an interactive terminal (remote pty). */
    shell(options: SshShellOpenOptions): Promise<SshShellSession>
    /** Send input to a shell session. */
    shellWrite(options: SshShellWriteOptions): Promise<boolean>
    /** Resize a shell session's pty (the reason this is not a spawned `ssh`). */
    shellResize(options: SshShellResizeOptions): Promise<boolean>
    /** Close a shell session. */
    shellClose(options: SshShellTarget): Promise<boolean>
    /** Sessions that are currently open. */
    shellSessions(): Promise<SshShellSession[]>
    /** Subscribe to terminal output/exit events; returns an unsubscribe. */
    onShell(listener: (event: SshShellEvent) => void): () => void
    /** Hosts the user has granted for this app run. */
    hosts(): Promise<SshGrant[]>
    /** Revoke one grant; true when a grant was removed. */
    forget(options: SshForgetOptions): Promise<boolean>
    /**
     * Stored credentials — the only way to log in to a password-only host.
     *
     * Secrets go in and never come back out: `list()` is metadata only and the
     * main process is the only reader of the plaintext.
     */
    credentials: SshCredentialBridge
}

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
    /** Install npm packages into one project (runs the package manager). */
    installDependencies(options: DevInstallOptions): Promise<DevInstallResult>
    /**
     * Stop a project's session and delete its files from disk. Irreversible;
     * the host refuses anything that is not a plugin project.
     */
    removeProject(options: DevRemoveOptions): Promise<DevRemoveResult>
    /**
     * Delete one file inside a project. The host confines the file to the
     * project root and refuses the manifest and the entry file.
     */
    deleteFile(options: DevDeleteFileOptions): Promise<DevDeleteFileResult>
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
    /**
     * The policy the SSRF guard is enforcing right now. Read it before warning
     * about a private gateway: `allowPrivateNetwork: false` means the request
     * will be refused by the main process.
     */
    'net.policy.get': { params?: void; result: DesktopNetPolicy }
    /** Replace the policy (the Settings toggle). Answers with the stored value. */
    'net.policy.set': { params: Partial<DesktopNetPolicy>; result: DesktopNetPolicy }
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
    'dev.scaffold': { params: DevScaffoldOptions; result: DevScaffoldResult }
    'dev.list': { params?: DevListOptions; result: DevProjectEntry[] }
    'dev.readFile': { params: DevFileOptions; result: string }
    'dev.writeFile': { params: DevFileOptions; result: void }
    'dev.hostApi': { params: DevHostApiOptions; result: DevHostApiResult }
    'dev.files': { params: DevFilesOptions; result: DevFilesResult }
    'dev.installDependencies': { params: DevInstallOptions; result: DevInstallResult }
    'dev.remove': { params: DevRemoveOptions; result: DevRemoveResult }
    'dev.deleteFile': { params: DevDeleteFileOptions; result: DevDeleteFileResult }
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
}
