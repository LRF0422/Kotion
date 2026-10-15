/**
 * Plugin Studio — agent tools.
 *
 * These expose the studio's `dev.*` capabilities to the AI agent, which is the
 * point of the feature: an agent can scaffold a project (in the host's managed
 * directory, no folder dialog), write its source, build it, hot-install it for
 * preview, and iterate — without the user picking directories.
 *
 * The tools are editor-independent: nothing here touches the document, and they
 * are contributed through the plugin's first-class `agent` point.
 *
 * Scope is deliberately narrow: scaffolding, building, reading the host API and
 * hot-installing the project itself. The studio never enumerates or uninstalls
 * other plugins — managing the host plugin registry is the plugin manager's job,
 * not a plugin's.
 *
 * Services are injected rather than resolved here, which keeps this module
 * dependency-free at runtime: the plugin passes the real resolvers and tests
 * pass fakes, with no need to load @kn/common (and its React tree) at all. The
 * capability shapes are declared structurally for the same reason.
 */

/* ------------------------------------------------------------------ *
 * Injected services (structurally typed)
 * ------------------------------------------------------------------ */

export interface StudioPluginDescriptor {
    pluginKey: string
    name: string
    icon?: string
}

export interface StudioBuild {
    code: string
    outFile?: string
    bytes: number
    durationMs: number
    modules: string[]
}

export interface StudioSessionStatus {
    root: string
    state: 'idle' | 'starting' | 'watching' | 'failed' | 'stopped'
    plugin: StudioPluginDescriptor
    build?: StudioBuild
    error?: string
    buildCount: number
    updatedAt: number
    watching: boolean
}

export interface StudioProjectEntry {
    root: string
    name: string
    pluginKey?: string
    displayName?: string
    entry?: string
    updatedAt?: number
    active?: boolean
}

export interface StudioLogEntry {
    level: 'info' | 'warn' | 'error'
    message: string
    at: number
}

export interface StudioHostPackage {
    name: string
    version?: string
    root: string
    entry?: string
}

export interface StudioHostApiMatch {
    package: string
    path: string
    line: number
    text: string
}

export type StudioHostApiResult =
    | { kind: 'list'; root: string; packages: StudioHostPackage[] }
    | { kind: 'search'; matches: StudioHostApiMatch[]; truncated: boolean }
    | { kind: 'file'; package: string; path: string; contents: string; bytes: number }

export interface StudioFileMatch {
    path: string
    line: number
    text: string
}

/** One line of grep context. */
export interface StudioGrepLine {
    line: number
    text: string
}

/** A `content`-mode grep match with its surrounding context lines. */
export interface StudioGrepMatch {
    path: string
    line: number
    text: string
    before: StudioGrepLine[]
    after: StudioGrepLine[]
}

/** Per-file match count (`count` mode). */
export interface StudioGrepCount {
    path: string
    count: number
}

export type StudioGrepMode = 'content' | 'files_with_matches' | 'count'

export interface StudioGrepResult {
    kind: 'grep'
    root: string
    mode: StudioGrepMode
    pattern: string
    matches: StudioGrepMatch[]
    files: string[]
    counts: StudioGrepCount[]
    scanned: number
    skippedLarge: number
    truncated: boolean
    timedOut: boolean
}

export type StudioFilesResult =
    | { kind: 'list'; root: string; files: string[]; truncated: boolean }
    | { kind: 'search'; root: string; matches: StudioFileMatch[]; truncated: boolean }
    | StudioGrepResult

/**
 * The live `desktop` core service, seen structurally.
 *
 * Only what capability discovery needs: the host's capability whitelist and the
 * typed groups it hangs off the bridge. Structural (not imported from
 * `@kn/common`) so this module stays dependency-free at runtime, like every
 * other bridge shape here.
 */
export interface StudioDesktopBridge {
    platform?: string
    capabilities?: readonly string[]
    has?: (capability: string) => boolean
    /** Feature-detectable groups; keys are inspected, not called. */
    dev?: unknown
    ssh?: unknown
    storage?: unknown
    [key: string]: unknown
}

/** One capability family, grouped by the name prefix in front of the first dot. */
export interface StudioDesktopCapabilityGroup {
    /** e.g. `ssh.` */
    group: string
    /** Capability names in this family, sorted. */
    capabilities: string[]
    /** One-line note on what the family is for and its guard rails. */
    summary?: string
}

export interface StudioDesktopCapabilitiesResult {
    hasDesktop: boolean
    platform?: string
    /** Total capabilities this host exposes. */
    count: number
    groups: StudioDesktopCapabilityGroup[]
    /** Typed groups hanging off the bridge (`desktop.dev` / `.ssh` / `.storage`). */
    typedGroups: Array<{ group: string; methods: string[] }>
    /** How a plugin consumes any of this. */
    callPattern: string
    /** Where the exact parameter/result types live. */
    hint: string
    /** Set when the host exposes no `desktop` service at all. */
    note?: string
}

export interface StudioInstallResult {
    ok: boolean
    manager: string
    packages: string[]
    output: string
    error?: string
}/** Result of deleting a project: its files are gone, the session is stopped. */
export interface StudioRemoveResult {
    root: string
    removed: boolean
    pluginKey?: string | null
    name?: string | null
}

/** Result of deleting one file: the path is gone, its text comes back for undo. */
export interface StudioDeleteFileResult {
    root: string
    path: string
    relativePath: string
    removed: boolean
    bytes: number
    content?: string
    truncated: boolean
}

/** What applying a generated icon to a project did. */
export interface StudioApplyIconResult {
    iconFile: string
    relativePath: string
    glyph: string
    isInitial: boolean
    color: string
    colorTo: string
    svg: string
    manifest: { updated: boolean; previous: string | null; block: string }
    railIcon: { updated: boolean; status: string; snippet: string }
}

/**
 * Icon rendering + application, injected by the plugin entry
 * (`./icons/icon-art`). Structural here for the same reason as every other
 * injected shape: the tool layer stays free of relative imports, so its test can
 * load it directly under Node.
 */
export interface StudioIconToolkit {
    /** Every icon component name the host exposes (`@kn/icon`). */
    iconNames: () => string[]
    /** Pure name filter: PascalCase components matching a query. */
    filterIconNames: (names: readonly string[], query: string, limit?: number) => string[]
    /** Emoji suggestions for a purpose keyword. */
    suggestGlyphs: (query: string, limit?: number) => Array<{ keyword: string; glyph: string }>
    /** Source snippets that make a rail icon (`dockPanels[].icon`). */
    railIconSnippets: (iconName: string, emoji?: string) =>
        | { createElement: string; jsx: string; emoji: string; importLine: string }
        | Record<string, string>
    /** Render the artwork, write it, point the manifest at it, patch the rail icon. */
    applyIcon: (input: {
        root: string
        seed: string
        io: { readFile(o: { path: string }): Promise<string>; writeFile(o: { path: string; contents: string }): Promise<void> }
        title?: string
        glyph?: string
        color?: string
        keywords?: string[]
        apply?: boolean
    }) => Promise<StudioApplyIconResult>
    /** The icon file a manifest declares, if any. */
    readDeclaredIcon: (manifestText: string) => string | null
    /** Content type for an icon file, by extension. */
    iconMimeType: (fileName: string) => string
    /** Whether a declared icon is a project file we can upload. */
    isUploadableIcon: (icon: string | null) => boolean
}

/** Who registered one service: the host itself, or one plugin. */
export interface StudioServiceOwner {
    type: 'core' | 'plugin'
    pluginName?: string
}

/**
 * Read-only view of the host's service registry.
 *
 * Structural (like every other injected shape here) so the tool layer needs no
 * runtime dependency: the plugin entry passes `getBoundServiceRegistry()`, tests
 * pass a fake.
 */
export interface StudioServiceRegistry {
    /** Every registered service, keyed by name. */
    getAll(): Record<string, unknown>
    /** Who owns one service, when the host tracks ownership. */
    getOwner?(name: string): StudioServiceOwner | undefined
}

export interface StudioDevBridge {    start(options: { root: string; watch?: boolean; writeToDisk?: boolean; externals?: string[] }): Promise<StudioSessionStatus>
    build(options: { root: string; writeToDisk?: boolean; watch?: boolean; externals?: string[] }): Promise<StudioSessionStatus>
    stop(options: { root: string }): Promise<boolean>
    status(options?: { root?: string }): Promise<StudioSessionStatus[]>
    logs(options: { root: string; limit?: number }): Promise<StudioLogEntry[]>
    scaffold(options: {
        parentDir?: string
        name: string
        displayName?: string
        pluginKey?: string
        template?: string
        overwrite?: boolean
    }): Promise<{ root: string; pluginKey: string; template?: string; files: string[]; managed: boolean }>
    list(options?: { dir?: string }): Promise<StudioProjectEntry[]>
    readFile(options: { path: string }): Promise<string>
    writeFile(options: { path: string; contents?: string }): Promise<void>
    /** Read the standard host packages' source; see StudioHostApiResult. */
    hostApi(options?: {
        package?: string
        path?: string
        query?: string
        limit?: number
    }): Promise<StudioHostApiResult>
    /** List, search or grep one project's files; see StudioFilesResult. */
    files(options: {
        root: string
        query?: string
        pattern?: string
        include?: string
        ignoreCase?: boolean
        context?: number
        outputMode?: StudioGrepMode
        limit?: number
    }): Promise<StudioFilesResult>
    /** Install npm packages into a project; see StudioInstallResult. */
    installDependencies(options: {
        root: string
        packages: string[]
        dev?: boolean
        manager?: string
        timeoutMs?: number
    }): Promise<StudioInstallResult>
    /**
     * Stop a project's session and delete its files from disk. The host refuses
     * anything that is not a plugin project, so this cannot be used as a general
     * filesystem delete.
     */
    removeProject(options: { root: string }): Promise<StudioRemoveResult>
    /**
     * Delete one file inside a project. The host confines the file to the
     * project root and refuses the manifest and the entry file.
     */
    deleteFile(options: { root: string; path: string }): Promise<StudioDeleteFileResult>
}

/**
 * The lifecycle operations the studio may perform on the host registry: install
 * a freshly built bundle (the hot-reload preview), and drop that same preview
 * again when the project behind it is deleted. The studio deliberately has no
 * view of, or control over, the rest of the installed plugin set — that is the
 * plugin manager's surface, not the studio's.
 */
export interface StudioPluginHost {
    installFromSource(options: {
        code: string
        pluginKey: string
        name: string
        version?: string
        replace?: boolean
        sourceLabel?: string
        /** Why the install was refused, verbatim (the host's own explanation). */
        onRejected?: (reason: string) => void
    }): Promise<boolean>
    /** Uninstall by runtime name; used only for the project's own dev preview. */
    uninstall?(name: string): boolean
    /** Whether a runtime plugin name is currently active. */
    has?(name: string): boolean
}

/**
 * The host dev-session service as the tools use it.
 *
 * Structural on purpose: the tools must not import `@kn/common` (they run in
 * tests without the host), so they describe the two calls they need.
 */
export interface StudioDevHost {
    watch(project: { root: string; pluginKey: string; name: string }): Promise<{
        outcome?: { ok: boolean; reason?: string }
    }>
    unwatch(root: string): void
    build(options: { root: string; writeToDisk?: boolean; externals?: string[] }): Promise<{
        status?: StudioSessionStatus
        outcome?: { ok: boolean; reason?: string }
    }>
}

export interface StudioMarketplaceMine {
    id: string | number
    name?: string
    pluginKey?: string
    version?: string
    status?: string
    [key: string]: unknown
}

/** Plugin-catalogue lifecycle surface (上架 / 发布 / 升级). */
export interface StudioPluginMarketplace {
    listMine(): Promise<StudioMarketplaceMine[]>
    listInstalled(): Promise<Array<Record<string, unknown>>>
    uploadArtifact(input: { fileName: string; data: Blob }): Promise<{ resourcePath: string; integrity?: string }>
    submit(input: Record<string, unknown>): Promise<unknown>
    publishVersion(pluginId: string | number, input: Record<string, unknown>): Promise<unknown>
    upgrade(versionId: string | number): Promise<void>
}

/**
 * Background-task seam (kernel `background: true` support).
 *
 * A build, an npm install and a release all take long enough that holding the
 * agent's run — and the run's document write lease — for them is the wrong
 * trade. The kernel owns the task board (waiting, cancellation, the completion
 * note); the studio only decides *what work* may go there, so it takes a runner
 * by injection like every other service and stays dependency-free.
 *
 * Structural on purpose: the tools must not import `@kn/common` (they run in
 * tests without the host). `plugin-entry` passes the kernel's own runner.
 */
export interface StudioBackgroundRunHandle {
    /** One-line progress note (shown in task listings / the UI). */
    progress(text: string): void
    /** True once someone cancelled: long work cannot be stopped, only abandoned. */
    readonly cancelled: boolean
}

export interface StudioBackgroundStartRequest {
    tool: string
    title: string
    conversationId?: string | null
    owner?: string | null
    meta?: Record<string, unknown>
    onCancel?: () => void
    run: (handle: StudioBackgroundRunHandle) => Promise<unknown>
}

export interface StudioBackgroundRunner {
    /** Start the task; the returned value is what the tool call answers with. */
    start(request: StudioBackgroundStartRequest): unknown
}

/** What the frontend tool executor hands a tool about its calling run. */
export interface StudioToolExecContext {
    /** Delegated sub-run id, or null/undefined for the main agent. */
    owner?: string | null
    /** Conversation the call belongs to: background tasks are scoped to it. */
    conversationId?: string | null
}

export interface StudioToolDeps {
    /** The desktop bridge's dev surface, or undefined on a non-dev host. */
    getDev: () => StudioDevBridge | undefined
    /**
     * The whole `desktop` core service — the channel through which a plugin
     * consumes host capabilities (`desktop.ssh`, `desktop.dev`, `fs.*`, …).
     *
     * Injected so the studio can answer "what can a plugin I write actually
     * call on this host?" from the live bridge instead of a hand-maintained
     * list; absent on the web and in tests that do not care.
     */
    getDesktop?: () => StudioDesktopBridge | undefined
    /** The host plugin registry's hot-install surface, or undefined when absent. */
    getPluginHost: () => StudioPluginHost | undefined
    /**
     * The host's dev-session binding, when it publishes one.
     *
     * Preferred over driving installs from here: the binding belongs to the host
     * and outlives this page, so a project keeps hot-reloading the window while
     * the developer (or the model) looks at something else.
     */
    getDevHost?: () => StudioDevHost | undefined
    /** Plugin-marketplace lifecycle service; optional for older hosts and tests. */
    getMarketplace?: () => StudioPluginMarketplace | undefined
    /**
     * The host's published global namespace (`window.__KN__`), used to check
     * whether a declared `externals` entry actually exists. Injectable so tests
     * do not need a host window.
     */
    getHostGlobals?: () => Record<string, unknown>
    /**
     * Read-only view of the host's service registry (`getBoundServiceRegistry`),
     * for discovering what the installed plugins and the host expose. Absent on
     * a host that bound no registry.
     */
    getServiceRegistry?: () => StudioServiceRegistry | undefined
    /**
     * Icon rendering + application (`./icons/icon-art`), plus the host's icon
     * namespace. Absent only on a host that exposes no `@kn/icon`.
     */
    getIconToolkit?: () => StudioIconToolkit | undefined
    /**
     * Hand a produced artifact to the host as the conversation's working target
     * (the kernel side pane). The plugin entry resolves the artifact from the
     * result through its mapper table; the studio's tools only report "this call
     * produced something" and never touch the kernel themselves.
     *
     * Returns true when a surface actually showed it. Absent on a host with no
     * kernel pane, and best-effort otherwise.
     */
    focusArtifactResult?: (tool: string, result: unknown, args: unknown) => boolean
    /**
     * Kernel background-task runner. Absent in tests and on hosts that do not
     * publish one, where `background: true` is refused with an explanation
     * instead of silently blocking the run.
     */
    getBackgroundRunner?: () => StudioBackgroundRunner | undefined
    /**
     * What a background task produces, per phase. Injected by the plugin entry
     * from `./artifacts/surface` (the kernel-facing mapper table), because the
     * tool layer must not import React and the artifact contract is structural.
     *
     * Without it a background build is invisible: the transcript only ever holds
     * the handle, so nothing would put the project on the artifacts shelf while
     * the build is running.
     */
    backgroundArtifact?: (input: {
        tool: string
        args: unknown
        status: 'running' | 'succeeded' | 'failed' | 'cancelled'
        result?: unknown
        error?: string
    }) => StudioArtifactRef | null
}

/** Structural copy of the kernel's `AgentArtifact` (see `@kn/common`). */
export interface StudioArtifactRef {
    kind: string
    id: string
    title?: string
    subtitle?: string
    data?: unknown
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const requireDev = (deps: StudioToolDeps): StudioDevBridge => {
    const dev = deps.getDev()
    if (!dev) {
        throw new Error(
            '插件开发台不可用：当前宿主不是支持 dev.* 能力的桌面客户端。请在 KN 桌面客户端中使用。',
        )
    }
    return dev
}

/**
 * The hot-install surface. Installing a build is the studio's only registry
 * operation: it has no business listing or uninstalling the user's plugins.
 */
const requirePluginHost = (deps: StudioToolDeps): StudioPluginHost => {
    const pluginHost = deps.getPluginHost()
    if (!pluginHost) throw new Error('宿主未注册 pluginHost 服务，无法热更插件')
    return pluginHost
}

const requireMarketplace = (deps: StudioToolDeps): StudioPluginMarketplace => {
    const marketplace = deps.getMarketplace?.()
    if (!marketplace) throw new Error('宿主未注册 pluginMarketplace 服务，无法发布/升级插件')
    return marketplace
}

const requireHostApi = (deps: StudioToolDeps): NonNullable<StudioDevBridge['hostApi']> => {
    const dev = requireDev(deps)
    if (typeof dev.hostApi !== 'function') {
        throw new Error(
            '当前桌面端不支持读取标准包接口（缺少 dev.hostApi 能力），请升级 KN 桌面客户端。',
        )
    }
    return dev.hostApi.bind(dev)
}

const requireFiles = (deps: StudioToolDeps): NonNullable<StudioDevBridge['files']> => {
    const dev = requireDev(deps)
    if (typeof dev.files !== 'function') {
        throw new Error('当前桌面端不支持工程文件检索（缺少 dev.files 能力），请升级 KN 桌面客户端。')
    }
    return dev.files.bind(dev)
}

const requireInstall = (deps: StudioToolDeps): NonNullable<StudioDevBridge['installDependencies']> => {
    const dev = requireDev(deps)
    if (typeof dev.installDependencies !== 'function') {
        throw new Error(
            '当前桌面端不支持安装第三方依赖（缺少 dev.installDependencies 能力），请升级 KN 桌面客户端。',
        )
    }
    return dev.installDependencies.bind(dev)
}

const requireRemove = (deps: StudioToolDeps): NonNullable<StudioDevBridge['removeProject']> => {
    const dev = requireDev(deps)
    if (typeof dev.removeProject !== 'function') {
        throw new Error(
            '当前桌面端不支持删除插件工程（缺少 dev.remove 能力），请升级 KN 桌面客户端。',
        )
    }
    return dev.removeProject.bind(dev)
}

const requireDeleteFile = (deps: StudioToolDeps): NonNullable<StudioDevBridge['deleteFile']> => {
    const dev = requireDev(deps)
    if (typeof dev.deleteFile !== 'function') {
        throw new Error(
            '当前桌面端不支持删除工程内文件（缺少 dev.deleteFile 能力），请升级 KN 桌面客户端。',
        )
    }
    return dev.deleteFile.bind(dev)
}

const requireIconToolkit = (deps: StudioToolDeps): StudioIconToolkit => {
    const toolkit = deps.getIconToolkit?.()
    if (!toolkit || typeof toolkit.applyIcon !== 'function') {
        throw new Error('当前宿主没有提供图标工具（缺少 @kn/icon 命名空间），无法生成插件图标。')
    }
    return toolkit
}

/** Join a project-relative path onto a root, without importing path helpers. */
const joinRoot = (root: string, relative: string): string =>
    `${root.replace(/[\\/]+$/, '')}/${relative.replace(/^[\\/]+/, '')}`

/** Last path segment; used when the caller only knows the project root. */
const lastSegment = (value: string): string => value.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? value

/**
 * Offer a produced artifact as the conversation's working target.
 *
 * Best-effort by construction: a host without the kernel pane, or a mapper that
 * does not recognize this result, must never turn a successful build into a
 * failed tool call.
 */
const focusProducedArtifact = (
    deps: StudioToolDeps,
    tool: string,
    result: unknown,
    args: unknown,
): boolean => {
    if (!deps.focusArtifactResult) return false
    try {
        return deps.focusArtifactResult(tool, result, args) === true
    } catch {
        return false
    }
}

/* ------------------------------------------------------------------ *
 * Scaffold templates
 * ------------------------------------------------------------------ */

/** Template ids; mirrors the desktop bundler's SCAFFOLD_TEMPLATES. */
export const SCAFFOLD_TEMPLATES = ['panel', 'page', 'settings', 'command', 'blank'] as const

export type ScaffoldTemplate = (typeof SCAFFOLD_TEMPLATES)[number]

/** What each template already gives you, and what to edit next. */
const TEMPLATE_NOTES: Record<ScaffoldTemplate, string> = {
    panel: '侧边停靠面板：改 src/DevPanel.tsx 做面板内容，改 src/index.tsx 调面板注册信息（id/title/order/position）。',
    page: '整页视图（pageTypes）：改 src/CanvasPage.tsx 渲染页面；pageTypes 的 id 用了就不要再改。',
    settings: '设置面板：改 src/SettingsPanel.tsx，它会出现在宿主设置对话框里你的插件分组下。',
    command: '编辑器斜杠命令：改 src/slash-command.ts 的 text/slash/action，在编辑器输入 “/” 即可看到。',
    blank: '空白工程：在 src/index.tsx 里按需加贡献点（dockPanels、pageTypes、settings、editorExtension、tools…）。',
}

/* ------------------------------------------------------------------ *
 * Host globals (externals)
 * ------------------------------------------------------------------ */

/** The host's published namespace, or `{}` when there is no host window. */
const defaultHostGlobals = (): Record<string, unknown> => {
    const namespace = (globalThis as { __KN__?: Record<string, unknown> }).__KN__
    return namespace && typeof namespace === 'object' ? namespace : {}
}

const readHostGlobals = (deps: StudioToolDeps): Record<string, unknown> =>
    (deps.getHostGlobals ?? defaultHostGlobals)()

/**
 * The host-namespace name a specifier resolves to.
 *
 * Mirrors the bundler's `hostNameForExternal`: a declared external is a *host
 * global*, so the scope is dropped (`@scope/pkg` → `pkg`). Kept in sync by hand
 * because this module is deliberately dependency-free at runtime.
 */
export const hostNameForExternal = (specifier: string): string => {
    if (!specifier.startsWith('@')) return specifier
    const slash = specifier.indexOf('/')
    return slash === -1 ? specifier : specifier.slice(slash + 1)
}

/**
 * Modules the host always injects, whether or not they show up as globals.
 *
 * Keep this list in sync with `DEFAULT_HOST_MODULES` in the dev-server bundler:
 * it is the same "host always provides this" contract, and it is what
 * `assertExternalsAvailable` short-circuits on.
 */
export const BUILTIN_HOST_MODULES = [
    'react',
    'react-dom',
    'react-dom/client',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    '@kn/common',
    '@kn/core',
    '@kn/ui',
    '@kn/icon',
    '@kn/editor',
    '@kn/plugin-api',
]

const BUILTIN_HOST_MODULE_SET = new Set(BUILTIN_HOST_MODULES)

/**
 * What each `desktop.<family>.` capability family is for.
 *
 * Deliberately family-level (not per-capability): the authoritative
 * per-capability list comes from the live bridge, and the parameter/result types
 * come from `@kn/common`'s `desktop-bridge.ts`. This map only adds the "what is
 * this for / what is the guard rail" that a name like `fs.remove` cannot convey.
 */
const CAPABILITY_FAMILY_NOTES: Record<string, string> = {
    'system.': '应用与路径信息（版本、平台、标准目录）。只读。',
    'http.': '宿主代发 HTTP 请求（免 CORS）。有 SSRF 防护：私网/回环/云元数据默认拒绝，受 net.policy 开关控制。',
    'net.policy.': '读写网络策略（私网访问开关）。改它会放宽 http.request 的可达范围。',
    'capture.': '屏幕/区域截屏，需要用户交互授权。',
    'dialog.': '原生对话框（打开/保存文件、消息框）。对话框授予的路径会进入 fs 白名单。',
    'fs.': '本地文件读写与管理。**全部**受 fs 白名单限制（标准用户目录 + 对话框授权过的目录）。',
    'window.': '窗口状态（全屏、macOS 交通灯）与 DevTools 开关。',
    'app.': '应用级动作，例如退出。',
    'credentials.': '“记住登录”凭证（safeStorage 加密）。宿主自己的登录态用它，插件不应顺手读取。',
    'dev.': '插件开发台：构建/热更/工程文件/依赖安装。只有开发台这类工具插件需要；主进程侧的 dev-server 是唯一能被它拉起的进程。',
    'ssh.': 'SSH 远程执行与文件传输（用你自己的 OpenSSH）。过网络策略，且每个主机在本次运行内首次使用需用户确认；宿主不接收也不保存凭证。',
    'storage.': '持久化 KV（桌面 SQLite / Web localStorage）。插件必须留在自己的 `plugin.<pluginKey>` 命名空间里。',
}

const normalizeExternals = (value: unknown): string[] => {
    if (value === undefined || value === null) return []
    if (!Array.isArray(value)) throw new Error('externals 必须是字符串数组')
    const externals: string[] = []
    for (const item of value) {
        if (typeof item !== 'string' || !item.trim()) {
            throw new Error('externals 的每一项都必须是非空字符串（要当成宿主全局的 import 名）')
        }
        if (!externals.includes(item.trim())) externals.push(item.trim())
    }
    if (externals.length > 24) throw new Error('externals 最多 24 项')
    return externals
}

/**
 * Refuse to build with an `externals` entry the running host cannot resolve.
 *
 * Without this, a typo compiles fine and the plugin dies at runtime with an
 * empty module — the failure mode this feature exists to avoid. The check runs
 * in the same window the bundle will run in, so its answer is authoritative.
 * The standard host modules count as available whether or not they are listed
 * in the namespace, because the bundler injects them unconditionally.
 */
const assertExternalsAvailable = (deps: StudioToolDeps, externals: string[]): string[] => {
    if (externals.length === 0) return externals
    const namespace = readHostGlobals(deps)
    const isAvailable = (specifier: string): boolean => {
        if (BUILTIN_HOST_MODULE_SET.has(specifier)) return true
        const name = hostNameForExternal(specifier)
        const fromNamespace = namespace[name]
        if (fromNamespace !== undefined && fromNamespace !== null) return true
        const fromGlobal = (globalThis as Record<string, unknown>)[name]
        return fromGlobal !== undefined && fromGlobal !== null
    }
    const missing = externals.filter((specifier) => !isAvailable(specifier))
    if (missing.length === 0) return externals

    const available = Object.keys(namespace)
        .filter((name) => namespace[name] !== undefined && namespace[name] !== null)
        .sort()
    throw new Error(
        `externals 里这些模块在当前宿主里不存在：${missing.join('、')}。` +
            `externals 只能声明宿主已经暴露的全局模块（名字是包名去掉 scope，如 @scope/pkg → pkg），` +
            `可用的一共有：${available.join('、') || '（无）'}；` +
            `react、react-dom 与 @kn/* 由宿主始终注入，不需要声明。` +
            `第三方 npm 包请改用 installPluginDependencies 安装（打包时会打进产物），不要写成 externals。`,
    )
}

/**
 * Absolute paths the agent has observed this session. DSH's fs-observation
 * policy: an edit is refused until the file has been read (or written), so
 * the model never blind-replaces text it has not actually seen.
 */
const observedFiles = new Set<string>()

const requireObservation = (path: string, action = '编辑'): void => {
    if (!observedFiles.has(path)) {
        throw new Error(
            `请先调用 readPluginProjectFile({ path: "${path}" }) 查看当前内容再${action}；禁止未读就${action}。`,
        )
    }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Wait for a build newer than `previous`, so a caller observes the result of the
 * change it just made rather than the previous successful build.
 */
const waitForFreshBuild = async (
    deps: StudioToolDeps,
    root: string,
    previous: number,
    timeoutMs = 20_000,
): Promise<StudioSessionStatus | undefined> => {
    const dev = requireDev(deps)
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        const [status] = await dev.status({ root })
        // A failed rebuild never bumps buildCount; surface it immediately.
        if (status && (status.buildCount > previous || status.state === 'failed' || status.error)) {
            return status
        }
        await sleep(120)
    }
    const [status] = await dev.status({ root })
    return status
}

/**
 * What to tell a caller whose reload was *rejected*.
 *
 * The host loads and validates the new bundle before it touches the registry, so
 * a bundle that throws while being evaluated leaves the previous version running.
 * The caller has to hear that — and *why*: `installed: false` on its own reads as
 * a detail of a successful build, and the model would then describe a preview
 * that did not actually change. `reason` is the host's own explanation.
 */
const rejectedReloadNote = (name: string, reason: string): string =>
    `⚠️ 热更被拒绝（${name}）：${reason || '宿主没有说明原因'}。窗口里仍是上一个可用版本。`

const summarize = (status: StudioSessionStatus | undefined) => {
    if (!status) return { ok: false, error: '没有找到该工程的会话' }
    return {
        // A failed rebuild keeps state 'watching' (the session survives), so the
        // error is also part of the success signal — otherwise a stale, still-
        // present build would be reported as success and re-installed.
        ok: status.state !== 'failed' && !status.error,
        root: status.root,
        state: status.state,
        pluginKey: status.plugin?.pluginKey ?? null,
        name: status.plugin?.name ?? null,
        buildCount: status.buildCount,
        bytes: status.build?.bytes ?? null,
        durationMs: status.build?.durationMs ?? null,
        modules: status.build?.modules ?? [],
        error: status.error ?? null,
    }
}

const summarizeProject = (project: StudioProjectEntry) => ({
    root: project.root,
    name: project.name,
    pluginKey: project.pluginKey ?? null,
    displayName: project.displayName ?? null,
    entry: project.entry ?? null,
    active: Boolean(project.active),
})

/** A handle for work that is running in the foreground: nothing to report. */
const NOOP_HANDLE: StudioBackgroundRunHandle = { progress: () => {}, cancelled: false }

/** Last path segment — the label a task listing shows. */
const projectLabel = (root: string): string => {
    const parts = String(root ?? '').split(/[\\/]/).filter(Boolean)
    return parts[parts.length - 1] || String(root ?? '')
}

/**
 * Run long tool work either inline (the tool blocks, as it always did) or on the
 * kernel's task board, where the agent decides whether to wait.
 *
 * One code path for both modes: the work function is identical, so a background
 * build and a foreground build cannot drift apart in what they do — only in when
 * the model learns the answer.
 *
 * `background: true` is a *request*. If the host publishes no runner the call is
 * refused with an explanation: quietly blocking would look to the model like the
 * host ignored the parameter, and the server's 600s tool timeout is the only
 * thing that would eventually say otherwise.
 */
const runToolWork = async (
    deps: StudioToolDeps,
    request: {
        tool: string
        title: string
        /** The call's own arguments: the artifact mapper reads `root` from them. */
        args: unknown
        background?: boolean
        meta?: Record<string, unknown>
        onCancel?: () => void
    },
    execCtx: StudioToolExecContext | undefined,
    work: (handle: StudioBackgroundRunHandle) => Promise<unknown>,
): Promise<unknown> => {
    if (request.background !== true) return work(NOOP_HANDLE)
    const runner = deps.getBackgroundRunner?.()
    if (!runner) {
        throw new Error(
            '当前宿主没有后台任务能力（background: true 不可用）：请去掉 background 参数重试，'
            + '本次调用会等它跑完再返回。',
        )
    }
    const mapper = deps.backgroundArtifact
    return runner.start({
        tool: request.tool,
        title: request.title,
        conversationId: execCtx?.conversationId ?? null,
        owner: execCtx?.owner ?? null,
        ...(request.meta ? { meta: request.meta } : {}),
        ...(request.onCancel ? { onCancel: request.onCancel } : {}),
        // The task carries the artifact for its whole life (see the kernel's
        // task board): a background build must be the conversation's working
        // target while it is still being built, not only afterwards.
        ...(mapper
            ? {
                artifact: (state: {
                    status: 'running' | 'succeeded' | 'failed' | 'cancelled'
                    result?: unknown
                    error?: string
                }) => mapper({
                    tool: request.tool,
                    args: request.args,
                    status: state.status,
                    result: state.result,
                    error: state.error,
                }),
            }
            : {}),
        run: work,
    })
}

/* ------------------------------------------------------------------ *
 * Tools
 * ------------------------------------------------------------------ */

export const createStudioTools = (deps: StudioToolDeps) => ({
    listPluginProjects: {
        description:
            '列出本机（桌面端插件开发台管理的）插件工程目录。返回每个工程的 root 路径、pluginKey、入口文件和是否正在监听。' +
            '开发新插件前先调用它，避免重复创建；返回空数组表示还没有工程。',
        inputSchema: {
            type: 'object',
            properties: {
                dir: {
                    type: 'string',
                    description: '可选。要扫描的目录；省略时使用宿主管理的内置工程目录（userData/plugin-projects）。',
                },
            },
        },
        readOnly: true,
        execute: async (args: { dir?: string }) => {
            const projects = await requireDev(deps).list(args?.dir ? { dir: args.dir } : undefined)
            return {
                count: projects.length,
                projects: projects.map(summarizeProject),
                hint: projects.length
                    ? '用 runPluginProject 开始监听并热更，用 buildPluginProject 只构建一次。'
                    : '还没有工程：用 createPluginProject 创建一个（不需要选择目录）。',
            }
        },
    },

    createPluginProject: {
        description:
            '在桌面端内置的插件工程目录里新建一个最小可运行的插件工程（生成 package.json、src/index.tsx、对应模板的组件、README.md）。' +
            '不需要用户选择目录。template 决定工程从哪个贡献点起步（panel 侧边面板 / page 整页 / settings 设置面板 / command 编辑器斜杠命令 / blank 空白），默认 panel；每个模板都能直接构建通过。' +
            '创建后用 writePluginProjectFile 改写源码，再用 runPluginProject 热更预览。',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: '工程目录名/包名，例如 my-kn-plugin（字母数字开头，可含 . _ -）。',
                },
                displayName: { type: 'string', description: '可选。插件显示名，例如「我的插件」。' },
                pluginKey: { type: 'string', description: '可选。宿主注册表的键，默认与 name 相同。' },
                template: {
                    type: 'string',
                    enum: [...SCAFFOLD_TEMPLATES],
                    description:
                        '可选。工程模板，默认 panel。panel=侧边停靠面板；page=整页 pageType 渲染器；settings=设置对话框里的面板；command=编辑器 “/” 斜杠命令；blank=空白工程。',
                },
                parentDir: {
                    type: 'string',
                    description: '可选。只在用户明确要求放到某个已有目录时才传；省略则用内置目录（推荐）。',
                },
                overwrite: { type: 'boolean', description: '可选。目标目录非空时是否覆盖，默认 false。' },
            },
            required: ['name'],
        },
        execute: async (args: {
            name: string
            displayName?: string
            pluginKey?: string
            template?: string
            parentDir?: string
            overwrite?: boolean
        }) => {
            const template = args.template ?? 'panel'
            if (!SCAFFOLD_TEMPLATES.includes(template as ScaffoldTemplate)) {
                throw new Error(
                    `未知的模板 "${String(args.template)}"；可选：${SCAFFOLD_TEMPLATES.join('、')}。`,
                )
            }
            const chosen = template as ScaffoldTemplate
            const created = await requireDev(deps).scaffold({
                name: args.name,
                displayName: args.displayName,
                pluginKey: args.pluginKey,
                template: chosen,
                parentDir: args.parentDir,
                overwrite: args.overwrite,
            })
            return {
                ok: true,
                root: created.root,
                pluginKey: created.pluginKey,
                template: created.template ?? chosen,
                managed: created.managed,
                files: created.files,
                templateNote: TEMPLATE_NOTES[chosen],
                next: `用 writePluginProjectFile 修改 ${created.root}/src/index.tsx，然后 runPluginProject({ root: "${created.root}" }) 热更预览。`,
            }
        },
    },

    writePluginProjectFile: {
        description:
            '写入（或覆盖）插件工程里的一个文件，自动创建父目录。适合新建文件或整体重写；只改少量内容时请优先用 editPluginProjectFile，避免整文件重写带来的错误与 token 浪费。' +
            '只能写在本机允许的目录内（用户目录 / 工程目录）。',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: '文件绝对路径。' },
                contents: { type: 'string', description: '文件内容（UTF-8 文本）。' },
            },
            required: ['path', 'contents'],
        },
        execute: async (args: { path: string; contents: string }) => {
            if (typeof args?.contents !== 'string') throw new Error('contents 必须是字符串')
            await requireDev(deps).writeFile({ path: args.path, contents: args.contents })
            observedFiles.add(args.path)
            return { ok: true, path: args.path, bytes: args.contents.length }
        },
    },

    readPluginProjectFile: {
        description:
            '读取插件工程里的一个文件，返回带行号的内容（行号从 1 开始），用于编辑前确认现状。' +
            '大文件可用 offset/limit 只读片段。编辑任何文件前都必须先读它。',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: '文件绝对路径。' },
                offset: { type: 'number', description: '可选。起始行号（1 起），默认 1。' },
                limit: { type: 'number', description: '可选。最多返回行数，默认 400。' },
            },
            required: ['path'],
        },
        readOnly: true,
        execute: async (args: { path: string; offset?: number; limit?: number }) => {
            const contents = await requireDev(deps).readFile({ path: args.path })
            observedFiles.add(args.path)
            const raw = contents.split('\n')
            const all = raw.length > 0 && raw[raw.length - 1] === '' ? raw.slice(0, -1) : raw
            const offset = Math.max(1, Math.floor(args.offset ?? 1))
            const limit = Math.max(1, Math.floor(args.limit ?? 400))
            const slice = all.slice(offset - 1, offset - 1 + limit)
            return {
                ok: true,
                path: args.path,
                bytes: contents.length,
                totalLines: all.length,
                startLine: offset,
                endLine: offset - 1 + slice.length,
                lines: slice.map((text, index) => ({ number: offset + index, text })),
            }
        },
    },

    editPluginProjectFile: {
        description:
            '对插件工程里的文件做精确替换：把 oldString 字面量替换为 newString。' +
            'oldString 在文件中必须唯一，否则报错——请带足上下文；确实要全部替换时传 replaceAll: true。' +
            '编辑前必须先用 readPluginProjectFile 读过该文件。改代码优先用它，而不是整文件重写。',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: '文件绝对路径。' },
                oldString: { type: 'string', description: '要被替换的原文（精确匹配，含缩进与换行）。' },
                newString: { type: 'string', description: '替换后的文本；空字符串表示删除。' },
                replaceAll: { type: 'boolean', description: '可选。oldString 出现多次时是否全部替换，默认 false。' },
            },
            required: ['path', 'oldString', 'newString'],
        },
        execute: async (args: {
            path: string
            oldString: string
            newString: string
            replaceAll?: boolean
        }) => {
            if (typeof args?.oldString !== 'string' || args.oldString.length === 0) {
                throw new Error('oldString 必须是非空字符串')
            }
            if (typeof args?.newString !== 'string') throw new Error('newString 必须是字符串')
            requireObservation(args.path)
            const dev = requireDev(deps)
            const current = await dev.readFile({ path: args.path })
            const occurrences = current.split(args.oldString).length - 1
            if (occurrences === 0) {
                throw new Error('oldString 在文件中不存在；请先用 readPluginProjectFile 确认原文（注意缩进与换行）。')
            }
            if (occurrences > 1 && args.replaceAll !== true) {
                throw new Error(
                    'oldString 在文件中出现 ' + occurrences + ' 次；请扩大上下文使其唯一，或传 replaceAll: true。',
                )
            }
            // split/join 做字面量替换；String.replace 会把 newString 里的 $ 当模式。
            const next = current.split(args.oldString).join(args.newString)
            await dev.writeFile({ path: args.path, contents: next })
            const nextLines = next.split('\n')
            const totalLines = nextLines.length > 0 && nextLines[nextLines.length - 1] === ''
                ? nextLines.length - 1
                : nextLines.length
            return {
                ok: true,
                path: args.path,
                replacements: args.replaceAll === true ? occurrences : 1,
                bytes: next.length,
                totalLines,
            }
        },
    },

    listPluginProjectFiles: {
        description:
            '列出插件工程里的源码文件（工程内相对路径），自动跳过 node_modules/dist 等。' +
            '用于了解工程结构、找要改的文件；可选 include 按路径子串过滤（如 "src/"、".tsx"）。',
        inputSchema: {
            type: 'object',
            properties: {
                root: { type: 'string', description: '工程根目录。' },
                include: { type: 'string', description: '可选。路径子串过滤。' },
                limit: { type: 'number', description: '可选。最多返回条数，默认 400。' },
            },
            required: ['root'],
        },
        readOnly: true,
        execute: async (args: { root: string; include?: string; limit?: number }) => {
            const result = await requireFiles(deps)({ root: args.root, include: args.include, limit: args.limit })
            if (result.kind !== 'list') throw new Error('dev.files 返回了意外的结果')
            return {
                root: result.root,
                count: result.files.length,
                truncated: result.truncated,
                files: result.files,
            }
        },
    },

    searchPluginProject: {
        description:
            '在插件工程源码里按子串搜索，返回文件、行号与该行内容。改代码前用它定位符号与调用点；可选 include 限定路径。',
        inputSchema: {
            type: 'object',
            properties: {
                root: { type: 'string', description: '工程根目录。' },
                query: { type: 'string', description: '要搜索的字符串（大小写不敏感）。' },
                include: { type: 'string', description: '可选。路径子串过滤，如 "src/"。' },
                limit: { type: 'number', description: '可选。最多返回条数，默认 60。' },
            },
            required: ['root', 'query'],
        },
        readOnly: true,
        execute: async (args: { root: string; query: string; include?: string; limit?: number }) => {
            const result = await requireFiles(deps)({
                root: args.root,
                query: args.query,
                include: args.include,
                limit: args.limit,
            })
            if (result.kind !== 'search') throw new Error('dev.files 返回了意外的结果')
            return {
                root: result.root,
                count: result.matches.length,
                truncated: result.truncated,
                matches: result.matches,
            }
        },
    },

    grepPluginProject: {
        description:
            '在插件工程源码里按**正则表达式**检索（grep）：返回 文件 + 行号 + 该行内容，可带上下文行。' +
            '比 searchPluginProject 强的地方：正则、glob 过滤（*.tsx / src/**）、大小写开关、上下文、三种输出模式。' +
            '用法：找符号定义与调用点用 "export (function|const) Foo"；找 TODO 用 "TODO|FIXME"；' +
            '只要文件名列表用 outputMode: "files_with_matches"；先看哪个文件最多用 outputMode: "count"。' +
            '注意：pattern 是正则，要搜字面量需转义元字符（搜 foo( 要写 "foo\\("）；默认大小写敏感，忽略大小写传 ignoreCase: true。' +
            '结果是**有界**的：默认最多 80 条（limit 最大 200），只扫文本类文件、跳过 node_modules/dist 与超过 400KB 的文件，' +
            '并有约 2.5 秒的总时限；返回里的 truncated / timedOut / scanned / skippedLarge 说明结果是否完整，' +
            'truncated 或 timedOut 为 true 时不要当成「没有更多匹配」。',
        inputSchema: {
            type: 'object',
            properties: {
                root: { type: 'string', description: '工程根目录。' },
                pattern: {
                    type: 'string',
                    description:
                        '正则表达式（JS RegExp 语法），如 "useState\\(|useMemo\\(" 匹配这两个调用（注意 `(` 要转义，' +
                        '并且按 JSON 规则反斜杠还要再转义一次）。搜索字面量时要转义元字符。',
                },
                include: {
                    type: 'string',
                    description: '可选。路径过滤，逗号分隔，支持 glob 与子串：`*.tsx`、`src/**`、`src/`。',
                },
                ignoreCase: { type: 'boolean', description: '可选。忽略大小写，默认 false（grep 语义）。' },
                context: {
                    type: 'number',
                    description: '可选。每条匹配前后各带几行上下文（0–5，默认 0）。仅 content 模式有效。',
                },
                outputMode: {
                    type: 'string',
                    enum: ['content', 'files_with_matches', 'count'],
                    description: '可选。content（默认，带行内容）/ files_with_matches（只要文件）/ count（每文件条数）。',
                },
                limit: { type: 'number', description: '可选。最多返回条数，默认 80，上限 200。' },
            },
            required: ['root', 'pattern'],
        },
        readOnly: true,
        execute: async (args: {
            root: string
            pattern: string
            include?: string
            ignoreCase?: boolean
            context?: number
            outputMode?: StudioGrepMode
            limit?: number
        }) => {
            const result = await requireFiles(deps)({
                root: args.root,
                pattern: args.pattern,
                include: args.include,
                ignoreCase: args.ignoreCase,
                context: args.context,
                outputMode: args.outputMode,
                limit: args.limit,
            })
            if (result.kind !== 'grep') throw new Error('dev.files 返回了意外的结果（不是 grep）')
            return {
                root: result.root,
                mode: result.mode,
                pattern: result.pattern,
                count: result.mode === 'content' ? result.matches.length : result.mode === 'count' ? result.counts.length : result.files.length,
                scanned: result.scanned,
                skippedLarge: result.skippedLarge,
                truncated: result.truncated,
                timedOut: result.timedOut,
                ...(result.mode === 'content' ? { matches: result.matches } : {}),
                ...(result.mode === 'files_with_matches' ? { files: result.files } : {}),
                ...(result.mode === 'count' ? { counts: result.counts } : {}),
            }
        },
    },

    installPluginDependencies: {
        description:
            '在插件工程里安装第三方 npm 包：调用工程所用的包管理器（npm/pnpm/yarn）并写入 package.json。' +
            '安装成功后即可在源码里 import（打包时会打进产物；react 与 @kn/* 仍由宿主提供）。需要网络。' +
            '安装通常要几十秒到几分钟：不想在这里干等就传 background: true，之后用 getBackgroundTask 等结果。',
        inputSchema: {
            type: 'object',
            properties: {
                root: { type: 'string', description: '工程根目录。' },
                packages: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '要安装的包，如 ["date-fns@^3", "@octokit/rest"]。',
                },
                dev: { type: 'boolean', description: '可选。装到 devDependencies，默认 false。' },
                background: {
                    type: 'boolean',
                    description:
                        '可选。true = 后台安装：立即返回 taskId，安装继续在后台跑；' +
                        '之后用 getBackgroundTask({ taskId, wait: true }) 拿结果。默认 false（等安装完再返回）。',
                },
            },
            required: ['root', 'packages'],
        },
        execute: async (
            args: { root: string; packages: string[]; dev?: boolean; background?: boolean },
            _callId?: string,
            execCtx?: StudioToolExecContext,
        ) => {
            const work = async (handle: StudioBackgroundRunHandle) => {
                    handle.progress(`正在安装 ${(args.packages ?? []).join('、') || '（未指定包）'}`)
                    const result = await requireInstall(deps)({
                        root: args.root,
                        packages: Array.isArray(args.packages) ? args.packages : [],
                        dev: args.dev === true,
                    })
                    if (!result.ok) {
                        throw new Error(
                            '依赖安装失败（' + result.manager + '）：' + (result.error || '未知错误') + '\n' + result.output,
                        )
                    }
                    return {
                        ok: true,
                        manager: result.manager,
                        packages: result.packages,
                        output: result.output,
                        next: '现在可以在源码里 import 这些包；改完用 runPluginProject / buildPluginProject 验证。',
                    }
            }
            return runToolWork(
                deps,
                {
                    tool: 'installPluginDependencies',
                    title: `安装依赖 ${projectLabel(args.root)}`,
                    args,
                    background: args.background,
                    meta: { root: args.root, packages: args.packages },
                },
                execCtx,
                work,
            )
        },
    },

    listMyPlugins: {
        description:
            '列出我在插件市场上的插件与提交记录（含审核状态、id、pluginKey、版本）。发布新版本或查看审核进度前先调用它拿到 pluginId。',
        inputSchema: { type: 'object', properties: {} },
        readOnly: true,
        execute: async () => {
            const plugins = await requireMarketplace(deps).listMine()
            return { count: plugins.length, plugins }
        },
    },

    publishPluginProject: {
        description:
            '把插件工程构建并发布到插件市场：先构建，再上传产物；新插件走“上架”（提交审核，不传 pluginId），' +
            '已上架插件走“发布新版本”（传 pluginId，来自 listMyPlugins）。' +
            '两种模式都会带上工程的图标（清单里的 knPluginStudio.icon，用 generatePluginIcon 生成）——' +
            '升版时可以借它改图标，图标在版本审核通过后才对市场生效。' +
            '构建 + 上传 + 提交要跑一段时间（图标上传还要读盘）：不想干等就传 background: true，之后用 getBackgroundTask 等结果。',
        inputSchema: {
            type: 'object',
            properties: {
                root: { type: 'string', description: '工程根目录。' },
                version: { type: 'string', description: '语义化版本，如 1.0.0。' },
                pluginId: {
                    type: ['string', 'number'],
                    description: '已上架插件的 id；发布新版本时传，上架新插件时省略。',
                },
                name: { type: 'string', description: '插件显示名（省略时取工程清单）。' },
                pluginKey: { type: 'string', description: '注册键（省略时取工程清单）。' },
                description: { type: 'string', description: '插件描述（上架新插件必填，至少 10 字）。' },
                category: { type: 'string', enum: ['APP', 'FEATURE', 'CONNECTOR'], description: '分类，默认 FEATURE。' },
                tags: { type: 'array', items: { type: 'string' }, description: '可选标签，1-5 个。' },
                icon: {
                    type: 'string',
                    description:
                        '可选图标：已上传的资源路径；省略时自动上传清单里的 knPluginStudio.icon 文件（见 generatePluginIcon）。上架与升版都会用它。',
                },
                permissions: { type: 'array', items: { type: 'string' }, description: '可选能力声明，如 NETWORK / DESKTOP。' },
                versionDescs: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            label: { type: 'string', description: '小节标题，如 Feature / Detail / ChangeLog。' },
                            content: { type: 'string', description: '该小节的富文本内容（JSON 字符串）。' },
                        },
                        required: ['label', 'content'],
                    },
                    description: '可选版本说明小节。',
                },
                background: {
                    type: 'boolean',
                    description:
                        '可选。true = 后台发布：立即返回 taskId，构建/上传/提交继续在后台跑；' +
                        '之后用 getBackgroundTask({ taskId, wait: true }) 拿结果（含 resourcePath、审核状态）。' +
                        '默认 false（等发布流程走完再返回）。',
                },
            },
            required: ['root', 'version'],
        },
        execute: async (
            args: {
                root: string
                version: string
                pluginId?: string | number
                name?: string
                pluginKey?: string
                description?: string
                category?: string
                tags?: string[]
                icon?: string
                permissions?: string[]
                versionDescs?: Array<{ label: string; content: string }>
                background?: boolean
            },
            _callId?: string,
            execCtx?: StudioToolExecContext,
        ) => {
            const work = async (handle: StudioBackgroundRunHandle) => {
                const dev = requireDev(deps)
                const marketplace = requireMarketplace(deps)
                handle.progress(`正在构建并发布 ${args.version}`)
                const status = await dev.build({ root: args.root })
                if (!status.build?.code) {
                    throw new Error('构建失败，无法发布：' + (status.error ?? '没有构建产物'))
                }
                const uploaded = await marketplace.uploadArtifact({
                    fileName: args.pluginKey ? args.pluginKey + '.js' : 'index.js',
                    data: new Blob([status.build.code], { type: 'text/javascript' }),
                })

                /**
                 * The marketplace icon, when the project has one.
                 *
                 * A plugin's icon is a declared FILE (`knPluginStudio.icon`), which
                 * `generatePluginIcon` writes — but the catalogue wants an uploaded
                 * image, and the tool used to require the caller to have uploaded it
                 * by hand. Upload it here instead, unless the caller passed a path
                 * they already uploaded.
                 */
                let icon = typeof args.icon === 'string' && args.icon ? args.icon : null
                let iconNote: string | undefined
                if (!icon) {
                    const toolkit = deps.getIconToolkit?.()
                    if (toolkit) {
                        try {
                            const manifestText = await dev.readFile({ path: joinRoot(args.root, 'package.json') })
                            const declared = toolkit.readDeclaredIcon(manifestText)
                            if (toolkit.isUploadableIcon(declared) && declared) {
                                const svg = await dev.readFile({ path: joinRoot(args.root, declared) })
                                const fileName = lastSegment(declared)
                                const uploadedIcon = await marketplace.uploadArtifact({
                                    fileName,
                                    data: new Blob([svg], { type: toolkit.iconMimeType(fileName) }),
                                })
                                icon = uploadedIcon.resourcePath
                                iconNote = `已上传工程图标 ${declared}。`
                            } else if (declared) {
                                icon = declared
                                iconNote = `清单声明的图标 "${declared}" 不是工程内文件（URL/data URI），原样提交。`
                            }
                        } catch (error) {
                            iconNote =
                                `清单声明了图标但上传失败（${(error as Error)?.message ?? error}）：` +
                                '可以先跑 generatePluginIcon 重新生成，或上架后到插件市场补图。'
                        }
                    }
                }

                if (args.pluginId !== undefined && args.pluginId !== null) {
                    await marketplace.publishVersion(args.pluginId, {
                        version: args.version,
                        resourcePath: uploaded.resourcePath,
                        integrity: uploaded.integrity,
                        // A version may rebrand the plugin; the server keeps the
                        // current icon when this is absent, and only shows the new
                        // one once the version is approved.
                        ...(icon ? { icon } : {}),
                        versionDescs: args.versionDescs,
                    })
                    return {
                        ok: true,
                        mode: 'version',
                        pluginId: args.pluginId,
                        version: args.version,
                        resourcePath: uploaded.resourcePath,
                        buildCount: status.buildCount,
                        ...(icon ? { icon } : {}),
                        iconNote,
                    }
                }
                const name = args.name ?? status.plugin.name
                const pluginKey = args.pluginKey ?? status.plugin.pluginKey
                await marketplace.submit({
                    name,
                    pluginKey,
                    version: args.version,
                    category: args.category ?? 'FEATURE',
                    description: args.description ?? name,
                    resourcePath: uploaded.resourcePath,
                    integrity: uploaded.integrity,
                    tags: args.tags,
                    icon,
                    permissions: args.permissions,
                    versionDescs: args.versionDescs,
                })
                return {
                    ok: true,
                    mode: 'submit',
                    pluginKey,
                    version: args.version,
                    resourcePath: uploaded.resourcePath,
                    buildCount: status.buildCount,
                    icon,
                    iconNote,
                }
            }
            return runToolWork(
                deps,
                {
                    tool: 'publishPluginProject',
                    title: `发布 ${projectLabel(args.root)} ${args.version}`,
                    args,
                    background: args.background,
                    meta: { root: args.root, version: args.version, pluginId: args.pluginId ?? null },
                },
                execCtx,
                work,
            )
        },
    },

    upgradePluginVersion: {
        description:
            '把已安装插件升级/更新到市场里的指定版本：传 versionId（目标版本记录 id，来自 listMyPlugins 或已安装列表）。',
        inputSchema: {
            type: 'object',
            properties: {
                versionId: { type: ['string', 'number'], description: '目标版本记录 id。' },
            },
            required: ['versionId'],
        },
        execute: async (args: { versionId: string | number }) => {
            await requireMarketplace(deps).upgrade(args.versionId)
            return { ok: true, versionId: args.versionId }
        },
    },

    runPluginProject: {
        description:
            '开始（或重启）监听一个插件工程，等首个构建完成后把它热更到当前应用窗口；之后保存文件会自动重新构建，' +
            '插件开发台面板打开时会把成功的重建自动热更到窗口（未打开时用 buildPluginProject 主动热更）。' +
            '这是"实时预览"的入口。返回构建结果或编译错误。' +
            '首个构建通常很快，但冷启动/依赖多时要等一会儿：不想干等就传 background: true（监听照常开启）。',
        inputSchema: {
            type: 'object',
            properties: {
                root: { type: 'string', description: '工程根目录（来自 listPluginProjects 或 createPluginProject）。' },
                watch: { type: 'boolean', description: '可选。是否持续监听，默认 true。' },
                autoInstall: { type: 'boolean', description: '可选。构建成功后是否自动热更，默认 true。' },
                focus: {
                    type: 'boolean',
                    description:
                        '可选。构建成功后是否把这个产物设为当前工作目标并在右侧预览里展示，默认 true。传 false 只构建、不打开预览。',
                },
                externals: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                        '可选。声明为“宿主全局模块”的 import 名，不打进产物。只用于宿主已经暴露的模块（名字是包名去掉 scope），' +
                        '先用 listHostGlobals 查；react、react-dom 与 @kn/* 无需声明。第三方 npm 包应改用 installPluginDependencies。' +
                        '省略表示沿用该工程上一次的声明，传 [] 才是清空。',
                },
                background: {
                    type: 'boolean',
                    description:
                        '可选。true = 后台执行：立即返回 taskId，监听与首个构建在后台进行；' +
                        '之后用 getBackgroundTask({ taskId, wait: true }) 拿构建结果。默认 false（等首个构建完成再返回）。',
                },
            },
            required: ['root'],
        },
        execute: async (
            args: {
                root: string
                watch?: boolean
                autoInstall?: boolean
                focus?: boolean
                externals?: string[]
                background?: boolean
            },
            _callId?: string,
            execCtx?: StudioToolExecContext,
        ) => {
            const work = async (handle: StudioBackgroundRunHandle) => {
                const externals = args.externals === undefined
                    ? undefined
                    : assertExternalsAvailable(deps, normalizeExternals(args.externals))
                handle.progress(`正在启动监听/首个构建 ${projectLabel(args.root)}`)
                const status = await requireDev(deps).start({
                    root: args.root,
                    watch: args.watch !== false,
                    externals,
                })
                const summary = summarize(status)
                if (!summary.ok || !status?.build) return summary

                let installed = false
                let reloadReason = ''
                if (args.autoInstall !== false) {
                    const devHost = deps.getDevHost?.()
                    if (devHost) {
                        // Bind the project in the *host*: every later build hot-reloads
                        // the window on its own, whether or not this page — or any page —
                        // is open. This is the difference the studio used to have to
                        // document as a limitation.
                        const binding = await devHost.watch({
                            root: status.root,
                            pluginKey: status.plugin.pluginKey,
                            name: status.plugin.name,
                        })
                        installed = binding.outcome?.ok !== false && Boolean(binding.outcome)
                        reloadReason = binding.outcome?.reason ?? ''
                    } else {
                        installed = await requirePluginHost(deps).installFromSource({
                            code: status.build.code,
                            pluginKey: status.plugin.pluginKey,
                            name: status.plugin.name,
                            version: `dev.${status.buildCount}`,
                            replace: true,
                            sourceLabel: status.root,
                            onRejected: (reason) => { reloadReason = reason },
                        })
                    }
                }
                const reloadNote = rejectedReloadNote(status.plugin.name, reloadReason)
                const result = {
                    ...summary,
                    ...(externals ? { externals } : {}),
                    installed,
                    // `installed: false` after a *successful* build is not a success:
                    // say why the window kept the previous version.
                    ...(args.autoInstall !== false && !installed
                        ? { reloadRejected: true, reloadNote }
                        : {}),
                    next: status.watching
                        ? (args.autoInstall !== false && !installed
                            ? reloadNote
                            : '现在编辑源码即可自动热更；改完用 buildPluginProject 可主动重建。')
                        : undefined,
                }
                // The build IS the artifact: make it the working target unless the
                // caller asked for a silent build. In background mode this runs when
                // the task settles — the side pane then opens on the finished build
                // exactly as it does for a foreground call.
                if (args.focus !== false) focusProducedArtifact(deps, 'runPluginProject', result, args)
                return result
            }
            return runToolWork(
                deps,
                {
                    tool: 'runPluginProject',
                    title: `监听/构建 ${projectLabel(args.root)}`,
                    args,
                    background: args.background,
                    meta: { root: args.root },
                },
                execCtx,
                work,
            )
        },
    },

    buildPluginProject: {
        description:
            '对插件工程做一次构建并热更到当前窗口（不改变监听状态）。适合改完源码后主动重建，或在监听未开启时预览一次。' +
            '构建失败会返回编译错误，宿主不会受影响。' +
            '依赖多/冷启动时构建可能要等十几秒：不想干等就传 background: true，之后用 getBackgroundTask 等结果。',
        inputSchema: {
            type: 'object',
            properties: {
                root: { type: 'string', description: '工程根目录。' },
                install: { type: 'boolean', description: '可选。构建成功后是否热更，默认 true。' },
                writeToDisk: { type: 'boolean', description: '可选。是否同时写 dist/index.js，默认 false。' },
                focus: {
                    type: 'boolean',
                    description:
                        '可选。构建成功后是否把这个产物设为当前工作目标并在右侧预览里展示，默认 true。传 false 只构建、不打开预览。',
                },
                externals: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                        '可选。声明为“宿主全局模块”的 import 名（同 runPluginProject）。省略表示沿用当前会话的声明；' +
                        '传了但与会话不同时，宿主会重启该会话来生效。',
                },
                background: {
                    type: 'boolean',
                    description:
                        '可选。true = 后台构建：立即返回 taskId，构建与热更在后台进行；' +
                        '之后用 getBackgroundTask({ taskId, wait: true }) 拿构建结果。默认 false（等构建完成再返回）。',
                },
            },
            required: ['root'],
        },
        execute: async (
            args: {
                root: string
                install?: boolean
                writeToDisk?: boolean
                focus?: boolean
                externals?: string[]
                background?: boolean
            },
            _callId?: string,
            execCtx?: StudioToolExecContext,
        ) => {
            const work = async (handle: StudioBackgroundRunHandle) => {
                const dev = requireDev(deps)
                const externals = args.externals === undefined
                    ? undefined
                    : assertExternalsAvailable(deps, normalizeExternals(args.externals))
                handle.progress(`正在构建 ${projectLabel(args.root)}`)

                const devHost = deps.getDevHost?.()
                if (devHost) {
                    // The host owns "wait for the fresh build, then install it": it has
                    // to, because that is the same path an ordinary file-save takes.
                    const { status, outcome } = await devHost.build({
                        root: args.root,
                        writeToDisk: args.writeToDisk === true,
                        externals,
                    })
                    const summary = summarize(status)
                    if (!summary.ok || !status?.build) return summary
                    const installed = args.install === false ? false : outcome?.ok !== false && Boolean(outcome)
                    const reloadNote = rejectedReloadNote(status.plugin.name, outcome?.reason ?? '')
                    const result = {
                        ...summary,
                        ...(externals ? { externals } : {}),
                        installed,
                        ...(args.install !== false && !installed
                            ? { reloadRejected: true, reloadNote }
                            : {}),
                    }
                    if (args.focus !== false) focusProducedArtifact(deps, 'buildPluginProject', result, args)
                    return result
                }

                const [existing] = await dev.status({ root: args.root })
                const previous = existing?.buildCount ?? 0
                const requested = await dev.build({
                    root: args.root,
                    writeToDisk: args.writeToDisk === true,
                    externals,
                })
                const status =
                    requested.buildCount > previous || requested.state === 'failed' || requested.error
                        ? requested
                        : await waitForFreshBuild(deps, args.root, previous)
                const summary = summarize(status)
                if (!summary.ok || !status?.build) return summary

                let installed = false
                let reloadReason = ''
                if (args.install !== false) {
                    installed = await requirePluginHost(deps).installFromSource({
                        code: status.build.code,
                        pluginKey: status.plugin.pluginKey,
                        name: status.plugin.name,
                        version: `dev.${status.buildCount}`,
                        replace: true,
                        sourceLabel: status.root,
                        onRejected: (reason) => { reloadReason = reason },
                    })
                }
                const result = {
                    ...summary,
                    ...(externals ? { externals } : {}),
                    installed,
                    ...(args.install !== false && !installed
                        ? { reloadRejected: true, reloadNote: rejectedReloadNote(status.plugin.name, reloadReason) }
                        : {}),
                }
                if (args.focus !== false) focusProducedArtifact(deps, 'buildPluginProject', result, args)
                return result
            }
            return runToolWork(
                deps,
                {
                    tool: 'buildPluginProject',
                    title: `构建 ${projectLabel(args.root)}`,
                    args,
                    background: args.background,
                    meta: { root: args.root, writeToDisk: args.writeToDisk === true },
                },
                execCtx,
                work,
            )
        },
    },

    deletePluginProject: {
        description:
            '删除一个插件工程：停止它的监听、把它热更进窗口的开发版本卸载掉，然后删除工程目录及磁盘文件（不可恢复）。' +
            '只在用户明确要求删除工程时调用；想保留文件只是停止监听，请用 stopPluginProject。' +
            '宿主拒绝删除不是插件工程的目录（必须含可读的 package.json，且不能是系统标准目录）。',
        inputSchema: {
            type: 'object',
            properties: {
                root: { type: 'string', description: '工程根目录（来自 listPluginProjects）。' },
            },
            required: ['root'],
        },
        execute: async (args: { root: string }) => {
            const dev = requireDev(deps)
            // Unbind first: the session must not hot-reload a project that is about
            // to be deleted (nor re-install it a moment after the uninstall below).
            deps.getDevHost?.()?.unwatch(args.root)
            // Read the descriptor first: once the files are gone the manifest is
            // unreachable, and the preview in the window has to be dropped by name.
            const [status] = await dev.status({ root: args.root })
            const removed = await requireRemove(deps)({ root: args.root })

            const pluginHost = deps.getPluginHost?.()
            // Address the registry by its identity (pluginKey): the manifest name
            // is a label, and a bundle may declare yet another one.
            const name = status?.plugin?.pluginKey
                ?? status?.plugin?.name
                ?? removed.pluginKey
                ?? removed.name
                ?? undefined
            let uninstalled = false
            if (pluginHost?.uninstall && pluginHost?.has && name) {
                uninstalled = pluginHost.has(name) && pluginHost.uninstall(name)
            }
            return {
                ok: true,
                root: removed.root,
                removed: removed.removed,
                pluginKey: removed.pluginKey ?? status?.plugin?.pluginKey ?? null,
                name: name ?? null,
                uninstalled,
                note: uninstalled
                    ? '工程文件已删除，窗口里的开发版本也已卸载。'
                    : '工程文件已删除；该插件在当前窗口里本来就没有运行中的版本。',
            }
        },
    },

    deletePluginProjectFile: {
        description:
            '删除插件工程里的一个文件（不可恢复）。用于清掉不再需要的文件（例如拆分后遗留的旧组件）。' +
            '只能删工程目录内的文件：宿主拒绝工程外的路径、package.json 和入口文件（要换入口先改 knPluginStudio.entry 再删旧的）。' +
            '删之前必须先 readPluginProjectFile 读过它（防止把路径写错删掉还在用的文件）。' +
            '返回被删文件的正文（大文件会标记 truncated），误删可以用 writePluginProjectFile 把 content 粘回去。' +
            '工程在监听时会自动重建；否则用 buildPluginProject 验证。',
        inputSchema: {
            type: 'object',
            properties: {
                root: { type: 'string', description: '工程根目录（来自 listPluginProjects）。' },
                path: { type: 'string', description: '要删除的文件绝对路径（来自 listPluginProjectFiles）。' },
            },
            required: ['root', 'path'],
        },
        execute: async (args: { root: string; path: string }) => {
            // Same observation rule as editing: a typo'd path must not delete a
            // file the model never looked at.
            requireObservation(args.path, '删除')
            const removed = await requireDeleteFile(deps)({ root: args.root, path: args.path })
            return {
                ok: true,
                root: removed.root,
                path: removed.path,
                relativePath: removed.relativePath,
                bytes: removed.bytes,
                content: removed.content ?? null,
                truncated: Boolean(removed.truncated),
                next:
                    '工程在监听时会自动重建。如果这个文件被 import，构建会立刻报错，把引用一并改掉；' +
                    '误删可以用 writePluginProjectFile 把上面的 content 写回去。',
            }
        },
    },

    stopPluginProject: {
        description:
            '停止插件工程的监听、回收构建进程，并把窗口里的开发版本卸载掉（磁盘文件保留，' +
            '"开始监听/热更"可以再装回来）。用户说"先不要了/停掉"时调用。',
        inputSchema: {
            type: 'object',
            properties: { root: { type: 'string', description: '工程根目录。' } },
            required: ['root'],
        },
        execute: async (args: { root: string }) => {
            // Unbind before stopping: a session that keeps its last build must not
            // re-install it after it was explicitly stopped.
            deps.getDevHost?.()?.unwatch(args.root)
            // Read the descriptor before stopping — once the session is gone the
            // manifest is unreachable, and the window's copy has to be dropped by the
            // identity the registry filed it under (`pluginKey`; the name is a label).
            const [status] = await requireDev(deps).status({ root: args.root })
            const stopped = await requireDev(deps).stop({ root: args.root })

            const pluginHost = deps.getPluginHost?.()
            const key = status?.plugin?.pluginKey ?? status?.plugin?.name
            const uninstalled = Boolean(
                pluginHost?.uninstall && pluginHost?.has && key && pluginHost.has(key)
                && pluginHost.uninstall(key) !== false,
            )
            return { ok: stopped, root: args.root, stopped, uninstalled }
        },
    },

    pluginProjectLogs: {
        description: '查看插件工程的构建日志（最近的若干条），用于排查编译失败原因。',
        inputSchema: {
            type: 'object',
            properties: {
                root: { type: 'string', description: '工程根目录。' },
                limit: { type: 'number', description: '可选。最多返回条数，默认 60。' },
            },
            required: ['root'],
        },
        readOnly: true,
        execute: async (args: { root: string; limit?: number }) => {
            const logs = await requireDev(deps).logs({ root: args.root, limit: args.limit ?? 60 })
            return {
                count: logs.length,
                logs: logs.map((entry) => ({ level: entry.level, message: entry.message })),
            }
        },
    },

    /**
     * What a plugin I write here can actually call on this host.
     *
     * The desktop bridge is the only channel through which a renderer-side
     * plugin reaches host capabilities (files, dialogs, HTTP, SSH, storage…),
     * and it is *not* discoverable from the service registry: `listPluginServices`
     * shows the service name `desktop`, not the capability families under it.
     * Reading the live bridge is the honest answer — it reports what this build
     * exposes, not what some doc promised.
     */
    listDesktopCapabilities: {
        description:
            '列出当前宿主通过 `desktop` 服务暴露给插件的能力（能力名按前缀分组，例如 `fs.` / `dialog.` / `ssh.` / `dev.`），' +
            '以及挂在桥上的类型化能力组（`desktop.dev` / `desktop.ssh` / `desktop.storage`）各自有哪些方法。' +
            '写插件要用桌面能力（读写文件、发 HTTP、SSH、弹对话框、持久化…）时先查这里，再用 ' +
            "`resolveOptionalService('desktop')`（非组件）或 `useOptionalService('desktop')`（组件里）拿服务。" +
            '注意三点：①Web 端没有这个服务，老桌面构建也可能缺某些组，所以必须先 `desktop?.has(能力名)` 或 `desktop?.ssh` 判断再调用；' +
            '②能力的参数/结果类型在 @kn/common 的 src/core/desktop-bridge.ts（`DesktopCapabilityContract` 是总表），用 searchHostApi / readHostApiFile 读；' +
            '③插件消费能力不需要在 config 里声明（`services` 是给“对外提供”用的）。',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: '可选。能力名子串过滤（大小写不敏感），如 "ssh"、"fs."、"storage"。' },
            },
        },
        readOnly: true,
        execute: async (args: { query?: string }) => {
            const desktop = deps.getDesktop?.()
            const callPattern =
                "非 React 代码 resolveOptionalService('desktop')；组件里 useOptionalService('desktop')。" +
                "有类型化组的直接调（desktop.ssh.exec({...}) / desktop.dev.start({...})）；其余用 desktop.invoke('<能力名>', params)。" +
                '能力可能不存在：先 desktop?.has(能力名) 判断，缺失时降级而不是崩。'
            const hint =
                '参数与结果的确切类型：@kn/common 的 src/core/desktop-bridge.ts（DesktopCapabilityContract 是全部能力的表，' +
                'DevBridge / SshBridge / StorageService 是各组的接口）。用 searchHostApi({ query: "SshBridge" }) 定位后 readHostApiFile 读。' +
                'SSH 的信任模型与边界另见工程里的 docs/SSH.md。'

            if (!desktop || typeof desktop !== 'object') {
                return {
                    hasDesktop: false,
                    count: 0,
                    groups: [],
                    typedGroups: [],
                    callPattern,
                    hint,
                    note:
                        '当前宿主没有 desktop 服务：Web 端本来就没有，桌面端则可能是老构建或未接线。' +
                        '写插件时按“能力可能不存在”处理，不要直接调用。',
                }
            }

            const all = Array.isArray(desktop.capabilities) ? [...desktop.capabilities] : []
            const needle = typeof args?.query === 'string' && args.query.trim() ? args.query.trim().toLowerCase() : undefined
            const filtered = all.filter((name) => (needle ? name.toLowerCase().includes(needle) : true)).sort()

            const byFamily = new Map<string, string[]>()
            for (const name of filtered) {
                // Prefer the longest *known* family (`net.policy.` over `net.`),
                // so its note is attached; a capability from a family this build
                // has never heard of still gets grouped (and simply has no note).
                const known = Object.keys(CAPABILITY_FAMILY_NOTES)
                    .filter((family) => name.startsWith(family))
                    .sort((a, b) => b.length - a.length)[0]
                const dot = name.indexOf('.')
                const family = known ?? (dot === -1 ? name : `${name.slice(0, dot)}.`)
                const list = byFamily.get(family) ?? []
                list.push(name)
                byFamily.set(family, list)
            }

            const groups: StudioDesktopCapabilityGroup[] = [...byFamily.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([group, capabilities]) => ({
                    group,
                    capabilities,
                    ...(CAPABILITY_FAMILY_NOTES[group] ? { summary: CAPABILITY_FAMILY_NOTES[group] } : {}),
                }))

            const typedGroups = ['dev', 'ssh', 'storage']
                .map((group) => {
                    const value = desktop[group]
                    if (!value || typeof value !== 'object') return null
                    return { group, methods: Object.keys(value as Record<string, unknown>).sort() }
                })
                .filter((entry): entry is { group: string; methods: string[] } => entry !== null)

            return {
                hasDesktop: true,
                platform: typeof desktop.platform === 'string' ? desktop.platform : undefined,
                count: filtered.length,
                groups,
                typedGroups,
                callPattern,
                hint,
                ...(needle && filtered.length !== all.length ? { totalBeforeFilter: all.length } : {}),
            }
        },
    },

    /**
     * Discover what the host actually publishes to plugins. `externals` is only
     * useful (and only accepted) for modules that exist here.
     */
    listHostGlobals: {
        description:
            '列出当前宿主通过 window.__KN__ 暴露给插件的全局模块（这才是“宿主注入依赖”的真正来源），以及宿主始终注入的标准包清单。' +
            '只有当你要 import 的模块出现在这里（或挂在 window 上的同名全局）时，才能把它写进 runPluginProject / buildPluginProject 的 externals；否则请用 installPluginDependencies 安装成正常依赖。',
        inputSchema: { type: 'object', properties: {} },
        readOnly: true,
        execute: async () => {
            const namespace = readHostGlobals(deps)
            const globals = Object.keys(namespace)
                .filter((name) => namespace[name] !== undefined && namespace[name] !== null)
                .sort()
                .map((name) => ({ name, type: typeof namespace[name] }))
            return {
                namespace: 'window.__KN__',
                count: globals.length,
                globals,
                builtinModules: BUILTIN_HOST_MODULES,
                hint:
                    'react、react-dom 与 @kn/* 由宿主始终注入，不需要写 externals。' +
                    'externals 的名字取包名去掉 scope（@scope/pkg → pkg），声明后打包器会去 window.__KN__[名字]、再退到 window[名字] 查找；' +
                    '找不到时 runPluginProject / buildPluginProject 会直接报错而不是产出运行时才炸的产物。',
            }
        },
    },

    /**
     * Service discovery. Services are how a plugin consumes anything the host or
     * another plugin provides — the only cross-plugin call channel the runtime
     * has — so a plugin author needs the exact names and owners before writing
     * `resolveOptionalService(...)`.
     */
    listPluginServices: {
        description:
            '列出宿主里已经注册的 service（服务）以及每个服务由谁提供（core=宿主，或某个已安装插件的运行时名字）。' +
            '开发插件要复用宿主/其他插件的能力时先查这里：拿到服务名后用 resolveOptionalService(name)（非 React 代码）或 useOptionalService(name)（组件里）调用，' +
            '拿不到就说明宿主没注册或该插件没装。服务是插件之间唯一正式的互调通道；插件不能覆盖宿主或别的插件已注册的服务（重名注册会失败）。' +
            '每个服务的 TS 签名在 @kn/common 的 src/core/types.ts 的 Services 接口里（先用 searchHostApi 搜 "Services"，再 readHostApiFile 读该文件）。',
        inputSchema: {
            type: 'object',
            properties: {
                owner: {
                    type: 'string',
                    description:
                        '可选。只列某个提供者：传插件运行时名字（见 listPluginProjects / 宿主的已安装列表），或传 "core" 只看宿主注册的服务。',
                },
                query: { type: 'string', description: '可选。服务名子串过滤（大小写不敏感），例如 "page"、"upload"。' },
            },
        },
        readOnly: true,
        execute: async (args: { owner?: string; query?: string }) => {
            const registry = deps.getServiceRegistry?.()
            if (!registry || typeof registry.getAll !== 'function') {
                throw new Error(
                    '当前宿主没有暴露服务注册表（缺少 bound ServiceRegistry），无法列出服务。请升级 KN 宿主。',
                )
            }
            const all = registry.getAll() ?? {}
            const entries = Object.keys(all)
                .sort()
                .map((name) => {
                    const owner = registry.getOwner?.(name)
                    const ownerType = owner?.type ?? 'unknown'
                    const ownerName = ownerType === 'plugin' ? (owner?.pluginName ?? 'plugin') : ownerType
                    return { name, owner: ownerName, ownerType }
                })

            /** "这个插件有什么 service" — grouped by provider. */
            const byPlugin: Record<string, string[]> = {}
            const coreServices: string[] = []
            for (const entry of entries) {
                if (entry.ownerType === 'plugin') {
                    const list = byPlugin[entry.owner] ?? (byPlugin[entry.owner] = [])
                    list.push(entry.name)
                } else if (entry.ownerType === 'core') {
                    coreServices.push(entry.name)
                }
            }

            const ownerFilter = typeof args?.owner === 'string' && args.owner.trim() ? args.owner.trim() : undefined
            const needle = typeof args?.query === 'string' && args.query.trim() ? args.query.trim().toLowerCase() : undefined
            const filtered = entries.filter((entry) => {
                if (ownerFilter && entry.owner !== ownerFilter) return false
                if (needle && !entry.name.toLowerCase().includes(needle)) return false
                return true
            })

            return {
                count: filtered.length,
                total: entries.length,
                services: filtered,
                ...(ownerFilter ? {} : { byPlugin, coreServices }),
                filters: { owner: ownerFilter ?? null, query: typeof args?.query === 'string' ? args.query : null },
                callPattern: [
                    "import { resolveOptionalService, useOptionalService } from '@kn/common'",
                    "const svc = resolveOptionalService('spacePageService')   // 非 React 代码",
                    "const svc = useOptionalService('fileService')           // 组件里（可为空，宿主没注册）",
                ],
                hint:
                    '服务名必须先在 @kn/common 的 src/core/types.ts 的 Services 接口里声明才能带类型使用（插件工程通过宿主注入的 @kn/common 拿到这些类型）；' +
                    '运行时不校验名字，但 typecheck 与补全依赖它。自己对外提供服务用插件 config 的 services 字段（重名会注册失败，不要试图覆盖别人的）。' +
                    '只想看某个插件提供了什么，传 owner=<插件名>。',
            }
        },
    },

    /**
     * Icon discovery + generation. A plugin has two icons and they are not
     * interchangeable: the app's rail icon is a ReactNode in source, the
     * marketplace icon is an uploaded image. These two tools cover both.
     */
    listPluginIcons: {
        description:
            '查宿主真实的图标名（@kn/icon 里的组件，lucide + react-icons），用于挑插件栏位图标——不要凭记忆拼名字，写错了就是空白。' +
            '返回可直接粘贴的代码片段（栏位 icon 用 railIcon 或 jsx，都需要 importLine），以及按用途关键词给出的 emoji 建议（emoji 不需要 import）。' +
            '应用内栏位图标（dockPanels[].icon）只能写在源码里；市场/清单图标是图片，用 generatePluginIcon 生成。',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: '可选。按名字搜索，例如 "chart"、"github"、"translate"（大小写不敏感）。',
                },
                limit: { type: 'number', description: '可选。最多返回多少个图标名，默认 24，上限 48。' },
            },
        },
        readOnly: true,
        execute: async (args: { query?: string; limit?: number }) => {
            const toolkit = deps.getIconToolkit?.()
            const query = typeof args?.query === 'string' ? args.query : ''
            const limit = Math.min(Math.max(Math.floor(args?.limit ?? 24) || 24, 1), 48)
            const allNames = typeof toolkit?.iconNames === 'function' ? toolkit.iconNames() : []
            const names = toolkit?.filterIconNames ? toolkit.filterIconNames(allNames, query, limit) : []
            const snippets = toolkit?.railIconSnippets?.(names[0] ?? 'Wrench') ?? {}
            const emoji = toolkit?.suggestGlyphs ? toolkit.suggestGlyphs(query, 8) : []

            return {
                count: names.length,
                totalAvailable: allNames.length,
                icons: names.map((name) => {
                    const parts = toolkit?.railIconSnippets?.(name) ?? {}
                    return {
                        name,
                        importLine: 'importLine' in parts ? parts.importLine : `import { ${name} } from '@kn/icon'`,
                        railIcon: 'createElement' in parts ? parts.createElement : '',
                        jsx: 'jsx' in parts ? parts.jsx : '',
                    }
                }),
                emoji,
                example: snippets,
                hint:
                    '栏位图标：把 importLine 加进 src/index.tsx，再把该面板的 icon 换成 railIcon（或组件里的 jsx）。' +
                    '清单/市场图标：用 generatePluginIcon（生成 assets/icon.svg 并写进 knPluginStudio.icon，上架时自动上传）。' +
                    '同一个插件两张图最好用同一个字形，看起来才是一套。',
            }
        },
    },

    generatePluginIcon: {
        description:
            '给插件工程生成一枚自己的图标并接好：按插件名与用途关键词（chart/music/translate…）选字形和配色，离线渲染一张 SVG 写进 assets/icon.svg，' +
            '把 package.json 的 knPluginStudio.icon 指向它；如果源码里还是脚手架那个 emoji 栏位图标，会一并换成同一个字形（换不了就返回片段让你自己粘）。' +
            '同一插件名永远得到同一张图。上架时 publishPluginProject 会自动上传这个文件作为市场图标。',
        inputSchema: {
            type: 'object',
            properties: {
                root: { type: 'string', description: '工程根目录。' },
                name: { type: 'string', description: '可选。插件名/用途描述，用于选字形和配色（省略时用清单里的 pluginKey/displayName）。' },
                glyph: { type: 'string', description: '可选。直接指定字形（一个 emoji），优先于关键词。' },
                color: { type: 'string', description: '可选。主色 #rrggbb，省略时按插件名稳定哈希选一个。' },
                keywords: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '可选。用途关键词，如 ["chart","analytics"]；比 name 更能决定字形。',
                },
                apply: {
                    type: 'boolean',
                    description: '可选。是否同时替换源码里的 emoji 栏位图标，默认 true（只生成图片时传 false）。',
                },
                focus: {
                    type: 'boolean',
                    description: '可选。是否把生成结果设为当前工作目标并在右侧预览里展示，默认 true。',
                },
            },
            required: ['root'],
        },
        execute: async (args: {
            root: string
            name?: string
            glyph?: string
            color?: string
            keywords?: string[]
            apply?: boolean
            focus?: boolean
        }) => {
            const dev = requireDev(deps)
            const toolkit = requireIconToolkit(deps)
            const keywords = Array.isArray(args.keywords)
                ? args.keywords.filter((keyword): keyword is string => typeof keyword === 'string' && keyword.trim().length > 0)
                : undefined

            const applied = await toolkit.applyIcon({
                root: args.root,
                seed: (typeof args.name === 'string' && args.name.trim()) || lastSegment(args.root),
                title: typeof args.name === 'string' ? args.name : undefined,
                glyph: typeof args.glyph === 'string' ? args.glyph : undefined,
                color: typeof args.color === 'string' ? args.color : undefined,
                keywords,
                apply: args.apply !== false,
                // The dev bridge already speaks the shape the toolkit needs.
                io: {
                    readFile: (options) => dev.readFile({ path: options.path }),
                    writeFile: (options) => dev.writeFile({ path: options.path, contents: options.contents }),
                },
            })

            const result = {
                ok: true,
                root: args.root,
                iconFile: applied.iconFile,
                relativePath: applied.relativePath,
                glyph: applied.glyph,
                isInitial: applied.isInitial,
                color: applied.color,
                manifest: applied.manifest,
                railIcon: applied.railIcon,
                svg: applied.svg,
                next: applied.railIcon.updated
                    ? '图标已生成并接到栏位图标上。工程在监听时会自动重建热更；上架时 publishPluginProject 会自动带上这张图。'
                    : `图标已生成（${applied.relativePath}）。源码里的栏位图标没有自动替换（${applied.railIcon.status}），需要的话把这段粘进 src/index.tsx：${applied.railIcon.snippet}`,
            }
            if (args.focus !== false) focusProducedArtifact(deps, 'generatePluginIcon', result, args)
            return result
        },
    },

    /**
     * Host-API reference. The agent authors plugins against the standard
     * packages, so these three tools expose their real TypeScript source:
     * list the packages, locate a symbol, then read the defining file.
     */
    listHostApiPackages: {
        description:
            '列出可查阅的标准宿主包（@kn/common、@kn/core、@kn/ui、@kn/icon、@kn/editor、@kn/plugin-api）及其类型入口。' +
            '写插件代码前先调用它；然后用 searchHostApi 定位接口，用 readHostApiFile 读取定义，确保 API 名称与签名正确。',
        inputSchema: { type: 'object', properties: {} },
        readOnly: true,
        execute: async () => {
            const result = await requireHostApi(deps)({})
            if (result.kind !== 'list') throw new Error('宿主 API 返回了意外的结果')
            return {
                root: result.root,
                packages: result.packages.map((pkg) => ({
                    name: pkg.name,
                    version: pkg.version ?? null,
                    entry: pkg.entry ?? null,
                })),
                hint: '先读 @kn/plugin-api 的入口，它列出了所有契约类型；再用 searchHostApi 找具体定义。',
            }
        },
    },

    searchHostApi: {
        description:
            '在标准宿主包源码里按名字搜索类型/接口/组件，返回文件名与行号。写插件前用它确认 API 的确切名称与位置，' +
            '例如 query: "DockPanelConfig"、"useOptionalService"、"KPlugin"。',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: '要搜索的名字或片段（大小写不敏感）。' },
                package: { type: 'string', description: '可选。限定包，如 @kn/common。' },
                limit: { type: 'number', description: '可选。最多返回条数，默认 60。' },
            },
            required: ['query'],
        },
        readOnly: true,
        execute: async (args: { query: string; package?: string; limit?: number }) => {
            const result = await requireHostApi(deps)({
                query: args.query,
                package: args.package,
                limit: args.limit,
            })
            if (result.kind !== 'search') throw new Error('宿主 API 返回了意外的结果')
            return { count: result.matches.length, truncated: result.truncated, matches: result.matches }
        },
    },

    readHostApiFile: {
        description:
            '读取标准宿主包里的一个源码文件（包内相对路径，如 src/core/PluginManager.ts），查看真实接口定义。' +
            '先用 searchHostApi 定位文件，再用它读取；路径必须在包内，且不要读无关的大文件。',
        inputSchema: {
            type: 'object',
            properties: {
                package: { type: 'string', description: '包名，如 @kn/common 或 common。' },
                path: { type: 'string', description: '包内相对路径，如 src/index.ts。' },
            },
            required: ['package', 'path'],
        },
        readOnly: true,
        execute: async (args: { package: string; path: string }) => {
            const result = await requireHostApi(deps)({ package: args.package, path: args.path })
            if (result.kind !== 'file') throw new Error('宿主 API 返回了意外的结果')
            return {
                package: result.package,
                path: result.path,
                bytes: result.bytes,
                contents: result.contents,
            }
        },
    },
})
