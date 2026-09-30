/**
 * Studio agent-tools test.
 *
 * Runs the real tool definitions against a recording fake of the `dev` bridge
 * and the plugin host, so it verifies the surface an agent actually sees: tool
 * names, schemas, and the exact capability calls each tool makes.
 *
 * This is the layer that makes "the agent creates the project itself" work, so
 * it is tested for behaviour, not just for existing.
 *
 * Run: node packages/plugin-plugin-studio/src/studio-tools.test.mjs
 */
import { createStudioTools } from './studio-tools.ts'
import { pluginAuthoringSkill } from './skills/plugin-authoring.ts'

const results = []
const check = (name, condition, detail = '') => {
    results.push({ name, ok: Boolean(condition), detail })
    console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

/* ------------------------------------------------------------------ *
 * Recording fake of the two injected services.
 * ------------------------------------------------------------------ */
const calls = []
const installs = []
const focused = []
const ROOT = '/managed/agent-made-plugin'
const sessions = new Map()
const files = new Map()
let buildCounter = 0

const status = (root, buildCount, marker) => ({
    root,
    state: 'watching',
    plugin: { pluginKey: 'agent-made-plugin', name: 'Agent Made' },
    build: { code: `/* ${marker} */`, bytes: 12, durationMs: 5, modules: ['src/index.tsx'] },
    buildCount,
    updatedAt: Date.now(),
    watching: true,
})

const dev = {
    async scaffold(options) {
        calls.push(['scaffold', options])
        return {
            root: ROOT,
            pluginKey: options.pluginKey ?? options.name,
            template: options.template ?? 'panel',
            files: ['package.json', 'src/index.tsx'],
            managed: !options.parentDir,
        }
    },
    async list(options) {
        calls.push(['list', options])
        return [
            {
                root: ROOT,
                name: 'agent-made-plugin',
                pluginKey: 'agent-made-plugin',
                displayName: 'Agent Made',
                entry: `${ROOT}/src/index.tsx`,
                updatedAt: 1,
                active: sessions.has(ROOT),
            },
        ]
    },
    async start(options) {
        calls.push(['start', options])
        sessions.set(options.root, true)
        buildCounter += 1
        return status(options.root, buildCounter, `v${buildCounter}`)
    },
    async build(options) {
        calls.push(['build', options])
        buildCounter += 1
        sessions.set(options.root, true)
        return status(options.root, buildCounter, `v${buildCounter}`)
    },
    async stop(options) {
        calls.push(['stop', options])
        sessions.delete(options.root)
        return true
    },
    async status(options = {}) {
        calls.push(['status', options])
        if (options.root) return [status(options.root, buildCounter, `v${buildCounter}`)]
        return []
    },
    async logs(options) {
        calls.push(['logs', options])
        return [{ level: 'info', message: 'build ok', at: 1 }]
    },
    async readFile(options) {
        calls.push(['readFile', options])
        return files.has(options.path) ? files.get(options.path) : 'export const plugin = 1'
    },
    async writeFile(options) {
        calls.push(['writeFile', options])
        files.set(options.path, String(options.contents ?? ''))
    },
    async files(options = {}) {
        calls.push(['files', options])
        if (typeof options.query === 'string' && options.query) {
            return {
                kind: 'search',
                root: options.root,
                matches: [{ path: 'src/index.tsx', line: 1, text: 'export const x = 1' }],
                truncated: false,
            }
        }
        return {
            kind: 'list',
            root: options.root,
            files: ['package.json', 'src/DevPanel.tsx', 'src/index.tsx'],
            truncated: false,
        }
    },
    async hostApi(options = {}) {
        calls.push(['hostApi', options])
        if (typeof options.query === 'string' && options.query) {
            return {
                kind: 'search',
                matches: [
                    {
                        package: '@kn/common',
                        path: 'src/core/dock.ts',
                        line: 35,
                        text: 'export interface DockPanelConfig {',
                    },
                ],
                truncated: false,
            }
        }
        if (typeof options.path === 'string' && options.path) {
            return {
                kind: 'file',
                package: '@kn/common',
                path: options.path,
                contents: 'export interface DockPanelConfig {}',
                bytes: 35,
            }
        }
        return {
            kind: 'list',
            root: '/repo',
            packages: [
                { name: '@kn/common', version: '0.0.16', root: '/repo/packages/common', entry: 'src/index.ts' },
            ],
        }
    },
    async installDependencies(options = {}) {
        calls.push(['installDependencies', options])
        return {
            ok: true,
            manager: 'npm',
            packages: options.packages ?? [],
            output: 'added 1 package',
        }
    },
    async removeProject(options = {}) {
        calls.push(['removeProject', options])
        return { root: options.root, removed: true, pluginKey: 'agent-made-plugin', name: 'Agent Made' }
    },
    async deleteFile(options = {}) {
        calls.push(['deleteFile', options])
        files.delete(options.path)
        return {
            root: options.root,
            path: options.path,
            relativePath: 'src/OldPanel.tsx',
            removed: true,
            bytes: 29,
            content: 'export const OldPanel = () => null\n',
            truncated: false,
        }
    },
}

const pluginHost = {
    active: new Set(['Agent Made']),
    async installFromSource(options) {
        installs.push(options)
        return true
    },
    has(name) {
        return this.active.has(name)
    },
    uninstall(name) {
        calls.push(['uninstall', name])
        return this.active.delete(name)
    },
}

/** Host globals the studio may declare as `externals`. */
const hostGlobals = { React: {}, ReactDOM: {}, common: {}, ui: {}, icon: {}, editor: {}, pluginApi: {}, svelte: {} }

const marketplace = {
    async listMine() {
        return [
            { id: 11, name: 'Agent Made', pluginKey: 'agent-made-plugin', version: '1.0.0', status: 'DONE' },
        ]
    },
    async listInstalled() {
        return []
    },
    async uploadArtifact(options) {
        calls.push(['uploadArtifact', { fileName: options.fileName, bytes: options.data?.size ?? 0 }])
        return { resourcePath: 'plugins/agent-made.js', integrity: 'sha256-abc' }
    },
    async submit(input) {
        calls.push(['submit', input])
        return { id: 12 }
    },
    async publishVersion(id, input) {
        calls.push(['publishVersion', { id }])
        return { id }
    },
    async upgrade(versionId) {
        calls.push(['upgrade', versionId])
    },
}

const tools = createStudioTools({
    getDev: () => dev,
    getPluginHost: () => pluginHost,
    getMarketplace: () => marketplace,
    getHostGlobals: () => hostGlobals,
    focusArtifactResult: (tool, result, args) => {
        focused.push({ tool, result, args })
        return true
    },
})
const names = Object.keys(tools)

/* ------------------------------------------------------------------ *
 * Tool surface
 * ------------------------------------------------------------------ */
const EXPECTED = [
    'listPluginProjects',
    'createPluginProject',
    'writePluginProjectFile',
    'readPluginProjectFile',
    'editPluginProjectFile',
    'listPluginProjectFiles',
    'searchPluginProject',
    'installPluginDependencies',
    'listMyPlugins',
    'publishPluginProject',
    'upgradePluginVersion',
    'runPluginProject',
    'buildPluginProject',
    'stopPluginProject',
    'deletePluginProject',
    'deletePluginProjectFile',
    'pluginProjectLogs',
    'listHostGlobals',
    'listHostApiPackages',
    'searchHostApi',
    'readHostApiFile',
]
check('surface: all tools present', EXPECTED.every((name) => names.includes(name)), names.join(', '))

for (const name of EXPECTED) {
    const tool = tools[name]
    check(`surface: ${name} has a description`, typeof tool?.description === 'string' && tool.description.length > 20)
    check(`surface: ${name} has an object schema`, tool?.inputSchema?.type === 'object')
    check(`surface: ${name} is executable`, typeof tool?.execute === 'function')
}

check(
    'surface: schemas declare required args',
    tools.createPluginProject.inputSchema.required.includes('name') &&
        tools.runPluginProject.inputSchema.required.includes('root') &&
        tools.writePluginProjectFile.inputSchema.required.includes('contents'),
)
check(
    'surface: read-only tools flagged',
    tools.listPluginProjects.readOnly === true
        && tools.readPluginProjectFile.readOnly === true
        && tools.listHostGlobals.readOnly === true,
)
check(
    'surface: create does not require a directory',
    !tools.createPluginProject.inputSchema.required.includes('parentDir'),
)

/* ------------------------------------------------------------------ *
 * Behaviour: create -> write -> read -> run -> build -> list -> logs -> stop
 * ------------------------------------------------------------------ */
const created = await tools.createPluginProject.execute({ name: 'agent-made-plugin', displayName: 'Agent Made' })
check('create: reports a managed project', created.managed === true, `root=${created.root}`)
check(
    'create: scaffold called without parentDir',
    calls.some(([name, args]) => name === 'scaffold' && args.name === 'agent-made-plugin' && args.parentDir === undefined),
)
check('create: returns next step', typeof created.next === 'string' && created.next.includes('writePluginProjectFile'))

const written = await tools.writePluginProjectFile.execute({
    path: `${ROOT}/src/index.tsx`,
    contents: 'export const x = 1',
})
check('write: forwards contents', written.ok === true && written.bytes === 'export const x = 1'.length)
check(
    'write: reaches dev.writeFile',
    calls.some(
        ([name, args]) =>
            name === 'writeFile' && args.path === `${ROOT}/src/index.tsx` && args.contents === 'export const x = 1',
    ),
)

const read = await tools.readPluginProjectFile.execute({ path: `${ROOT}/src/index.tsx` })
check(
    'read: returns line-numbered content',
    read.totalLines === 1 && read.lines[0]?.text === 'export const x = 1',
    JSON.stringify(read.lines),
)

/* DSH-style targeted edit, with the read-before-edit observation policy. */
const edited = await tools.editPluginProjectFile.execute({
    path: `${ROOT}/src/index.tsx`,
    oldString: 'export const x = 1',
    newString: 'export const x = 2',
})
check('edit: applies a unique replacement', edited.ok === true && edited.replacements === 1 && edited.totalLines === 1)
check(
    'edit: writes the new content',
    files.get(`${ROOT}/src/index.tsx`) === 'export const x = 2',
    files.get(`${ROOT}/src/index.tsx`),
)

let unreadEdit = ''
try {
    await tools.editPluginProjectFile.execute({ path: `${ROOT}/src/NeverRead.tsx`, oldString: 'a', newString: 'b' })
} catch (error) {
    unreadEdit = error.message
}
check('edit: refuses an unread file', /readPluginProjectFile/.test(unreadEdit), unreadEdit)

let missingText = ''
try {
    await tools.editPluginProjectFile.execute({ path: `${ROOT}/src/index.tsx`, oldString: 'NOT_PRESENT', newString: 'x' })
} catch (error) {
    missingText = error.message
}
check('edit: refuses a missing oldString', /不存在/.test(missingText), missingText)

const projectFiles = await tools.listPluginProjectFiles.execute({ root: ROOT })
check(
    'files: lists project files',
    projectFiles.count === 3 && projectFiles.files.includes('src/index.tsx'),
    JSON.stringify(projectFiles.files),
)
const projectSearch = await tools.searchPluginProject.execute({ root: ROOT, query: 'export' })
check(
    'files: searches the project',
    projectSearch.count === 1 && projectSearch.matches[0].line === 1,
    JSON.stringify(projectSearch.matches),
)
check('files: list reached dev.files', calls.some(([name, args]) => name === 'files' && !args.query))
check('files: search reached dev.files', calls.some(([name, args]) => name === 'files' && args.query === 'export'))

const installed = await tools.installPluginDependencies.execute({ root: ROOT, packages: ['date-fns@^3'] })
check(
    'install: reports success',
    installed.ok === true && installed.manager === 'npm' && installed.packages[0] === 'date-fns@^3',
    JSON.stringify(installed),
)
check(
    'install: forwards packages',
    calls.some(([name, args]) => name === 'installDependencies' && args.packages?.[0] === 'date-fns@^3'),
)

/*
 * Registry management is not a studio capability: the plugin manager owns the
 * installed-plugin list, and exposing it here would hand every agent run the
 * ability to uninstall arbitrary plugins. Assert the surface stays absent.
 */
check(
    'boundary: no plugin-registry management tools',
    !names.includes('listInstalledPlugins')
        && !names.includes('uninstallInstalledPlugin')
        && !names.some((name) => /installedPlugin/i.test(name)),
    names.join(', '),
)
check(
    'boundary: hot-install reaches pluginHost only',
    typeof pluginHost.installFromSource === 'function' && calls.every(([name]) => name !== 'uninstallInstalled'),
)

/* Marketplace lifecycle: 上架 (submit) / 发布 (publish version) / 升级 (upgrade). */
const mine = await tools.listMyPlugins.execute({})
check('market: lists my plugins', mine.count === 1 && mine.plugins[0].id === 11, JSON.stringify(mine.plugins))

const submitted = await tools.publishPluginProject.execute({ root: ROOT, version: '1.0.0', description: 'A test plugin' })
check('market: submits a new plugin', submitted.ok === true && submitted.mode === 'submit', JSON.stringify(submitted))
check(
    'market: uploads the built artifact, then submits',
    calls.some(([name]) => name === 'uploadArtifact') && calls.some(([name]) => name === 'submit'),
)

const published = await tools.publishPluginProject.execute({ root: ROOT, version: '1.1.0', pluginId: 11 })
check(
    'market: publishes a new version',
    published.ok === true && published.mode === 'version' && published.pluginId === 11,
    JSON.stringify(published),
)

const upgraded = await tools.upgradePluginVersion.execute({ versionId: 99 })
check('market: upgrades a version', upgraded.ok === true && calls.some(([name, value]) => name === 'upgrade' && value === 99))

const ran = await tools.runPluginProject.execute({ root: ROOT })
check('run: starts a watching session', ran.state === 'watching' && ran.ok === true, JSON.stringify({ state: ran.state }))
check('run: hot-installs the build', ran.installed === true && installs.length === 1)
check(
    'run: install uses replace semantics',
    installs[0]?.replace === true && installs[0]?.pluginKey === 'agent-made-plugin' && installs[0]?.code.includes('v'),
)

const built = await tools.buildPluginProject.execute({ root: ROOT })
check('build: returns a fresh build', built.buildCount >= 2, `#${built.buildCount}`)
check('build: installs by default', built.installed === true && installs.length === 2)

const listed = await tools.listPluginProjects.execute({})
check('list: reports the project', listed.count === 1 && listed.projects[0].pluginKey === 'agent-made-plugin')
check('list: explains next steps', typeof listed.hint === 'string')

const logs = await tools.pluginProjectLogs.execute({ root: ROOT, limit: 10 })
check('logs: returns entries', logs.count === 1 && logs.logs[0].level === 'info')

const stopped = await tools.stopPluginProject.execute({ root: ROOT })
check('stop: reports success', stopped.ok === true && stopped.stopped === true)

/* ------------------------------------------------------------------ *
 * Produced artifacts: a build becomes the conversation's working target, and the
 * plugin entry (not the tool) decides how. Best-effort — a host without a pane
 * must not turn a good build into a failed call.
 * ------------------------------------------------------------------ */
const focusedNames = () => focused.map((entry) => entry.tool)
check(
    'focus: a run offers its build as the working target',
    focusedNames().includes('runPluginProject') && focused.every((entry) => typeof entry.result === 'object'),
    JSON.stringify(focusedNames()),
)
check(
    'focus: the offered result is the tool result itself',
    focused.find((entry) => entry.tool === 'runPluginProject')?.result?.pluginKey === 'agent-made-plugin',
    JSON.stringify(focused.find((entry) => entry.tool === 'runPluginProject')?.result),
)
check(
    'focus: a build offers its artifact too',
    focusedNames().includes('buildPluginProject'),
    JSON.stringify(focusedNames()),
)
check(
    'focus: reads never focus anything',
    focused.every((entry) => !entry.tool.startsWith('list') && !entry.tool.startsWith('read')),
    JSON.stringify(focusedNames()),
)

const focusedBefore = focused.length
await tools.runPluginProject.execute({ root: ROOT, focus: false })
check('focus: opt-out leaves the preview alone', focused.length === focusedBefore, String(focused.length))

/* A throwing focus callback must never fail the build it just reported. */
const tolerantTools = createStudioTools({
    getDev: () => dev,
    getPluginHost: () => pluginHost,
    focusArtifactResult: () => {
        throw new Error('pane exploded')
    },
})
const tolerantRun = await tolerantTools.runPluginProject.execute({ root: ROOT })
check(
    'focus: a broken pane cannot fail a successful build',
    tolerantRun.ok === true && tolerantRun.installed === true,
    JSON.stringify({ ok: tolerantRun.ok, installed: tolerantRun.installed }),
)

/* ------------------------------------------------------------------ *
 * Scaffold templates: the project starts from the contribution point asked for
 * ------------------------------------------------------------------ */
const ALL_TEMPLATES = ['panel', 'page', 'settings', 'command', 'blank']
check(
    'template: schema enumerates every template',
    ALL_TEMPLATES.every((value) => tools.createPluginProject.inputSchema.properties.template.enum.includes(value)),
    JSON.stringify(tools.createPluginProject.inputSchema.properties.template.enum),
)

const pageProject = await tools.createPluginProject.execute({ name: 'page-plugin', template: 'page' })
check(
    'template: forwarded to dev.scaffold',
    calls.some(([name, args]) => name === 'scaffold' && args.name === 'page-plugin' && args.template === 'page'),
)
check('template: reported back', pageProject.template === 'page', JSON.stringify(pageProject.template))
check(
    'template: explains what to edit next',
    typeof pageProject.templateNote === 'string' && pageProject.templateNote.includes('CanvasPage'),
    String(pageProject.templateNote),
)

await tools.createPluginProject.execute({ name: 'plain-plugin' })
check(
    'template: defaults to panel',
    calls.some(([name, args]) => name === 'scaffold' && args.name === 'plain-plugin' && args.template === 'panel'),
)

let badTemplate = ''
try {
    await tools.createPluginProject.execute({ name: 'bad-plugin', template: 'nope' })
} catch (error) {
    badTemplate = error.message
}
check('template: unknown value rejected', /未知的模板/.test(badTemplate) && /panel/.test(badTemplate), badTemplate)

/* ------------------------------------------------------------------ *
 * Host globals and declared externals
 * ------------------------------------------------------------------ */
const globals = await tools.listHostGlobals.execute({})
check(
    'globals: lists the host namespace',
    globals.namespace === 'window.__KN__' && globals.globals.some((entry) => entry.name === 'svelte'),
    JSON.stringify(globals.globals),
)
check(
    'globals: names the always-injected modules',
    globals.builtinModules.includes('@kn/common') && globals.builtinModules.includes('react'),
    JSON.stringify(globals.builtinModules),
)

const withExternals = await tools.runPluginProject.execute({
    root: ROOT,
    externals: ['svelte', '@scope/svelte'],
})
check(
    'externals: forwarded to dev.start',
    calls.some(([name, args]) => name === 'start' && args.externals?.includes('svelte')),
    JSON.stringify(calls.filter(([name]) => name === 'start').map(([, args]) => args.externals)),
)
check(
    'externals: mirrors the scope-dropping rule',
    Array.isArray(withExternals.externals) && withExternals.externals.length === 2,
    JSON.stringify(withExternals.externals),
)

await tools.buildPluginProject.execute({ root: ROOT, externals: ['svelte'] })
check(
    'externals: forwarded to dev.build',
    calls.some(([name, args]) => name === 'build' && args.externals?.includes('svelte')),
)

await tools.runPluginProject.execute({ root: ROOT })
check(
    'externals: omitted stays omitted (a restart then inherits)',
    calls.some(([name, args]) => name === 'start' && args.externals === undefined),
    JSON.stringify(calls.filter(([name]) => name === 'start').map(([, args]) => args.externals)),
)

const startsBefore = calls.filter(([name]) => name === 'start').length
let unknownExternal = ''
try {
    await tools.runPluginProject.execute({ root: ROOT, externals: ['svelte', 'Nope'] })
} catch (error) {
    unknownExternal = error.message
}
check(
    'externals: unknown module refused with a way forward',
    /Nope/.test(unknownExternal) && /listHostGlobals|installPluginDependencies/.test(unknownExternal),
    unknownExternal,
)
check(
    'externals: refusal happens before the bridge call',
    calls.filter(([name]) => name === 'start').length === startsBefore,
)

let badExternalsType = ''
try {
    await tools.buildPluginProject.execute({ root: ROOT, externals: 'svelte' })
} catch (error) {
    badExternalsType = error.message
}
check('externals: non-array rejected', /字符串数组/.test(badExternalsType), badExternalsType)

const builtinExternals = await tools.runPluginProject.execute({ root: ROOT, externals: ['react', '@kn/common'] })
check(
    'externals: always-injected modules need no host global',
    Array.isArray(builtinExternals.externals) && builtinExternals.externals.length === 2,
    JSON.stringify(builtinExternals.externals),
)

/* ------------------------------------------------------------------ *
 * Delete project: files, session and the project's own running preview
 * ------------------------------------------------------------------ */
const uninstallsBefore = calls.filter(([name]) => name === 'uninstall').length
const deleted = await tools.deletePluginProject.execute({ root: ROOT })
check(
    'delete: reports the removal',
    deleted.ok === true && deleted.removed === true && deleted.root === ROOT,
    JSON.stringify(deleted),
)
check(
    'delete: reaches dev.removeProject',
    calls.some(([name, args]) => name === 'removeProject' && args.root === ROOT),
)
check(
    'delete: drops its own running preview',
    deleted.uninstalled === true && calls.filter(([name]) => name === 'uninstall').length === uninstallsBefore + 1,
    JSON.stringify(calls.filter(([name]) => name === 'uninstall')),
)
check('delete: says what happened', typeof deleted.note === 'string' && deleted.note.includes('已删除'), String(deleted.note))

/* Deleting one file: project-scoped, and only after the model has looked at it. */
const oldPanelPath = `${ROOT}/src/OldPanel.tsx`
let unobservedDelete = ''
try {
    await tools.deletePluginProjectFile.execute({ root: ROOT, path: oldPanelPath })
} catch (error) {
    unobservedDelete = error.message
}
check('deleteFile: refuses a file that was never read', /readPluginProjectFile/.test(unobservedDelete), unobservedDelete)

await tools.readPluginProjectFile.execute({ path: oldPanelPath })
const fileDeleted = await tools.deletePluginProjectFile.execute({ root: ROOT, path: oldPanelPath })
check(
    'deleteFile: reaches dev.deleteFile with root + path',
    calls.some(([name, args]) => name === 'deleteFile' && args.root === ROOT && args.path === oldPanelPath),
    JSON.stringify(calls.filter(([name]) => name === 'deleteFile')),
)
check(
    'deleteFile: reports what was removed',
    fileDeleted.ok === true && fileDeleted.relativePath === 'src/OldPanel.tsx' && fileDeleted.bytes === 29,
    JSON.stringify(fileDeleted),
)
check(
    'deleteFile: hands back the content for undo',
    typeof fileDeleted.content === 'string' && fileDeleted.content.includes('OldPanel') && fileDeleted.truncated === false,
    String(fileDeleted.content),
)

let noDeleteFile = ''
try {
    await createStudioTools({
        getDev: () => ({ ...dev, deleteFile: undefined }),
        getPluginHost: () => pluginHost,
    }).deletePluginProjectFile.execute({ root: ROOT, path: `${ROOT}/src/index.tsx` })
} catch (error) {
    noDeleteFile = error.message
}
check('guard: missing dev.deleteFile reported', /dev\.deleteFile/.test(noDeleteFile), noDeleteFile)

let noRemove = ''
try {
    await createStudioTools({
        getDev: () => ({ ...dev, removeProject: undefined }),
        getPluginHost: () => pluginHost,
    }).deletePluginProject.execute({ root: ROOT })
} catch (error) {
    noRemove = error.message
}
check('guard: missing dev.remove reported', /dev\.remove/.test(noRemove), noRemove)

/* A failing build must surface the compiler error, not throw. */
const failingStatus = {
    ...status(ROOT, 1, 'v1'),
    state: 'failed',
    error: 'src/index.tsx:1: Expected "}" but found end of file',
}
const failingTools = createStudioTools({
    getDev: () => ({ ...dev, status: async () => [failingStatus], build: async () => failingStatus }),
    getPluginHost: () => pluginHost,
})
const failed = await failingTools.buildPluginProject.execute({ root: ROOT })
check('errors: reported, not thrown', failed.ok === false && /Expected/.test(String(failed.error)), String(failed.error))

/*
 * Real failed rebuilds keep state 'watching' (the session survives) and only set
 * `error`. The tool must treat that as failure too — otherwise it reports
 * success and re-installs the previous, stale build.
 */
const staleBuild = { code: '/* stale v1 */', bytes: 14, durationMs: 5, modules: ['src/index.tsx'] }
const watchingFailStatus = {
    ...status(ROOT, 1, 'v1'),
    state: 'watching',
    build: staleBuild,
    error: 'src/index.tsx:1: boom',
}
const installsBefore = installs.length
const watchingFailTools = createStudioTools({
    getDev: () => ({ ...dev, status: async () => [watchingFailStatus], build: async () => watchingFailStatus }),
    getPluginHost: () => pluginHost,
})
const watchingFail = await watchingFailTools.buildPluginProject.execute({ root: ROOT })
check(
    'errors: watching + error is a failure',
    watchingFail.ok === false && /boom/.test(String(watchingFail.error)),
    JSON.stringify(watchingFail),
)
check('errors: stale build not re-installed on failure', installs.length === installsBefore, String(installs.length))

/* Host-API reference: the agent reads the standard packages before writing. */
const apiPackages = await tools.listHostApiPackages.execute({})
check(
    'hostApi: lists packages with entry',
    apiPackages.packages[0]?.name === '@kn/common' && apiPackages.packages[0]?.entry === 'src/index.ts',
    JSON.stringify(apiPackages.packages),
)
check('hostApi: list reaches dev.hostApi', calls.some(([name]) => name === 'hostApi'))

const apiSearch = await tools.searchHostApi.execute({ query: 'DockPanelConfig' })
check(
    'hostApi: search returns file + line',
    apiSearch.matches[0]?.path === 'src/core/dock.ts' && apiSearch.matches[0]?.line === 35,
    JSON.stringify(apiSearch.matches[0]),
)
check(
    'hostApi: search forwards query',
    calls.some(([name, args]) => name === 'hostApi' && args.query === 'DockPanelConfig'),
)

const apiFile = await tools.readHostApiFile.execute({ package: '@kn/common', path: 'src/core/dock.ts' })
check('hostApi: read returns contents', apiFile.contents.includes('DockPanelConfig'), apiFile.contents)
check(
    'hostApi: read forwards package + path',
    calls.some(([name, args]) => name === 'hostApi' && args.package === '@kn/common' && args.path === 'src/core/dock.ts'),
)

/* Without a dev-capable host the tools must explain themselves. */
let message = ''
try {
    await createStudioTools({ getDev: () => undefined, getPluginHost: () => pluginHost }).listPluginProjects.execute({})
} catch (error) {
    message = error.message
}
check('guard: non-dev host explains itself', /桌面客户端/.test(message), message)

/* Without the plugin host, running must fail loudly rather than silently skip. */
let installMessage = ''
try {
    await createStudioTools({ getDev: () => dev, getPluginHost: () => undefined }).runPluginProject.execute({ root: ROOT })
} catch (error) {
    installMessage = error.message
}
check('guard: missing pluginHost reported', /pluginHost/.test(installMessage), installMessage)

/*
 * The authoring skill must own every studio tool. An extension that declares
 * `skills` no longer auto-generates a default skill from `tools`, so a tool
 * missing from requiredTools would lose its prompt guidance.
 */
const toolNames = Object.keys(createStudioTools({ getDev: () => dev, getPluginHost: () => pluginHost }))
check(
    'skill: ships a prompt fragment',
    typeof pluginAuthoringSkill.systemPromptFragment === 'string'
        && pluginAuthoringSkill.systemPromptFragment.length > 200,
)
const uncoveredTools = toolNames.filter((name) => !pluginAuthoringSkill.requiredTools.includes(name))
check('skill: owns every studio tool', uncoveredTools.length === 0, uncoveredTools.join(', '))
const unknownTools = pluginAuthoringSkill.requiredTools.filter((name) => !toolNames.includes(name))
check('skill: references no unknown tools', unknownTools.length === 0, unknownTools.join(', '))

const failedChecks = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed`)
process.exit(failedChecks.length ? 1 : 0)
