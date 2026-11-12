import type { DesktopBridge } from './bridge'

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
    /**
     * Monotonic per-session sequence (starts at 1). Present on entries returned
     * by the host; optional in the type so callers/tests that construct a log
     * line by hand (and old host builds) still type-check.
     */
    seq?: number
    level: 'info' | 'warn' | 'error'
    message: string
    at: number
}

/** Incremental cursor read of a session's log ring. */
export interface DevLogsSinceOptions {
    root: string
    /** Return entries with `seq > sinceSeq`. Omit (or 0) for "from the oldest retained". */
    sinceSeq?: number
    /** Max entries to return; the newest win. Defaults to 200, host caps at 1000. */
    limit?: number
}

/** One page of {@link DevBridge.logsSince}. */
export interface DevLogsPage {
    root: string
    /**
     * Random id of the session that produced this page; `null` when no session
     * exists for `root`. A change means the host restarted and `seq` started
     * over at 1 — the caller must reset its cursor.
     */
    sessionId: string | null
    /** Entries with `seq > sinceSeq`, ascending, at most `limit`. */
    entries: DevLogEntry[]
    /** Cursor for the next call: last returned seq, or the retained floor when lines were dropped. */
    nextSeq: number
    /** Lines the caller can no longer see (ring eviction + `limit` truncation). */
    dropped: number
    /** Entries currently retained in the ring. */
    total: number
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
    /**
     * Return only this declaration from `path` (`export interface/type/const/
     * enum/function <symbol>`). The cheap way to read one type without pulling a
     * whole module into the agent's context.
     */
    symbol?: string
    /**
     * Resolve declarations by name across host packages (or only `package`),
     * returning each declaration with its file and line range. At most 24.
     */
    symbols?: string[]
    /**
     * Return members of an interface in `path` (e.g. one
     * `DesktopCapabilityContract` entry). Requires `package` + `path`; at most 24.
     */
    members?: string[]
}

/** Result of a {@link DevBridge.hostApi} call, discriminated by `kind`. */
/** One declaration slice from `dev.hostApi`. */
export interface DevHostApiDeclaration {
    symbol: string
    package: string
    path: string
    /** 1-based first line of the returned slice (includes the doc comment). */
    startLine: number
    /** 1-based last line of the returned slice. */
    endLine: number
    /** Total lines in the source file, so the caller knows what it skipped. */
    totalLines: number
    /** The declaration source, doc comment included. */
    text: string
}

/** One interface-member slice from `dev.hostApi`. */
export interface DevHostApiMember {
    member: string
    startLine: number
    endLine: number
    totalLines: number
    text: string
}

export type DevHostApiResult =
    | { kind: 'list'; root: string; packages: DevHostPackage[] }
    | { kind: 'search'; matches: DevHostApiMatch[]; truncated: boolean }
    | {
          kind: 'file'
          package: string
          path: string
          contents: string
          bytes: number
          /** Set when `symbol` was requested: one declaration, not the file. */
          symbol?: string
          startLine?: number
          endLine?: number
          totalLines?: number
      }
    | { kind: 'declarations'; declarations: DevHostApiDeclaration[]; missing: string[] }
    | {
          kind: 'contract'
          package: string
          path: string
          entries: DevHostApiMember[]
          missing: string[]
      }

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
    /**
     * Incremental cursor read of the same log ring. `dev.logs` keeps its
     * tail-window behaviour; this one returns only entries newer than
     * `sinceSeq` plus the cursor bookkeeping a monitor needs (`sessionId`,
     * `nextSeq`, `dropped`).
     */
    logsSince(options: DevLogsSinceOptions): Promise<DevLogsPage>
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
