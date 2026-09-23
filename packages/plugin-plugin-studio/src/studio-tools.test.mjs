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
}

const pluginHost = {
    async installFromSource(options) {
        installs.push(options)
        return true
    },
}

const tools = createStudioTools({ getDev: () => dev, getPluginHost: () => pluginHost })
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
    'runPluginProject',
    'buildPluginProject',
    'stopPluginProject',
    'pluginProjectLogs',
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
    tools.listPluginProjects.readOnly === true && tools.readPluginProjectFile.readOnly === true,
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
