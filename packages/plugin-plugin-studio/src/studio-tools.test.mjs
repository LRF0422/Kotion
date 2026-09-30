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
import * as iconArt from './icons/icon-art.ts'

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

/** The host's icon namespace (a slice of @kn/icon) + the real icon art module. */
const iconToolkit = {
    iconNames: () => [
        'ChartLine',
        'ChartBar',
        'ChartPie',
        'Music',
        'createLucideIcon',
        'default',
        'AiFillGithub',
        'TbBrandGithub',
    ],
    filterIconNames: iconArt.filterIconNames,
    suggestGlyphs: iconArt.suggestGlyphs,
    railIconSnippets: iconArt.railIconSnippets,
    applyIcon: iconArt.applyPluginIcon,
    readDeclaredIcon: iconArt.readDeclaredIcon,
    iconMimeType: iconArt.iconMimeType,
    isUploadableIcon: iconArt.isUploadableIcon,
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

/** The host's service registry view (names + owners), as the studio reads it. */
const serviceRegistry = {
    services: {
        spacePageService: {},
        fileService: {},
        uploadTaskService: {},
        desktop: {},
        pluginManagement: {},
        'mermaid:render': {},
    },
    owners: {
        spacePageService: { type: 'core' },
        fileService: { type: 'core' },
        uploadTaskService: { type: 'core' },
        desktop: { type: 'core' },
        pluginManagement: { type: 'core' },
        'mermaid:render': { type: 'plugin', pluginName: 'Mermaid' },
    },
    getAll() {
        return this.services
    },
    getOwner(name) {
        return this.owners[name]
    },
}

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
        calls.push(['uploadArtifact', { fileName: options.fileName, bytes: options.data?.size ?? 0, type: options.data?.type ?? null }])
        return { resourcePath: 'plugins/' + options.fileName, integrity: 'sha256-abc' }
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
    getServiceRegistry: () => serviceRegistry,
    getIconToolkit: () => iconToolkit,
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
    'listPluginServices',
    'listPluginIcons',
    'generatePluginIcon',
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
        && tools.listHostGlobals.readOnly === true
        && tools.listPluginServices.readOnly === true,
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
 * Registry MANAGEMENT is not a studio capability: the plugin manager owns the
 * installed-plugin lifecycle, and exposing install/uninstall of arbitrary
 * plugins here would hand every agent run the ability to remove them. Read-only
 * capability discovery (services, contributions) is in scope — that is what
 * authoring a plugin needs. Assert the boundary stays where it is.
 */
check(
    'boundary: no registry management tools',
    !names.includes('listInstalledPlugins')
        && !names.includes('uninstallInstalledPlugin')
        && !names.some((name) => /uninstall/i.test(name)),
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
 * Service discovery: "这个插件有什么 service" + "我能调什么"
 * ------------------------------------------------------------------ */
const services = await tools.listPluginServices.execute({})
check(
    'services: lists every registered service with its owner',
    services.count === 6
        && services.services.some((entry) => entry.name === 'spacePageService' && entry.owner === 'core')
        && services.services.some((entry) => entry.name === 'mermaid:render' && entry.owner === 'Mermaid'),
    JSON.stringify(services.services),
)
check(
    'services: answers "what does that plugin provide"',
    services.byPlugin.Mermaid?.length === 1 && services.byPlugin.Mermaid[0] === 'mermaid:render',
    JSON.stringify(services.byPlugin),
)
check(
    'services: separates host services from plugin services',
    services.coreServices.includes('spacePageService') && !services.coreServices.includes('mermaid:render'),
    JSON.stringify(services.coreServices),
)
check(
    'services: teaches the call pattern and the contract location',
    Array.isArray(services.callPattern)
        && services.callPattern.some((line) => line.includes('resolveOptionalService'))
        && /types\.ts/.test(String(services.hint)),
    JSON.stringify(services.callPattern),
)

const owned = await tools.listPluginServices.execute({ owner: 'Mermaid' })
check(
    'services: filters by provider',
    owned.count === 1 && owned.services[0].name === 'mermaid:render',
    JSON.stringify(owned.services),
)
const searched = await tools.listPluginServices.execute({ query: 'PAGE' })
check(
    'services: filters by name, case-insensitively',
    searched.count === 1 && searched.services[0].name === 'spacePageService',
    JSON.stringify(searched.services),
)

let noRegistry = ''
try {
    await createStudioTools({ getDev: () => dev, getPluginHost: () => pluginHost }).listPluginServices.execute({})
} catch (error) {
    noRegistry = error.message
}
check('guard: missing service registry reported', /服务注册表/.test(noRegistry), noRegistry)

/* A registry that does not track ownership still lists names. */
const bareRegistry = createStudioTools({
    getDev: () => dev,
    getPluginHost: () => pluginHost,
    getServiceRegistry: () => ({ getAll: () => ({ someService: {} }) }),
})
const bareServices = await bareRegistry.listPluginServices.execute({})
check(
    'services: tolerates a registry without ownership',
    bareServices.count === 1 && bareServices.services[0].ownerType === 'unknown',
    JSON.stringify(bareServices.services),
)

/* ------------------------------------------------------------------ *
 * Icons: pick a real rail icon name, then generate the marketplace image
 * ------------------------------------------------------------------ */
const iconNames = await tools.listPluginIcons.execute({ query: 'chart' })
check(
    'icons: only real, PascalCase component names come back',
    iconNames.icons.length === 3
        && iconNames.icons.every((entry) => /^[A-Z]/.test(entry.name))
        && !iconNames.icons.some((entry) => entry.name === 'createLucideIcon' || entry.name === 'default'),
    JSON.stringify(iconNames.icons.map((entry) => entry.name)),
)
check(
    'icons: every hit is paste-ready (import + rail icon + jsx)',
    iconNames.icons[0].importLine === "import { ChartLine } from '@kn/icon'"
        && iconNames.icons[0].railIcon.includes('React.createElement(ChartLine')
        && iconNames.icons[0].jsx === '<ChartLine className="h-4 w-4" />',
    JSON.stringify(iconNames.icons[0]),
)
check(
    'icons: reports the namespace size and emoji suggestions',
    iconNames.totalAvailable === 8
        && iconNames.emoji.some((entry) => entry.glyph === '📊'),
    JSON.stringify({ total: iconNames.totalAvailable, emoji: iconNames.emoji }),
)
const untitledIcons = await tools.listPluginIcons.execute({})
check('icons: no query lists names too', untitledIcons.icons.length > 0 && untitledIcons.count === untitledIcons.icons.length)

/* Seed a scaffold-shaped project so the rail patch has something real to hit. */
files.set(
    `${ROOT}/package.json`,
    JSON.stringify(
        { name: 'agent-made-plugin', knPluginStudio: { pluginKey: 'agent-made-plugin', displayName: 'Agent Made', entry: 'src/index.tsx' } },
        null,
        2,
    ),
)
files.set(
    `${ROOT}/src/index.tsx`,
    "import { KPlugin } from '@kn/common'\nimport React from 'react'\n\nexport const p = new KPlugin({\n    dockPanels: [\n        { id: 'p', title: 'P', icon: React.createElement('span', null, '🛠'), component: Panel },\n    ],\n})\n",
)

const generated = await tools.generatePluginIcon.execute({ root: ROOT, name: 'Agent Made', keywords: ['chart'] })
check(
    'icon: renders artwork and writes it where the manifest points',
    generated.ok === true
        && generated.relativePath === 'assets/icon.svg'
        && generated.glyph === '📊'
        && files.get(`${ROOT}/assets/icon.svg`) === generated.svg,
    JSON.stringify({ relativePath: generated.relativePath, glyph: generated.glyph }),
)
check(
    'icon: points the manifest at it, keeping the rest of the block',
    JSON.parse(files.get(`${ROOT}/package.json`)).knPluginStudio.icon === 'assets/icon.svg'
        && JSON.parse(files.get(`${ROOT}/package.json`)).knPluginStudio.pluginKey === 'agent-made-plugin',
    files.get(`${ROOT}/package.json`).split('\n').filter((line) => line.includes('icon') || line.includes('pluginKey')).join(' '),
)
check(
    'icon: swaps the scaffold rail icon so the app shows the same glyph',
    generated.railIcon.updated === true
        && generated.railIcon.status === 'updated'
        && files.get(`${ROOT}/src/index.tsx`).includes("React.createElement('span', null, '📊')"),
    files.get(`${ROOT}/src/index.tsx`).split('\n').find((line) => line.includes('icon:')),
)
check(
    'icon: becomes the conversation artifact (and is focused)',
    focused.some((entry) => entry.tool === 'generatePluginIcon') && generated.svg.includes('<svg'),
    JSON.stringify(focused.map((entry) => entry.tool).slice(-2)),
)
check(
    'icon: reached the dev bridge, not the filesystem directly',
    calls.filter(([name]) => name === 'writeFile').length >= 3,
    String(calls.filter(([name]) => name === 'writeFile').length),
)
const generatedAgain = await tools.generatePluginIcon.execute({ root: ROOT, glyph: '🚀', apply: false })
check(
    'icon: explicit glyph wins, apply:false leaves source alone',
    generatedAgain.glyph === '🚀' && generatedAgain.railIcon.status === 'disabled',
    JSON.stringify({ glyph: generatedAgain.glyph, rail: generatedAgain.railIcon.status }),
)

let noIconToolkit = ''
try {
    await createStudioTools({ getDev: () => dev, getPluginHost: () => pluginHost }).generatePluginIcon.execute({ root: ROOT })
} catch (error) {
    noIconToolkit = error.message
}
check('guard: missing icon toolkit reported', /图标/.test(noIconToolkit), noIconToolkit)

/* Publishing carries the project's own icon: nobody uploads it by hand. */
const uploadsBefore = calls.filter(([name]) => name === 'uploadArtifact').length
const publishedWithIcon = await tools.publishPluginProject.execute({
    root: ROOT,
    version: '2.0.0',
    description: 'Publishes with the generated icon',
})
const iconUploads = calls
    .filter(([name]) => name === 'uploadArtifact')
    .map(([, args]) => args)
    .filter((args) => args.type === 'image/svg+xml')
check(
    'publish: uploads the manifest icon as an image',
    publishedWithIcon.ok === true
        && publishedWithIcon.icon === 'plugins/icon.svg'
        && iconUploads.length === 1
        && (calls.filter(([name]) => name === 'uploadArtifact').length === uploadsBefore + 2),
    JSON.stringify({ icon: publishedWithIcon.icon, uploads: iconUploads }),
)
check(
    'publish: submit carries the uploaded icon path',
    (() => {
        const submits = calls.filter(([name]) => name === 'submit')
        const last = submits[submits.length - 1]?.[1]
        return last?.icon === 'plugins/icon.svg' && /已上传工程图标/.test(String(publishedWithIcon.iconNote))
    })(),
    JSON.stringify(publishedWithIcon.iconNote),
)

/* An explicit, already-uploaded path is respected as-is. */
const explicitIcon = await tools.publishPluginProject.execute({
    root: ROOT,
    version: '2.0.1',
    description: 'Explicit icon path',
    icon: 'oss/uploaded-by-hand.png',
})
check(
    'publish: an explicit icon path skips the upload',
    explicitIcon.icon === 'oss/uploaded-by-hand.png'
        && calls.filter(([name]) => name === 'uploadArtifact').length === uploadsBefore + 3,
    JSON.stringify({ icon: explicitIcon.icon, uploads: calls.filter(([name]) => name === 'uploadArtifact').length }),
)

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
