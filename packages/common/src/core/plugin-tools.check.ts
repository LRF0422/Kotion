/**
 * Plugin tools and progressive discovery, end to end on the client side.
 *
 * Two contracts are pinned here, both of which have already broken once in
 * production:
 *
 *  1. **A plugin capability is never split.** An earlier default tool ceiling
 *     sliced the catalog so bitable kept `insertBitable` while
 *     `getBitableList` / `addBitableRecord` / `updateBitableRecord` were dropped —
 *     a workflow that must insert, read and then write became impossible.
 *  2. **Withholding a schema is only acceptable if it can be delivered on demand.**
 *     Skills ship with the names of the tools they own and nothing else; the
 *     `load_skill` tool (through the real bridge) has to hand over a skill's tools
 *     with their schemas — what the model needs to call them, and what the backend
 *     reads to make them routable.
 *
 * It runs the real chain — `KPlugin` → `resolvePluginToolGroups` → `ToolProvider`
 * → `collectCapabilityCatalog` → `buildAgentRunInputs` / `load_skill` — with stub
 * factories standing in for the React/Tiptap-coupled originals.
 */

import { KPlugin, PluginManager } from './PluginManager'
import { liftLegacySkills, liftLegacyTools } from '../ai/plugin-agent'
import { ToolProvider } from '../ai/providers/ToolProvider'
import { SkillProvider } from '../ai/providers/SkillProvider'
import { collectCapabilityCatalog } from '../ai/capabilities/CapabilityCatalog'
import { filterAgentCatalog } from '../ai/kernel/filter-catalog'
import { BUILTIN_TOOL_METADATA } from '../ai/discovery/tool-metadata'
import { buildAgentRunInputs } from '../ai/capabilities/catalog-to-run-input'
import { agentArtifactKey, collectAgentArtifacts } from '../ai/kernel/agent-artifact-collect'
import { createSkillToolSource, registerSkillToolSource } from '../ai/skills/skill-tool-bridge'
import { createSkillTools } from '../ai/tools/skill-tools'
import { registerToolFactories } from '../ai/tools/tool-factory-registry'
import { logger, LogLevel } from '../utils/logger'

// Plugin load/resolve logging would drown the check output.
logger.setLevel(LogLevel.ERROR)

const assert = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(message)
}
assert.equal = (actual: unknown, expected: unknown, message?: string): void => {
    if (actual !== expected) {
        throw new Error(`${message ?? 'values differ'}: expected ${expected}, got ${actual}`)
    }
}

/** A legacy extension tool: a factory taking the editor, returning the executor. */
const legacyTool = (name: string, priority?: number) => ({
    name,
    description: `${name} description`,
    inputSchema: {
        type: 'object',
        properties: { target: { type: 'string' } },
    },
    ...(priority ? { priority } : {}),
    execute: (_editor: any) => async () => ({ ok: true, tool: name }),
})

/** A plugin the way the migrated document plugins declare themselves. */
const plugin = (name: string, tools: ReturnType<typeof legacyTool>[]) => new KPlugin<any>({
    name,
    status: 'active',
    editorExtension: [],
    // Top-level `tools` / `skills`: the plugin's agent surface (see PluginConfig).
    tools: liftLegacyTools(tools as any, { scope: 'page' }),
    skills: liftLegacySkills([{
        name: `${name.toLowerCase()}-ops`,
        description: name,
        requiredTools: tools.map(tool => tool.name),
        // A real plugin skill describes its tools; that fragment is what lets
        // the catalog withhold the schemas and name the tools instead.
        systemPromptFragment: `You can use the ${name} tools listed for this skill.`,
    }] as any),
})

const chartTools = [
    legacyTool('deleteChart'),
    legacyTool('getChartTemplates'),
    legacyTool('insertChart', 9),
    legacyTool('listCharts'),
]
/** The plugin that exposed the split: one insert tool plus the read/write set. */
const bitableTools = [
    legacyTool('addBitableRecord'),
    legacyTool('deleteBitableRecords'),
    legacyTool('getBitableList'),
    legacyTool('insertBitable', 9),
    legacyTool('insertBitableAtPosition', 9),
    legacyTool('updateBitableRecord'),
]

/** The metadata registry (the same array ToolProvider seeds itself from). */
const toolProviderMetadata = () => BUILTIN_TOOL_METADATA as any[]

/** Run the real registration + catalog chain once, and keep its providers. */
function buildProviders() {
    const plugins = [plugin('Chart', chartTools), plugin('Bitable', bitableTools)]
    const manager = new PluginManager({} as any, plugins)
    // The app populates this during plugin load (loadPlugins/loadRemotePlugins).
    manager.plugins = plugins

    const groups = manager.resolvePluginToolGroups({ id: 'stub-editor' } as any)
    assert(groups.length === 2,
        `every plugin with agent.tools must resolve a group (got ${groups.length})`)

    const resolved: Record<string, any> = {}
    for (const group of groups) Object.assign(resolved, group.tools)
    for (const name of ['insertChart', 'insertBitable', 'addBitableRecord']) {
        assert(resolved[name], `${name} must reach the plugin tool registry`)
    }
    assert(resolved.insertChart.priority === 9,
        `a declared tool priority must survive the lift (got ${resolved.insertChart.priority})`)

    // The app registers the core factories at startup; in this harness only the
    // essential editing path plus the discovery tool are needed to observe the
    // catalog's split. `load_skill` is the REAL tool.
    const essential = (name: string) => ({
        description: `${name} description`,
        inputSchema: { type: 'object', properties: {} },
        execute: async () => ({ ok: true, tool: name }),
    })
    registerToolFactories([() => ({
        getDocumentStructure: essential('getDocumentStructure'),
        insertAtBlockId: essential('insertAtBlockId'),
        applyEdits: essential('applyEdits'),
        askUserChoice: essential('askUserChoice'),
        // The real tool, marked as every scope's protocol entry point below.
        ...createSkillTools(),
    })])
    // Mirror the metadata registry: `load_skill` is scope-agnostic.
    const skillMetadata = toolProviderMetadata().find(meta => meta.name === 'load_skill')
    if (skillMetadata) skillMetadata.scope = 'any'

    const toolProvider = new ToolProvider({ editor: { id: 'stub-editor' } as any })
    for (const group of groups) toolProvider.registerPluginTools(group.tools, group.pluginName)
    const skillProvider = new SkillProvider({})
    skillProvider.registerSkills((manager.resolveSkills?.() ?? []) as any)

    for (const name of ['insertChart', 'insertBitable']) {
        const meta = toolProvider.getToolMetadata(name)
        assert(!!meta && meta.priority === 9 && meta.source === 'plugin',
            `${name} must keep its declared priority and plugin attribution in the metadata`)
    }

    return { toolProvider, skillProvider }
}

/** A plugin like plugin-main: it declares tools but no skill (the manager then
 * generates a fragment-less `<plugin>-default` skill for them). Those tools must
 * keep their schemas — a fragment-less skill advertises nothing, so withholding
 * would simply hide them. This is what keeps `createPage` callable on a surface
 * that has no document tools at all. */
function buildDefaultSkillPluginProviders() {
    const pageTools = [legacyTool('createPage'), legacyTool('searchPages')]
    const manager = new PluginManager({} as any, [])
    const pluginInstance = new KPlugin<any>({
        name: 'Main',
        status: 'active',
        editorExtension: [],
        tools: liftLegacyTools(pageTools as any, { scope: 'any' }),
    })
    manager.plugins = [pluginInstance]
    const groups = manager.resolvePluginToolGroups({ id: 'stub-editor' } as any)

    const toolProvider = new ToolProvider({ editor: { id: 'stub-editor' } as any })
    toolProvider.registerPluginTools(groups[0]?.tools ?? {}, 'Main')
    const skillProvider = new SkillProvider({})
    skillProvider.registerSkills((manager.resolveSkills?.() ?? []) as any)
    return { toolProvider, skillProvider }
}

const providers = buildProviders()

// The capability hook registers this in the running app; here it is registered
// once for the whole check. `load_skill` cannot work without it.
registerSkillToolSource(createSkillToolSource(providers.skillProvider, providers.toolProvider))

function loadSkillTool() {
    return (createSkillTools() as any).load_skill
}

/** Discovery on (the default): names travel, schemas do not. */
function checkSchemasAreWithheldButNamed(): void {
    const run = buildAgentRunInputs(collectCapabilityCatalog(providers.skillProvider, providers.toolProvider))
    const advertised = run.tools.map(tool => tool.name)

    for (const name of ['insertChart', 'getChartTemplates', 'insertBitable', 'addBitableRecord']) {
        assert(!advertised.includes(name),
            `${name} belongs to a skill: its schema must not ride in every request`)
    }
    assert(!run.deferredTools.some(tool => tool.name === 'insertBitable'),
        'a withheld schema is delivered by load_skill, not parked in a name-only directory')

    // The skill travels with the names it owns — how the model learns what it can
    // ask for, and what `load_skill` will hand back.
    const bitable = run.skills.find(input => input.name === 'bitable-ops')
    assert(!!bitable, 'the skill must travel even though its tools do not')
    for (const name of ['insertBitable', 'getBitableList', 'addBitableRecord']) {
        assert((bitable!.requiredTools ?? []).includes(name),
            `${name} must be named by its skill so the model knows it exists`)
    }
    // The essential editing path, the page entry points and the discovery tool stay
    // advertised, so a run can always read, write, ask — and ask for more.
    for (const name of ['getDocumentStructure', 'insertAtBlockId', 'applyEdits', 'askUserChoice', 'load_skill']) {
        assert(advertised.includes(name), `${name} is essential and must travel with its schema`)
    }
}

/** The delivery half: a whole capability, schemas included, on request. */
async function checkLoadSkillDeliversAWholeCapability(): Promise<void> {
    const loadSkill = loadSkillTool()

    const loaded = await loadSkill.execute({ skill: 'bitable-ops' })
    assert(loaded.success, 'the skill must load')
    assert.equal(loaded.activateTools.length, bitableTools.length,
        'every tool of the capability must arrive, not just its entry point')
    const record = loaded.activateTools.find((spec: any) => spec.name === 'addBitableRecord')
    assert(!!record, 'addBitableRecord must be delivered')
    assert(record.inputSchema && Object.keys(record.inputSchema).length > 0,
        'the delivered spec must carry a real schema: the model calls the tool from it')
    assert.equal(record.source, 'client')
    assert.equal(record.kind, 'frontend')

    const chart = await loadSkill.execute({ skill: 'chart-ops' })
    assert.equal(chart.activateTools.length, chartTools.length)

    const unknown = await loadSkill.execute({ skill: 'nope' })
    assert(!!unknown.error && unknown.available.includes('bitable-ops'),
        'an unknown skill must report what can be loaded instead')
}

/** Host escape hatch: advertise everything up front, defer nothing. */
function checkDiscoveryCanBeTurnedOff(): void {
    const run = buildAgentRunInputs(collectCapabilityCatalog(
        providers.skillProvider, providers.toolProvider, { skillDiscovery: false }))
    const advertised = run.tools.map(tool => tool.name)
    for (const tool of [...chartTools, ...bitableTools]) {
        assert(advertised.includes(tool.name),
            `with discovery off every callable tool is advertised (${tool.name})`)
    }
    assert.equal(run.deferredTools.length, 0, 'and nothing is deferred')
}

/** With an explicit ceiling, insertion tools keep their entry points. */
function checkCeilingKeepsEntryPoints(): void {
    const catalog = collectCapabilityCatalog(
        providers.skillProvider, providers.toolProvider, { skillDiscovery: false })
    // Core tools are never dropped, so the budget has to be above them for the
    // ranking to be observable at all: 5 essentials + 4 plugin slots.
    const constrained = buildAgentRunInputs({ ...catalog, toolBudget: 9 } as any)

    for (const name of ['insertChart', 'insertBitable', 'insertBitableAtPosition']) {
        assert(constrained.tools.some(tool => tool.name === name),
            `${name} must keep its entry point when a ceiling is imposed`)
    }
    assert.equal(constrained.tools.length + constrained.deferredTools.length,
        catalog.tools.length,
        'a ceiling must move tools, never lose them')
    assert(constrained.deferredTools.every(tool => !!tool.inputSchema),
        'a deferred tool keeps its schema: the backend returns it on the first call')
}

/**
 * The failure this pins (seen in production): a workspace-scoped surface filters
 * the catalogue down to plugin tools. Discovery used to withhold a skill's tools
 * BEFORE that filter ran, so the filter had nothing left to keep — and it removed
 * the discovery tool too, leaving the run with no client tools at all. The model
 * answered honestly ("createPage 未注册、调不通") and did nothing.
 */
async function checkWorkspaceScopeKeepsTheDiscoveryPath(): Promise<void> {
    const { toolProvider, skillProvider } = providers
    const available = (name: string): boolean => {
        const meta = toolProvider.getToolMetadata(name)
        if (!meta) return false
        if (meta.source === 'plugin') return true
        return meta.scope === 'any' || meta.scope === 'workspace'
    }
    const workspaceCatalog = filterAgentCatalog(
        collectCapabilityCatalog(skillProvider, toolProvider),
        available,
    )
    const run = buildAgentRunInputs(workspaceCatalog)
    const advertised = run.tools.map(tool => tool.name)

    // The discovery tool survives a scope that has no document tools at all.
    assert(advertised.includes('load_skill'),
        'a workspace run must keep the discovery tool: it is the only route to a capability')
    // And the plugin skills travel with the names they own, so the model knows what
    // to ask for.
    const chart = run.skills.find(skill => skill.name === 'chart-ops')
    assert(!!chart, 'plugin skills must survive scope filtering')
    assert((chart!.requiredTools ?? []).includes('insertChart'),
        'the skill must still name the tool that load_skill will deliver')

    // Delivery works in that scope too: ask for the skill, get the schemas.
    const loadSkill = (createSkillTools() as any).load_skill
    const loaded = await loadSkill.execute({ skill: 'chart-ops' })
    assert(loaded.success, 'the workspace run must be able to load a plugin skill')
    assert.equal(loaded.activateTools.length, chartTools.length)
}

/** Tools of a fragment-less (auto-generated) skill keep their schemas. */
function checkDefaultSkillToolsStayAdvertised(): void {
    const { toolProvider, skillProvider } = buildDefaultSkillPluginProviders()
    const run = buildAgentRunInputs(collectCapabilityCatalog(skillProvider, toolProvider))
    const advertised = run.tools.map(tool => tool.name)
    for (const name of ['createPage', 'searchPages']) {
        assert(advertised.includes(name),
            `${name} has no skill prose to advertise it, so it must keep its schema`)
    }
}

/**
 * Published plugins still declare `agent: { tools, skills }`. That form must keep
 * loading (it is only deprecated, and it logs a warning), or every plugin already
 * in the marketplace would lose its capabilities on upgrade.
 */
function checkNestedAgentFormStillLoads(): void {
    const pageTools = [legacyTool('insertChart', 9)]
    const legacy = new KPlugin<any>({
        name: 'Legacy',
        status: 'active',
        editorExtension: [],
        agent: {
            tools: liftLegacyTools(pageTools as any, { scope: 'page' }),
            skills: liftLegacySkills([{
                name: 'legacy-ops',
                description: 'legacy',
                requiredTools: ['insertChart'],
                systemPromptFragment: 'legacy tools',
            }] as any),
        },
    })
    const manager = new PluginManager({} as any, [legacy])
    manager.plugins = [legacy]

    const groups = manager.resolvePluginToolGroups({ id: 'stub-editor' } as any)
    assert(groups.length === 1 && !!groups[0].tools.insertChart,
        'a plugin using the deprecated nested form must keep its tools')
    assert(manager.resolveSkills().some(skill => skill.name === 'legacy-ops'),
        'and keep its skills')
}

/**
 * The real bitable declaration, end to end.
 *
 * Names and claim lists are copied from `plugin-bitable/src/bitable/bitable-tools.ts`
 * and `.../skills/bitable-skill.ts`, because the failure this guards was about the
 * exact names: the skill is called `bitable-skill`, the model asks for `bitable`,
 * and the tools must arrive whole through the catalogue.
 */
async function checkRealBitableDeclarationResolves(): Promise<void> {
    const required = ['getBitableList', 'getBitableData', 'insertBitable']
    const optional = [
        'queryBitableRecords', 'insertBitableAtPosition', 'addBitableRecord',
        'updateBitableRecord', 'deleteBitableRecords', 'addBitableField',
        'updateBitableField', 'deleteBitableField', 'addBitableView',
        'updateBitableView', 'deleteBitableView', 'switchBitableView',
    ]
    const tools = [...required, ...optional].map(name => legacyTool(name))
    const skill = {
        name: 'bitable-skill',
        description: '多维表格技能',
        requiredTools: required,
        optionalTools: optional,
        systemPromptFragment: 'You are a Bitable (multi-dimensional table) expert.',
        tags: ['bitable', 'table', 'database', '多维表格', 'plugin'],
    }
    const pluginInstance = new KPlugin<any>({
        name: 'Bitable',
        status: 'active',
        editorExtension: [],
        tools: liftLegacyTools(tools as any, { scope: 'page' }),
        skills: liftLegacySkills([skill] as any),
    })
    const manager = new PluginManager({} as any, [pluginInstance])
    manager.plugins = [pluginInstance]

    const groups = manager.resolvePluginToolGroups({ id: 'stub-editor' } as any)
    const toolProvider = new ToolProvider({ editor: { id: 'stub-editor' } as any })
    for (const group of groups) toolProvider.registerPluginTools(group.tools, group.pluginName)
    const skillProvider = new SkillProvider({})
    skillProvider.registerSkills((manager.resolveSkills?.() ?? []) as any)

    const resolved = skillProvider.getSkill('bitable-skill')
    assert(!!resolved, 'the plugin skill must reach the provider')
    assert.equal(JSON.stringify(resolved!.requiredTools), JSON.stringify(required),
        'the local→wire mapping must not drop a claimed tool name')
    assert.equal(JSON.stringify(resolved!.optionalTools), JSON.stringify(optional))

    registerSkillToolSource(createSkillToolSource(skillProvider, toolProvider))
    const loadSkill = (createSkillTools() as any).load_skill
    const loaded = await loadSkill.execute({ skill: 'bitable' })

    assert(loaded.success, `load_skill('bitable') must work: ${JSON.stringify(loaded)}`)
    assert.equal(loaded.skill, 'bitable-skill')
    assert.equal(loaded.activateTools.length, 15,
        'all 15 bitable tools must arrive, not only the ones the model guessed')
    for (const name of required) {
        const spec = loaded.activateTools.find((item: any) => item.name === name)
        assert(!!spec && !!spec.inputSchema, `${name} must arrive with its schema`)
    }
}

/**
 * plugin-main's page tools are claimed by a skill AND must remain immediately
 * callable: `createPage` is what gives a workbench run a document at all, and
 * `editPage` is what retargets that run to an existing page, so making the model
 * discover either first would stall the main flow.
 */
function checkEntryPointsStayCallableWhenAClaimedByASkill(): void {
    const pageTools = ['createPage', 'editPage', 'listSpaces', 'getSpacePageTree', 'searchPages', 'openPage']
        .map(name => legacyTool(name))
    const pluginInstance = new KPlugin<any>({
        name: 'Main',
        status: 'active',
        editorExtension: [],
        tools: liftLegacyTools(pageTools as any, { scope: 'any' }),
        skills: [{
            name: 'Knowledge Base Pages',
            description: 'pages',
            requiredTools: pageTools.map(tool => tool.name),
            systemPromptFragment: 'How to find and create pages.',
        }] as any,
    })
    const manager = new PluginManager({} as any, [pluginInstance])
    manager.plugins = [pluginInstance]
    const groups = manager.resolvePluginToolGroups({ id: 'stub-editor' } as any)
    const toolProvider = new ToolProvider({ editor: { id: 'stub-editor' } as any })
    for (const group of groups) toolProvider.registerPluginTools(group.tools, group.pluginName)
    const skillProvider = new SkillProvider({})
    skillProvider.registerSkills((manager.resolveSkills?.() ?? []) as any)

    const run = buildAgentRunInputs(collectCapabilityCatalog(skillProvider, toolProvider))
    const advertised = run.tools.map(tool => tool.name)
    for (const name of pageTools.map(tool => tool.name)) {
        assert(advertised.includes(name),
            `${name} is an entry point the run needs on its first step, claimed by a skill or not`)
    }
    // …while the skill still travels, so its prose reaches the model.
    assert(run.skills.some(skill => skill.name === 'Knowledge Base Pages'),
        'the skill framing those tools must ship too')
}

/**
 * The chat's frontend-tool gate must not have to guess whether a tool needs the
 * editor: the declaration already says it (`scope: 'any'` = reads no editor) and
 * it has to survive as far as the tool record + metadata, or an editor-less
 * session's file/studio tools sit unexecuted until the server's tool timeout.
 */
function checkRequiresEditorFollowsDeclaredScope(): void {
    const scoped = [legacyTool('hostFileTool')]
    const pageBound = [legacyTool('documentOnlyTool')]
    const mixed = [legacyTool('mixedScopeTool')]
    const pluginInstance = new KPlugin<any>({
        name: 'Scoped',
        status: 'active',
        editorExtension: [],
        tools: [
            ...liftLegacyTools(scoped as any, { scope: 'any' }),
            ...liftLegacyTools(pageBound as any, { scope: 'page' }),
            ...liftLegacyTools(mixed as any, { scope: ['page', 'workspace'] }),
        ],
    })
    const manager = new PluginManager({} as any, [pluginInstance])
    manager.plugins = [pluginInstance]
    const groups = manager.resolvePluginToolGroups({ id: 'stub-editor' } as any)
    const toolProvider = new ToolProvider({ editor: { id: 'stub-editor' } as any })
    for (const group of groups) toolProvider.registerPluginTools(group.tools, group.pluginName)

    const hostTool = [...groups.flatMap(group => Object.values(group.tools)) as any[]]
        .find(tool => tool && tool.description?.startsWith('hostFileTool')) as any
    assert(hostTool && hostTool.requiresEditor === false,
        'a scope-wide tool must reach the record as editor-independent')
    const docTool = [...groups.flatMap(group => Object.values(group.tools)) as any[]]
        .find(tool => tool && tool.description?.startsWith('documentOnlyTool')) as any
    assert(docTool && docTool.requiresEditor === true,
        'a page-scoped tool must reach the record as editor-bound')

    assert(toolProvider.getToolMetadata('hostFileTool')?.requiresEditor === false,
        'the flag must reach the tool metadata the gate reads')
    assert(toolProvider.getToolMetadata('documentOnlyTool')?.requiresEditor === true,
        'a page-scoped plugin tool must stay editor-bound in the metadata')

    // A declaration that ALSO covers `workspace` is not editor-bound: the run it
    // might serve has no document, so it must be instantiated there and answer
    // for itself rather than park the batch behind an editor that may never come.
    const mixedTool = [...groups.flatMap(group => Object.values(group.tools)) as any[]]
        .find(tool => tool && tool.description?.startsWith('mixedScopeTool')) as any
    assert(mixedTool && mixedTool.requiresEditor === false,
        'page+workspace must not be treated as editor-bound')
    const workspaceTools = [...manager.resolvePluginToolGroups(null)
        .flatMap(group => Object.values(group.tools)) as any[]]
    assert(workspaceTools.some(tool => tool?.description?.startsWith('mixedScopeTool')),
        'a page+workspace tool must still be instantiated where no editor exists')
    assert(!workspaceTools.some(tool => tool?.description?.startsWith('documentOnlyTool')),
        'a page-only tool has nothing to act on where no editor exists')
}

/**
 * A plugin's ARTIFACT capability must survive the same chain as its tools.
 *
 * `artifactFromResult` is the data half (a tool result becomes a renderable
 * artifact) and `agent.artifactRenderers` is the UI half (a kind becomes a side
 * pane). Both have to reach the kernel, or a plugin's results are just JSON in
 * the transcript: nothing on the artifacts shelf, nothing to open, and the
 * `focusArtifact` the model was told about points at a blank pane.
 *
 * This is the contract a Plugin-Studio-authored plugin depends on — the exact
 * shape a plugin like "trigger a Jenkins job, open the build" needs. The check
 * walks the chain the kernel walks: resolve → mapper map (keyed by the name the
 * model calls) → `collectAgentArtifacts` → the `kind:id` key the pane resolves.
 */
function checkPluginArtifactsReachTheKernel(): void {
    const artifactFromResult = (result: any) => (result?.buildId
        ? { kind: 'jenkins-build', id: String(result.buildId), title: result.job }
        : null)
    const jenkins = new KPlugin<any>({
        name: 'Jenkins',
        status: '',
        tools: [{
            name: 'triggerJenkinsJob',
            description: 'Trigger a Jenkins job',
            inputSchema: { type: 'object', properties: {} },
            scope: 'any',
            artifactFromResult,
            create: () => async () => ({ ok: true }),
        }],
        agent: {
            // The plugin owns both halves: the kind it renders, and the card.
            artifactRenderers: [{ kind: 'jenkins-build', render: (() => null) as any }],
            toolRenderers: [{ tool: 'triggerJenkinsJob', render: (() => null) as any }],
        },
    })
    const manager = new PluginManager({} as any, [jenkins])
    manager.plugins = [jenkins]
    const capabilities = manager.resolveAgentCapabilities('workspace')

    const tool = capabilities.tools.find(entry => entry.name === 'triggerJenkinsJob') as any
    assert(Boolean(tool), 'the plugin tool must be resolved')
    assert.equal(tool.wireName, 'triggerJenkinsJob', 'the mapper is keyed by the name the model calls')
    assert.equal(typeof tool.artifactFromResult, 'function', 'artifactFromResult must survive resolution')
    assert(capabilities.artifactRenderers.some(renderer => renderer.kind === 'jenkins-build'),
        'the side pane must be registered by artifact kind')
    assert(capabilities.toolRenderers.some(renderer => renderer.tool === 'triggerJenkinsJob'),
        'the conversation card must be registered by tool')

    const mappers = new Map<string, any>([[tool.wireName, tool.artifactFromResult]])
    const artifacts = collectAgentArtifacts(
        [{ tool: tool.wireName, result: { buildId: 42, job: 'deploy' } }],
        mappers,
    )
    assert.equal(artifacts.length, 1, 'the tool result must become an artifact')
    assert.equal(agentArtifactKey(artifacts[0]), 'jenkins-build:42', 'the pane key is kind:id')
    // A result the mapper rejects contributes nothing (no half-built entry).
    assert.equal(collectAgentArtifacts([{ tool: tool.wireName, result: {} }], mappers).length, 0,
        'an unmappable result must contribute no artifact')
}

/**
 * A page-scoped plugin tool outlives the surface that published its editor: a
 * page switch, a plugin route or a re-opened document destroys that instance
 * while the tool stays advertised for the rest of the run. Reading the closed-over
 * instance inside the executor made real plugins answer "当前没有可用的页面编辑器"
 * and retry, even though the conversation still had an edit target.
 *
 * The call now decides: the conversation's binding names the editor the agent
 * edits right now, and a tool built for a different one gets an instance built
 * for it — per editor, never through shared "current call" state, because one
 * instance serves both the parent and delegated runs.
 */
async function checkPluginToolsFollowTheLiveEditor(): Promise<void> {
    const builtFor: any[] = []
    const liveTool = (name: string) => ({
        name,
        description: `${name} writes the page`,
        inputSchema: { type: 'object', properties: {} },
        scope: 'page' as const,
        create: (ctx: any) => {
            builtFor.push(ctx.editor)
            return async () => ({ editor: ctx.editor })
        },
    })
    const pluginInstance = new KPlugin<any>({
        name: 'Flow',
        status: 'active',
        editorExtension: [],
        tools: [liveTool('writeDiagram')],
    })
    const manager = new PluginManager({} as any, [pluginInstance])
    manager.plugins = [pluginInstance]

    // Liveness is `isDestroyed` alone: a real Tiptap editor's `state` carries no
    // `view` of its own, so a deeper probe would reject every editor that works.
    const published = { id: 'editor-a' }
    const target = { id: 'editor-b' }
    const child = { id: 'editor-child' }
    const toolOf = (editor: any) => {
        builtFor.length = 0
        const groups = manager.resolvePluginToolGroups(editor)
        return groups[0]?.tools?.writeDiagram as any
    }

    // No call context (a host that resolves nothing): the published instance.
    const tool = toolOf(published)
    assert(!!tool, 'the page tool must resolve')
    assert.equal((await tool.execute({}, 'call-1')).editor, published,
        'without a call context the tool keeps the editor it was built with')

    // The binding names the editor the agent edits now: a fresh instance for it.
    const moved = await tool.execute({}, 'call-2', {
        sessionBinding: { getEditor: () => target },
    })
    assert.equal(moved.editor, target, 'a call must act on the editor its binding names')
    assert.equal(builtFor.length, 2, 'the tool is re-instantiated for that editor')

    // …and that instance is reused, not rebuilt per call.
    await tool.execute({}, 'call-3', { sessionBinding: { getEditor: () => target } })
    assert.equal(builtFor.length, 2, 'the per-editor instance must be cached')

    // A delegated run reads ITS OWN editor, never the conversation's.
    const delegated = await tool.execute({}, 'call-4', {
        owner: 'child-a',
        sessionBinding: { getEditor: () => target, getEditorFor: () => child },
    })
    assert.equal(delegated.editor, child, 'a child must not be handed the parent document')

    // A destroyed instance is never used: the live one takes over.
    const dead = { isDestroyed: true }
    const afterDeath = toolOf(dead)
    const revived = await afterDeath.execute({}, 'call-5', {
        sessionBinding: { getEditor: () => target },
    })
    assert.equal(revived.editor, target, 'a destroyed editor must be replaced, not used')
}

/**
 * A plugin tool must survive an editor swap in the provider map.
 *
 * `updateEditor` used to clear every tool, and the re-registration that follows
 * only returns what the CURRENT editor can host — so navigating to a plugin route
 * silently removed the page tools from the execution map while the run had
 * already been told they exist. The model then got an unknown-tool error and
 * suggestions from the remaining, unrelated catalog.
 */
function checkPluginToolsSurviveAnEditorSwap(): void {
    const provider = new ToolProvider({ editor: { id: 'stub-editor' } as any })
    provider.registerPluginTools({
        writeDiagram: {
            description: 'writes the page',
            inputSchema: { type: 'object', properties: {} },
            // eslint-disable-next-line require-await
            execute: async () => ({ ok: true }),
        },
    } as any, 'Flow')
    assert(!!provider.getToolExecutor('writeDiagram'), 'the plugin tool must be registered')

    provider.updateEditor(null)
    assert(!!provider.getToolExecutor('writeDiagram'),
        'a plugin tool must stay executable after the editor goes away: it resolves the editor per call')
}

/**
 * Keeping plugin tools across editor swaps moves the removal responsibility to
 * `syncPluginTools`: it is now the only place that can drop the tools of a
 * plugin that was disabled, uninstalled, or no longer resolves.
 *
 * Without it the catalog would keep advertising a tool nobody can run, and the
 * model would keep calling it for the rest of the session.
 */
function checkDisabledPluginToolsAreDropped(): void {
    const provider = new ToolProvider({ editor: { id: 'stub-editor' } as any })
    const writePage = {
        description: 'writes the page',
        inputSchema: { type: 'object', properties: {} },
        // eslint-disable-next-line require-await
        execute: async () => ({ ok: true }),
    }
    provider.syncPluginTools([
        { pluginName: 'Flow', tools: { writeDiagram: writePage } },
        { pluginName: 'Other', tools: { doSomethingElse: writePage } },
    ])
    assert(!!provider.getToolExecutor('doSomethingElse'), 'both plugins register on the first sync')

    // `Other` is gone from the resolution (disabled / uninstalled / failed).
    provider.syncPluginTools([{ pluginName: 'Flow', tools: { writeDiagram: writePage } }])
    assert(!!provider.getToolExecutor('writeDiagram'), 'a still-contributing tool must survive the sync')
    assert(!provider.getToolExecutor('doSomethingElse'),
        'a tool no plugin contributes any more must leave the execution map')
    assert(!provider.getToolMetadata('doSomethingElse'),
        'and its metadata must go with it, or `needsEditor` keeps gating a tool that cannot run')

    provider.syncPluginTools([])
    assert(!provider.getToolExecutor('writeDiagram'), 'an empty resolution drops every plugin tool')
    assert(!!provider.getToolExecutor('load_skill'),
        'while the built-ins, which no plugin owns, are untouched')

    // A plugin may shadow a built-in by name (one slot in the map). Dropping the
    // plugin must restore that built-in, not leave the slot empty.
    provider.syncPluginTools([{ pluginName: 'Shadow', tools: { load_skill: writePage } }])
    assert.equal(provider.getToolMetadata('load_skill')?.source, 'plugin',
        'the plugin takes over the name')
    provider.syncPluginTools([])
    assert(!!provider.getToolExecutor('load_skill'), 'the shadowed built-in must be restored')
    assert(provider.getToolMetadata('load_skill')?.source !== 'plugin',
        'and its own metadata with it')
}

async function main(): Promise<void> {
    checkSchemasAreWithheldButNamed()
    checkRequiresEditorFollowsDeclaredScope()
    checkPluginToolsFollowTheLiveEditor()
    checkPluginToolsSurviveAnEditorSwap()
    checkDisabledPluginToolsAreDropped()
    checkDiscoveryCanBeTurnedOff()
    checkDefaultSkillToolsStayAdvertised()
    checkEntryPointsStayCallableWhenAClaimedByASkill()
    checkNestedAgentFormStillLoads()
    checkCeilingKeepsEntryPoints()
    checkPluginArtifactsReachTheKernel()
    await checkWorkspaceScopeKeepsTheDiscoveryPath()
    await checkLoadSkillDeliversAWholeCapability()
    await checkRealBitableDeclarationResolves()
    console.log('plugin tool catalogue checks passed')
}

main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
})
