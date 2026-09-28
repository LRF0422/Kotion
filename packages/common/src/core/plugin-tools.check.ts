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
 * callable: `createPage` is what gives a workbench run a document at all, so
 * making the model discover it first would stall the main flow.
 */
function checkEntryPointsStayCallableWhenAClaimedByASkill(): void {
    const pageTools = ['createPage', 'listSpaces', 'getSpacePageTree', 'searchPages', 'openPage']
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

async function main(): Promise<void> {
    checkSchemasAreWithheldButNamed()
    checkDiscoveryCanBeTurnedOff()
    checkDefaultSkillToolsStayAdvertised()
    checkEntryPointsStayCallableWhenAClaimedByASkill()
    checkNestedAgentFormStillLoads()
    checkCeilingKeepsEntryPoints()
    await checkWorkspaceScopeKeepsTheDiscoveryPath()
    await checkLoadSkillDeliversAWholeCapability()
    await checkRealBitableDeclarationResolves()
    console.log('plugin tool catalogue checks passed')
}

main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
})
