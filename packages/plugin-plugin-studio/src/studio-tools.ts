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

export interface StudioToolDeps {
    /** The desktop bridge's dev surface, or undefined on a non-dev host. */
    getDev: () => StudioDevBridge | undefined
    /** The host plugin registry, or undefined when the host did not register it. */
    getPluginHost: () => StudioPluginHost | undefined
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

const requirePluginHost = (deps: StudioToolDeps): StudioPluginHost => {
    const pluginHost = deps.getPluginHost()
    if (!pluginHost) throw new Error('宿主未注册 pluginHost 服务，无法热更插件')
    return pluginHost
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
        if (status && (status.buildCount > previous || status.state === 'failed')) return status
        await sleep(120)
    }
    const [status] = await dev.status({ root })
    return status
}

const summarize = (status: StudioSessionStatus | undefined) => {
    if (!status) return { ok: false, error: '没有找到该工程的会话' }
    return {
        ok: status.state !== 'failed',
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
            '写入（或覆盖）插件工程里的一个文件，自动创建父目录。用于改写插件源码——例如给 src/index.tsx 增加 dockPanels、settings、pageTypes 等贡献点。' +
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
            return { ok: true, path: args.path, bytes: args.contents.length }
        },
    },

    readPluginProjectFile: {
        description: '读取插件工程里的一个文件内容，用于在改写前确认当前实现。',
        inputSchema: {
            type: 'object',
            properties: { path: { type: 'string', description: '文件绝对路径。' } },
            required: ['path'],
        },
        readOnly: true,
        execute: async (args: { path: string }) => {
            const contents = await requireDev(deps).readFile({ path: args.path })
            return { ok: true, path: args.path, contents, bytes: contents.length }
        },
    },

    runPluginProject: {
        description:
            '开始（或重启）监听一个插件工程，等首个构建完成后把它热更到当前应用窗口，之后保存文件会自动重新构建并热更。' +
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
                requested.buildCount > previous || requested.state === 'failed'
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
})
