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
    agent: {
        tools: liftLegacyTools(tools as any, { scope: 'page' }),
        skills: liftLegacySkills([{
            name: `${name.toLowerCase()}-ops`,
            description: name,
            requiredTools: tools.map(tool => tool.name),
            // A real plugin skill describes its tools; that fragment is what lets
            // the catalog withhold the schemas and name the tools instead.
            systemPromptFragment: `You can use the ${name} tools listed for this skill.`,
        }] as any),
    },
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
        ...createSkillTools(),
    })])

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

const providers = buildProviders()

function loadSkillTool() {
    registerSkillToolSource(createSkillToolSource(providers.skillProvider, providers.toolProvider))
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
    // The essential editing path and the discovery tool itself stay advertised, so
    // a run can always read, write, ask — and ask for more.
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

async function main(): Promise<void> {
    checkSchemasAreWithheldButNamed()
    checkDiscoveryCanBeTurnedOff()
    checkCeilingKeepsEntryPoints()
    await checkLoadSkillDeliversAWholeCapability()
    console.log('plugin tool catalogue checks passed')
}

main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
})
