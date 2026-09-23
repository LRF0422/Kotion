/**
 * Plugin Studio — agent tools.
 *
 * These expose the studio's `dev.*` capabilities to the AI agent, which is the
 * point of the feature: an agent can scaffold a project (in the host's managed
 * directory, no folder dialog), write its source, build it, hot-install it for
 * preview, and iterate — without the user picking directories.
 *
 * The tools are editor-independent: nothing here touches the document. They are
 * still registered through `editorExtension` because that is the only tool
 * contribution point a plugin has (see PluginManager.resolveTools).
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

export type StudioFilesResult =
    | { kind: 'list'; root: string; files: string[]; truncated: boolean }
    | { kind: 'search'; root: string; matches: StudioFileMatch[]; truncated: boolean }

export interface StudioInstallResult {
    ok: boolean
    manager: string
    packages: string[]
    output: string
    error?: string
}

export interface StudioDevBridge {
    start(options: { root: string; watch?: boolean; writeToDisk?: boolean; externals?: string[] }): Promise<StudioSessionStatus>
    build(options: { root: string; writeToDisk?: boolean; watch?: boolean; externals?: string[] }): Promise<StudioSessionStatus>
    stop(options: { root: string }): Promise<boolean>
    status(options?: { root?: string }): Promise<StudioSessionStatus[]>
    logs(options: { root: string; limit?: number }): Promise<StudioLogEntry[]>
    scaffold(options: {
        parentDir?: string
        name: string
        displayName?: string
        pluginKey?: string
        overwrite?: boolean
    }): Promise<{ root: string; pluginKey: string; files: string[]; managed: boolean }>
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
    /** List or search one project's files; see StudioFilesResult. */
    files(options: {
        root: string
        query?: string
        include?: string
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
}

export interface StudioPluginHost {
    installFromSource(options: {
        code: string
        pluginKey: string
        name: string
        version?: string
        replace?: boolean
        sourceLabel?: string
    }): Promise<boolean>
}

export interface StudioManagedPlugin {
    name: string
    pluginKey: string
    version?: string
    source: 'system' | 'installed' | 'dev'
    desktopOnly: boolean
}

/** Full management surface; a superset of StudioPluginHost. */
export interface StudioPluginManagement extends StudioPluginHost {
    list(): StudioManagedPlugin[]
    get(name: string): StudioManagedPlugin | undefined
    isRemovable(name: string): boolean
    uninstall(name: string): boolean
    has(name: string): boolean
    getActiveNames(): string[]
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

export interface StudioToolDeps {
    /** The desktop bridge's dev surface, or undefined on a non-dev host. */
    getDev: () => StudioDevBridge | undefined
    /** The host plugin registry, or undefined when the host did not register it. */
    getPluginHost: () => StudioPluginHost | undefined
    /** Full plugin-management service; optional for older hosts and tests. */
    getPluginManagement?: () => StudioPluginManagement | undefined
    /** Plugin-marketplace lifecycle service; optional for older hosts and tests. */
    getMarketplace?: () => StudioPluginMarketplace | undefined
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
 * The narrow installer surface, preferring the full management service so a
 * hot-install goes through the same path as every other plugin install.
 */
const requirePluginHost = (deps: StudioToolDeps): StudioPluginHost => {
    const management = deps.getPluginManagement?.()
    if (management) return management
    const pluginHost = deps.getPluginHost()
    if (!pluginHost) throw new Error('宿主未注册 pluginHost/pluginManagement 服务，无法热更插件')
    return pluginHost
}

const requirePluginManagement = (deps: StudioToolDeps): StudioPluginManagement => {
    const management = deps.getPluginManagement?.()
    if (!management) throw new Error('宿主未注册 pluginManagement 服务，无法管理已安装插件')
    return management
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

/**
 * Absolute paths the agent has observed this session. DSH's fs-observation
 * policy: an edit is refused until the file has been read (or written), so
 * the model never blind-replaces text it has not actually seen.
 */
const observedFiles = new Set<string>()

const requireObservation = (path: string): void => {
    if (!observedFiles.has(path)) {
        throw new Error(
            `请先调用 readPluginProjectFile({ path: "${path}" }) 查看当前内容再编辑；禁止未读就改。`,
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
            '在桌面端内置的插件工程目录里新建一个最小可运行的插件工程（生成 package.json、src/index.tsx、src/DevPanel.tsx、README.md）。' +
            '不需要用户选择目录。创建后用 writePluginProjectFile 改写源码，再用 runPluginProject 热更预览。',
        inputSchema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: '工程目录名/包名，例如 my-kn-plugin（字母数字开头，可含 . _ -）。',
                },
                displayName: { type: 'string', description: '可选。插件显示名，例如「我的插件」。' },
                pluginKey: { type: 'string', description: '可选。宿主注册表的键，默认与 name 相同。' },
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
            parentDir?: string
            overwrite?: boolean
        }) => {
            const created = await requireDev(deps).scaffold({
                name: args.name,
                displayName: args.displayName,
                pluginKey: args.pluginKey,
                parentDir: args.parentDir,
                overwrite: args.overwrite,
            })
            return {
                ok: true,
                root: created.root,
                pluginKey: created.pluginKey,
                managed: created.managed,
                files: created.files,
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

    installPluginDependencies: {
        description:
            '在插件工程里安装第三方 npm 包：调用工程所用的包管理器（npm/pnpm/yarn）并写入 package.json。' +
            '安装成功后即可在源码里 import（打包时会打进产物；react 与 @kn/* 仍由宿主提供）。需要网络。',
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
            },
            required: ['root', 'packages'],
        },
        execute: async (args: { root: string; packages: string[]; dev?: boolean }) => {
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
        },
    },

    listInstalledPlugins: {
        description:
            '列出当前宿主里已经安装/激活的插件（含宿主自带的 system 插件）。返回 name、pluginKey、来源（system/installed/dev）、' +
            '版本、是否桌面专属、是否可卸载。管理已安装插件或排查冲突前先调用它。',
        inputSchema: { type: 'object', properties: {} },
        readOnly: true,
        execute: async () => {
            const management = requirePluginManagement(deps)
            const plugins = management.list()
            return { count: plugins.length, plugins }
        },
    },

    uninstallInstalledPlugin: {
        description:
            '卸载一个已安装的插件（按运行时 name，来自 listInstalledPlugins）。宿主自带的 system 插件不可卸载，会直接报错。',
        inputSchema: {
            type: 'object',
            properties: { name: { type: 'string', description: '插件的运行时名字。' } },
            required: ['name'],
        },
        execute: async (args: { name: string }) => {
            const management = requirePluginManagement(deps)
            if (!management.isRemovable(args.name)) {
                throw new Error('插件不可卸载（未安装，或为宿主自带）：' + args.name)
            }
            const removed = management.uninstall(args.name)
            return { ok: removed, name: args.name }
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
            '已上架插件走“发布新版本”（传 pluginId，来自 listMyPlugins）。',
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
                icon: { type: 'string', description: '可选图标文件名（先上传得到）。' },
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
            },
            required: ['root', 'version'],
        },
        execute: async (args: {
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
        }) => {
            const dev = requireDev(deps)
            const marketplace = requireMarketplace(deps)
            const status = await dev.build({ root: args.root })
            if (!status.build?.code) {
                throw new Error('构建失败，无法发布：' + (status.error ?? '没有构建产物'))
            }
            const uploaded = await marketplace.uploadArtifact({
                fileName: args.pluginKey ? args.pluginKey + '.js' : 'index.js',
                data: new Blob([status.build.code], { type: 'text/javascript' }),
            })
            if (args.pluginId !== undefined && args.pluginId !== null) {
                await marketplace.publishVersion(args.pluginId, {
                    version: args.version,
                    resourcePath: uploaded.resourcePath,
                    integrity: uploaded.integrity,
                    versionDescs: args.versionDescs,
                })
                return {
                    ok: true,
                    mode: 'version',
                    pluginId: args.pluginId,
                    version: args.version,
                    resourcePath: uploaded.resourcePath,
                    buildCount: status.buildCount,
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
                icon: args.icon ?? null,
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
            }
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
            '这是"实时预览"的入口。返回构建结果或编译错误。',
        inputSchema: {
            type: 'object',
            properties: {
                root: { type: 'string', description: '工程根目录（来自 listPluginProjects 或 createPluginProject）。' },
                watch: { type: 'boolean', description: '可选。是否持续监听，默认 true。' },
                autoInstall: { type: 'boolean', description: '可选。构建成功后是否自动热更，默认 true。' },
            },
            required: ['root'],
        },
        execute: async (args: { root: string; watch?: boolean; autoInstall?: boolean }) => {
            const status = await requireDev(deps).start({ root: args.root, watch: args.watch !== false })
            const summary = summarize(status)
            if (!summary.ok || !status?.build) return summary

            let installed = false
            if (args.autoInstall !== false) {
                installed = await requirePluginHost(deps).installFromSource({
                    code: status.build.code,
                    pluginKey: status.plugin.pluginKey,
                    name: status.plugin.name,
                    version: `dev.${status.buildCount}`,
                    replace: true,
                    sourceLabel: status.root,
                })
            }
            return {
                ...summary,
                installed,
                next: status.watching
                    ? '现在编辑源码即可自动热更；改完用 buildPluginProject 可主动重建。'
                    : undefined,
            }
        },
    },

    buildPluginProject: {
        description:
            '对插件工程做一次构建并热更到当前窗口（不改变监听状态）。适合改完源码后主动重建，或在监听未开启时预览一次。' +
            '构建失败会返回编译错误，宿主不会受影响。',
        inputSchema: {
            type: 'object',
            properties: {
                root: { type: 'string', description: '工程根目录。' },
                install: { type: 'boolean', description: '可选。构建成功后是否热更，默认 true。' },
                writeToDisk: { type: 'boolean', description: '可选。是否同时写 dist/index.js，默认 false。' },
            },
            required: ['root'],
        },
        execute: async (args: { root: string; install?: boolean; writeToDisk?: boolean }) => {
            const dev = requireDev(deps)
            const [existing] = await dev.status({ root: args.root })
            const previous = existing?.buildCount ?? 0
            const requested = await dev.build({ root: args.root, writeToDisk: args.writeToDisk === true })
            const status =
                requested.buildCount > previous || requested.state === 'failed' || requested.error
                    ? requested
                    : await waitForFreshBuild(deps, args.root, previous)
            const summary = summarize(status)
            if (!summary.ok || !status?.build) return summary

            let installed = false
            if (args.install !== false) {
                installed = await requirePluginHost(deps).installFromSource({
                    code: status.build.code,
                    pluginKey: status.plugin.pluginKey,
                    name: status.plugin.name,
                    version: `dev.${status.buildCount}`,
                    replace: true,
                    sourceLabel: status.root,
                })
            }
            return { ...summary, installed }
        },
    },

    stopPluginProject: {
        description: '停止插件工程的监听并回收构建进程。用户说"先不要了/停掉"时调用。',
        inputSchema: {
            type: 'object',
            properties: { root: { type: 'string', description: '工程根目录。' } },
            required: ['root'],
        },
        execute: async (args: { root: string }) => {
            const stopped = await requireDev(deps).stop({ root: args.root })
            return { ok: stopped, root: args.root, stopped }
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
