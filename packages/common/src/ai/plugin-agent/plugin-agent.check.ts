/**
 * Runtime checks for the agent contribution contract (M0).
 *
 * Pure logic only — no React, no DOM, no live PluginManager. Covers
 * namespacing, scope selection, the legacy adapter, the core implementation
 * registry, catalog filtering, artifact collection and the context whitelist.
 */

import { strict as assert } from 'node:assert'
import {
    agentNamespace,
    agentScopeMatches,
    clearAgentContextWhitelist,
    clearAgentToolImplementations,
    filterContributionByScope,
    isAgentContextAllowed,
    liftLegacySkills,
    liftLegacyTools,
    setAgentContextWhitelist,
    getAgentToolImplementation,
    getAgentToolImplementations,
    normalizeAgentScopes,
    registerAgentToolImplementations,
    resolveAgentToolNames,
    sanitizeNamespaceSegment,
    toAgentWireName,
    type AgentContribution,
    type AgentToolContext,
} from './index'
import { filterAgentCatalog } from '../kernel/filter-catalog'
import { collectCapabilityCatalog } from '../capabilities/CapabilityCatalog'
import { builtinSkills } from '../skills/built-in'
import { BUILTIN_TOOL_METADATA } from '../discovery/tool-metadata'
import { buildAgentRunInputs } from '../capabilities/catalog-to-run-input'
import { agentArtifactKey, collectAgentArtifacts } from '../kernel/agent-artifact-collect'

function ctx(editor?: any, scope: AgentToolContext['scope'] = 'workspace'): AgentToolContext {
    return { scope, editor, resolveService: () => undefined }
}

function checkNamespaceSanitizes(): void {
    // Hyphens are legal in function names, so the sanitizer preserves them.
    assert.equal(sanitizeNamespaceSegment('@kn/plugin-studio'), 'kn_plugin-studio')
    assert.equal(sanitizeNamespaceSegment('PluginStudio'), 'pluginstudio')
    assert.equal(sanitizeNamespaceSegment('  ---  '), 'plugin')
    assert.equal(sanitizeNamespaceSegment(''), 'plugin')
    assert.equal(agentNamespace('@kn/plugin-studio'), 'kn_plugin-studio')
}

function checkWireName(): void {
    // Namespacing was removed: a plugin's tool reaches the model under its bare
    // local name, whatever plugin key is passed.
    assert.equal(toAgentWireName('@kn/plugin-studio', 'listPluginProjects'), 'listPluginProjects')
    assert.equal(toAgentWireName('chart-plugin', 'insertChart'), 'insertChart')
    // The provider's function-name limit still applies.
    const longName = toAgentWireName('ignored', 'x'.repeat(80))
    assert.equal(longName.length, 64, 'a tool name must respect the provider limit')
}

function checkScopes(): void {
    assert.deepEqual(normalizeAgentScopes(undefined), ['any'])
    assert.deepEqual(normalizeAgentScopes('page'), ['page'])
    assert.equal(agentScopeMatches(undefined, 'workspace'), true, 'unscoped = any')
    assert.equal(agentScopeMatches('page', 'workspace'), false)
    assert.equal(agentScopeMatches(['page', 'space'], 'space'), true)
    assert.equal(agentScopeMatches('workspace', 'workspace'), true)
}

function checkLegacyAdapter(): void {
    const ext: any = {
        extendsion: [],
        name: 'legacy-tools',
        tools: [
            {
                name: 'legacyDoThing',
                description: 'Legacy thing',
                inputSchema: { type: 'object' },
                readOnly: true,
                execute: (editor: any) => (params: any) => ({ editorSeen: editor, params }),
            },
        ],
        skills: [
            {
                name: 'Legacy Skill',
                description: 'legacy',
                requiredTools: ['legacyDoThing'],
            },
        ],
    }

    // The migration helper — legacy editor-bound tools lifted into the agent
    // contract. This is what a plugin moving to `agent.agents[]` calls.
    const contribution: AgentContribution = {
        tools: liftLegacyTools(ext.tools, { scope: 'page' }),
        skills: liftLegacySkills(ext.skills),
    }
    assert.equal(contribution.tools?.length, 1)
    const tool = contribution.tools![0]
    // The declared name IS the model-facing name — nothing prefixes it.
    assert.equal(tool.name, 'legacyDoThing')
    assert.equal(tool.namespace, undefined, 'namespacing was removed from the contract')
    // Legacy extension tools are DOCUMENT tools: page scope only, so a
    // workspace run can never advertise one with an undefined editor.
    assert.deepEqual(normalizeAgentScopes(tool.scope), ['page'])
    assert.equal(filterContributionByScope(contribution, 'workspace').tools?.length, 0)
    assert.equal(filterContributionByScope(contribution, 'page').tools?.length, 1)

    // Execution still receives the editor through the context.
    const executor = tool.create(ctx({ id: 7 }))
    assert.deepEqual(executor({ q: 1 }), { editorSeen: { id: 7 }, params: { q: 1 } })

    // A factory that needs an editor fails when none is published, which is
    // exactly how the resolver skips editor-bound tools in workspace scope.
    const noEditor = {
        tools: liftLegacyTools([
            {
                name: 'needsEditor',
                description: 'needs editor',
                inputSchema: {},
                execute: (editor: any) => {
                    if (!editor) throw new Error('no editor')
                    return () => 1
                },
            },
        ], { scope: 'page' }),
    }
    assert.throws(() => noEditor.tools![0].create(ctx(undefined)))

    // A scope-wide group is editor-OPTIONAL: an editor-free connector (zhihu)
    // must instantiate in a workspace run, otherwise its agent would advertise
    // tool names no run can execute. The factory still receives whatever editor
    // the context has — here, none.
    const editorFree = liftLegacyTools([
        {
            name: 'searchSomething',
            description: 'pure network tool',
            inputSchema: {},
            execute: (editor: any) => (params: any) => ({ editorSeen: editor, params }),
        },
    ], { scope: 'any' })
    assert.deepEqual(normalizeAgentScopes(editorFree[0].scope), ['any'])
    const freeExecutor = editorFree[0].create(ctx(undefined))
    assert.deepEqual(freeExecutor({ q: 2 }), { editorSeen: undefined, params: { q: 2 } })

    // An explicit override still protects a mis-declared scope.
    assert.throws(() => liftLegacyTools([
        {
            name: 'secretlyNeedsEditor',
            description: 'mis-declared',
            inputSchema: {},
            execute: () => () => 1,
        },
    ], { scope: 'any', requiresEditor: true })[0].create(ctx(undefined)))

    assert.equal(contribution.skills?.[0].name, 'Legacy Skill')
    assert.deepEqual(contribution.skills?.[0].requiredTools, ['legacyDoThing'])
}

function checkScopeFilter(): void {
    const make = (name: string, scope: any) => ({
        name, description: '', inputSchema: {}, scope, create: () => () => name,
    })
    const contribution: AgentContribution = {
        tools: [make('ws', 'workspace'), make('pg', 'page'), make('any', 'any'), make('unscoped', undefined)],
        context: [{ id: 'c', scope: 'workspace', load: () => ({}) }],
        actions: [{ id: 'a', label: 'A', prompt: 'p', scope: 'page' }],
    }

    const workspace = filterContributionByScope(contribution, 'workspace')
    assert.deepEqual(workspace.tools?.map(t => t.name), ['ws', 'any', 'unscoped'])
    assert.equal(workspace.context?.length, 1)
    assert.equal(workspace.actions?.length, 0)

    const page = filterContributionByScope(contribution, 'page')
    assert.deepEqual(page.tools?.map(t => t.name), ['pg', 'any', 'unscoped'])
    assert.equal(page.actions?.length, 1)
    assert.equal(page.context?.length, 0)
}

function checkRegistry(): void {
    clearAgentToolImplementations()
    registerAgentToolImplementations([
        {
            name: 'searchPages',
            description: 'search',
            inputSchema: { type: 'object' },
            readOnly: true,
            scope: 'workspace',
            create: () => (params: any) => ({ params }),
        },
        // Invalid entries are ignored rather than crashing the host.
        undefined as any,
    ])
    assert.equal(getAgentToolImplementation('searchPages')?.readOnly, true)
    assert.deepEqual(getAgentToolImplementations().map(i => i.name), ['searchPages'])

    // Registration replaces a same-named implementation.
    registerAgentToolImplementations([
        { name: 'searchPages', description: 'v2', inputSchema: {}, create: () => () => 2 },
    ])
    assert.equal(getAgentToolImplementation('searchPages')?.description, 'v2')

    clearAgentToolImplementations()
    assert.equal(getAgentToolImplementation('searchPages'), undefined)
    assert.deepEqual(getAgentToolImplementations(), [])
}

function checkToolNameResolution(): void {
    const localToWire = new Map([['searchPages', 'plugin-main__searchPages']])
    assert.deepEqual(
        resolveAgentToolNames(['searchPages', 'other__tool'], localToWire),
        ['plugin-main__searchPages', 'other__tool'],
    )
    assert.equal(resolveAgentToolNames(undefined, localToWire), undefined)
    assert.deepEqual(resolveAgentToolNames([], localToWire), [])
}

function checkCatalogFilter(): void {
    const fn = (name: string) => ({ type: 'function' as const, function: { name, description: '', parameters: {} } })
    const catalog: any = {
        version: 'abc',
        tools: [fn('getDocumentStructure'), fn('plugin-office__insertSpreadsheet')],
        skills: [
            {
                name: 'Doc Skill', description: '', source: 'builtin',
                requiredTools: ['getDocumentStructure'], tools: [fn('getDocumentStructure')],
            },
            {
                name: 'Office Skill', description: '', source: 'plugin',
                requiredTools: ['plugin-office__insertSpreadsheet'], tools: [fn('plugin-office__insertSpreadsheet')],
            },
            // A prompt-only skill (no tool requirements) survives every scope.
            { name: 'Prompt Only', description: '', source: 'builtin', requiredTools: [] },
        ],
    }

    const filtered = filterAgentCatalog(catalog, name => name.startsWith('plugin-'))
    assert.deepEqual(filtered.tools.map((t: any) => t.function.name), ['plugin-office__insertSpreadsheet'])
    assert.deepEqual(filtered.skills.map((s: any) => s.name), ['Office Skill', 'Prompt Only'])
    assert.deepEqual(filtered.skills[0].requiredTools, ['plugin-office__insertSpreadsheet'])
    // Distinct, stable version so the backend cache cannot serve the unfiltered set.
    assert.equal(filtered.version, 'abc:f')
}

function checkArtifactCollection(): void {
    const page = (id: string, title: string) => ({ kind: 'page', id, title })
    const mappers = new Map<string, any>([
        ['plugin-main__createPage', (result: any) => (result?.pageId ? page(String(result.pageId), result.title) : null)],
        ['plugin-main__openPageSide', (result: any) => (result?.pageId ? page(String(result.pageId), result.title) : null)],
    ])

    const artifacts = collectAgentArtifacts([
        { tool: 'plugin-main__createPage', result: { pageId: 'p1', title: 'A' } },
        { tool: 'web_search', result: { results: [] } },              // no mapper → ignored
        { tool: 'plugin-main__createPage', result: { pageId: 'p2', title: 'B' } },
        { tool: 'plugin-main__openPageSide', result: { pageId: 'p1', title: 'A (renamed)' } }, // dedupe
        { tool: 'plugin-main__createPage', result: { success: false } }, // mapper returns null
    ], mappers)

    // Newest first: p2 was created later, p1 keeps its slot on re-touch.
    assert.deepEqual(artifacts.map(a => agentArtifactKey(a)), ['page:p2', 'page:p1'])
    // Re-touching keeps the latest value and one slot.
    assert.equal(artifacts.find(a => a.id === 'p1')?.title, 'A (renamed)')
    assert.deepEqual(collectAgentArtifacts([], mappers), [])
}

/**
 * The declared tool names of a skill must survive the catalog → run-input
 * mapping. They are what lets the backend name each skill's own tools under its
 * prompt fragment: a fragment describes steps in prose without spelling function
 * names, so silently dropping the names puts the model back to guessing which
 * function the prose means.
 */
function checkSkillToolNamesTravel(): void {
    const catalog: any = {
        version: 'v',
        tools: [],
        skills: [{
            name: 'document-write',
            description: '',
            source: 'builtin',
            // Declared names may repeat or carry padding; both are normalised away.
            requiredTools: ['replaceContent', ' insertNear ', 'replaceContent', ''],
            optionalTools: ['write', 'write'],
            systemPromptFragment: 'You can find-and-replace content.',
        }],
    }

    const { skills } = buildAgentRunInputs(catalog)
    assert.deepEqual(skills[0].requiredTools, ['replaceContent', 'insertNear'])
    assert.deepEqual(skills[0].optionalTools, ['write'])
    // The fragment travels verbatim except for the client's own name label, which is
    // what lets the model ask for this skill by name.
    assert.equal(skills[0].systemPromptFragment,
        '【技能名】document-write\n\nYou can find-and-replace content.')
    // No per-skill schema envelope is produced any more: the tools travel in
    // tools[] like every other tool.
    assert.equal(skills[0].tools, undefined)

    // No declared names → the fields stay absent, so an unchanged catalog keeps
    // producing a byte-identical request payload.
    const bare = buildAgentRunInputs({
        ...catalog,
        skills: [{ name: 'x', description: '', source: 'builtin', requiredTools: [] }],
    } as any)
    assert.equal(bare.skills[0].requiredTools, undefined)
    assert.equal(bare.skills[0].optionalTools, undefined)
}

/**
 * The page-editing baseline is never withheld; only non-core capabilities are.
 *
 * Two regressions are pinned here. (1) The collector is a faithful view: it
 * withholds nothing, and core-ness is decided by NAME, not by the metadata
 * `source` a plugin re-registration rewrote. (2) Discovery applies to a plugin's
 * or an installed skill's tools only — a built-in editor tool a skill's fragment
 * names still ships with its schema, because the model cannot reliably call a
 * function it was never shown declared. A NON-core tool a skill claims is named by
 * the skill and delivered by `load_skill` on demand.
 */
function checkEditingBaselineIsNeverWithheld(): void {
    const tool = (name: string, category: string, source: 'builtin' | 'plugin' = 'builtin') => ({
        name,
        category,
        description: `${name} description`,
        priority: 5,
        tags: [],
        loaded: true,
        source,
    })
    const executable = (name: string, inputSchema: any, readOnly?: boolean) => ({
        description: `${name} description`,
        inputSchema,
        ...(readOnly ? { readOnly } : {}),
        execute: async () => ({ ok: true }),
    })

    const toolProvider: any = {
        getAllTools: () => ({
            // Built-in editing tools, named by the built-in skill below: still
            // advertised — the page-editing baseline never rides discovery.
            replaceContent: executable('replaceContent', { type: 'object', properties: { x: { type: 'string' } } }),
            insertNear: executable('insertNear', { type: 'object', properties: {} }),
            // A NON-core plugin tool, claimed by a plugin skill: this is exactly
            // what discovery withholds and `load_skill` delivers.
            insertChart: executable('insertChart', { type: 'object', properties: {} }),
            // A CORE tool whose metadata a plugin re-registered (plugin-main's
            // agent.include does exactly this): `source` says plugin, the NAME is
            // what makes it core, so it must never be withheld or dropped.
            createPage: executable('createPage', { type: 'object', properties: {} }),
            // Metadata without an executable must never be advertised.
            ghostTool: undefined,
        }),
        getAllMetadata: () => [
            tool('replaceContent', 'document-write'),
            tool('insertNear', 'document-write'),
            tool('insertChart', 'plugin', 'plugin'),
            tool('createPage', 'plugin', 'plugin'),
            tool('ghostTool', 'plugin', 'plugin'),
        ],
        getToolMetadata: (name: string) =>
            name === 'replaceContent' || name === 'insertNear'
                ? tool(name, 'document-write')
                : tool(name, 'plugin', 'plugin'),
    }
    const skillProvider: any = {
        getAllSkills: () => [
            {
                name: 'chart-ops',
                description: '',
                source: 'plugin',
                requiredTools: ['insertChart'],
                systemPromptFragment: 'insert charts',
            },
            {
                name: 'document-write',
                description: '',
                source: 'builtin',
                requiredTools: ['replaceContent', 'insertNear'],
                systemPromptFragment: 'find-and-replace content',
            },
        ],
    }

    const catalog: any = collectCapabilityCatalog(skillProvider, toolProvider)
    const names = catalog.tools.map((t: any) => t.function.name)
    // The collector is a faithful view: it withholds nothing. The discovery policy
    // is applied when the run input is built, on the scope-filtered catalogue — see
    // the assertions on `runInput` below.
    assert.deepEqual(names, ['createPage', 'insertChart', 'insertNear', 'replaceContent'])
    // Core is decided by NAME, not by the (plugin-rewritten) metadata source.
    const createPage = catalog.tools.find((t: any) => t.function.name === 'createPage')
    assert.equal(createPage.core, true, 'a re-registered core tool is still core')
    assert.equal(catalog.tools.find((t: any) => t.function.name === 'insertChart').core, false)
    // The client still holds the executable — and its schema — which is exactly what
    // `load_skill` hands over and what the client runs once the model asks.
    const replaceExecutable = toolProvider.getAllTools().replaceContent
    assert.deepEqual(replaceExecutable.inputSchema, { type: 'object', properties: { x: { type: 'string' } } })
    // No per-skill schema envelope either: the skill carries names, not payloads.
    const writeSkill = catalog.skills.find((s: any) => s.name === 'document-write')
    const chartSkill = catalog.skills.find((s: any) => s.name === 'chart-ops')
    assert.equal(writeSkill.tools, undefined)
    assert.deepEqual(writeSkill.requiredTools, ['replaceContent', 'insertNear'])
    assert.deepEqual(chartSkill.requiredTools, ['insertChart'])

    // The catalog itself defers nothing: the budget is applied to the run input.
    const runInput = buildAgentRunInputs(catalog)
    // The editing baseline ships IN FULL even though a built-in skill names it:
    // read → write → format is callable on the first step, with no discovery round
    // trip to learn the schema.
    assert.deepEqual(runInput.tools.map(t => t.name), ['createPage', 'insertNear', 'replaceContent'])
    // A NON-core capability is the one that rides discovery: named by its skill,
    // delivered by `load_skill`, and never parked in the deferred directory.
    assert.ok(!runInput.tools.some(t => t.name === 'insertChart'),
        'a plugin tool a skill names must not ride in every request')
    assert.deepEqual(runInput.deferredTools, [])
    // Withheld, never hidden: the skill still declares the name it owns, which is
    // what the model reads to know it can ask for it.
    assert.deepEqual(
        runInput.skills.find(s => s.name === 'chart-ops')!.requiredTools, ['insertChart'])
    // The model reaches a skill's tools by NAME, so the name has to reach the model:
    // the prompt only carries the fragment, and an unlabelled fragment made it
    // invent names ("插件开发台") and never find the capability.
    for (const skill of runInput.skills) {
        if (!skill.systemPromptFragment) continue
        assert.ok(skill.systemPromptFragment.startsWith(`【技能名】${skill.name}`),
            'a shipped skill fragment must open with the name load_skill expects')
    }
}

/**
 * The provider's tool ceiling: core tools are never the ones dropped, plugin
 * tools are ranked by whether the prompt talks about them, and the surplus stays
 * CALLABLE (schema returned with the first call) instead of vanishing.
 */
function checkToolBudgetOverflow(): void {
    const fn = (name: string, extra: Record<string, unknown> = {}) => ({
        type: 'function' as const,
        function: { name, description: '', parameters: { type: 'object', properties: {} } },
        ...extra,
    })
    const names = (specs: any[]) => specs.map(s => s.name).sort()

    const catalog: any = {
        version: 'v',
        // Sorted by name, as the collector emits it.
        tools: [
            fn('deleteBlocks', { core: true, priority: 9 }),
            fn('insertAtBlockId', { core: true, priority: 10 }),
            fn('alphaPluginTool', { core: false, priority: 5 }),
            fn('describedPluginTool', { core: false, priority: 5 }),
            fn('zetaPluginTool', { core: false, priority: 5 }),
        ],
        skills: [{
            name: 'chart',
            description: '',
            source: 'plugin',
            requiredTools: ['describedPluginTool'],
            systemPromptFragment: 'You can insert described charts.',
        }],
        toolBudget: 3,
        // Isolate the ceiling: discovery would withhold the skill-owned tool first,
        // which is a different policy with its own assertions.
        skillDiscovery: false,
    }

    const { tools, deferredTools } = buildAgentRunInputs(catalog)
    // Both core tools fit and are ranked in first, then the one plugin tool the
    // prompt fragment names — not the alphabetically first plugin tool.
    assert.deepEqual(names(tools), ['deleteBlocks', 'describedPluginTool', 'insertAtBlockId'])
    assert.deepEqual(names(deferredTools), ['alphaPluginTool', 'zetaPluginTool'])
    // An overflowed tool keeps its schema: the backend needs it to route the call
    // and to return it with the first result.
    assert.deepEqual(deferredTools[0].inputSchema, { type: 'object', properties: {} })

    // A budget smaller than the core set must not hide a core tool.
    const squeezed: any = { ...catalog, toolBudget: 1 }
    const squeezedRun = buildAgentRunInputs(squeezed)
    assert.deepEqual(names(squeezedRun.tools), ['deleteBlocks', 'insertAtBlockId'])
    assert.deepEqual(names(squeezedRun.deferredTools),
        ['alphaPluginTool', 'describedPluginTool', 'zetaPluginTool'])

    // 0 = unlimited: nothing is deferred.
    const unlimited: any = { ...catalog, toolBudget: 0 }
    const unlimitedRun = buildAgentRunInputs(unlimited)
    assert.equal(unlimitedRun.tools.length, 5)
    assert.deepEqual(unlimitedRun.deferredTools, [])

    // No budget on the catalog → the default is NO ceiling: nothing is deferred,
    // however large the catalog is. Hiding a tool is a last resort for a provider
    // that hard-caps `tools`, never a default policy.
    const defaulted: any = { ...catalog }
    delete defaulted.toolBudget
    assert.deepEqual(buildAgentRunInputs(defaulted).deferredTools, [])

    const big: any = {
        ...catalog,
        tools: Array.from({ length: 400 }, (_, i) => fn(`pluginTool${i}`, { core: false, priority: 5 })),
    }
    delete big.toolBudget
    const bigRun = buildAgentRunInputs(big)
    assert.equal(bigRun.tools.length, 400, 'the default must advertise every callable tool')
    assert.deepEqual(bigRun.deferredTools, [])

    // A partially advertised multi-tool capability is barely usable, so the
    // ceiling must not be imposed by default: bitable's read/write tools have to
    // survive alongside its insert tool unless a host explicitly asks for a cap.
    const bitable: any = {
        version: 'v',
        tools: [
            fn('insertBitable', { core: false, priority: 9 }),
            fn('getBitableList', { core: false, priority: 5 }),
            fn('addBitableRecord', { core: false, priority: 5 }),
            fn('updateBitableRecord', { core: false, priority: 5 }),
            fn('deleteBitableRecords', { core: false, priority: 5 }),
        ],
        skills: [],
    }
    const bitableRun = buildAgentRunInputs(bitable)
    assert.deepEqual(names(bitableRun.tools),
        ['addBitableRecord', 'deleteBitableRecords', 'getBitableList', 'insertBitable', 'updateBitableRecord'],
        'a plugin multi-tool capability must arrive whole by default')

    // Declared priority outranks the alphabetical fallback: a document-insertion
    // tool (priority 9) must win the last slot over a get*/list* tool that would
    // otherwise sort first. Losing an insert tool makes the request impossible;
    // losing a query tool only means the model calls it from the directory.
    const priorityCatalog: any = {
        ...catalog,
        toolBudget: 3,
        skillDiscovery: false,
        skills: [{ name: 'chart', description: '', source: 'plugin', requiredTools: [] }],
        tools: [
            fn('insertAtBlockId', { core: true, priority: 10 }),
            fn('getChartTemplates', { core: false, priority: 3 }),
            fn('insertChart', { core: false, priority: 9 }),
            fn('listCharts', { core: false, priority: 4 }),
        ],
    }
    const priorityRun = buildAgentRunInputs(priorityCatalog)
    assert.deepEqual(names(priorityRun.tools),
        ['insertAtBlockId', 'insertChart', 'listCharts'])
    assert.deepEqual(names(priorityRun.deferredTools), ['getChartTemplates'])}

/**
 * A built-in skill may only claim tools that exist.
 *
 * The claim is what the backend renders as "本技能可直接调用的工具: …" under the
 * skill's fragment — the join between prose and function names that the model
 * relies on. A typo (or a tool renamed on the tool side) silently drops that name
 * from the join, and the model is back to guessing which function the prose
 * means.
 */
function checkBuiltinSkillToolNamesExist(): void {
    const known = new Set(BUILTIN_TOOL_METADATA.map(meta => meta.name))
    const unknown: string[] = []
    for (const skill of builtinSkills) {
        for (const name of [...(skill.requiredTools ?? []), ...(skill.optionalTools ?? [])]) {
            if (!known.has(name)) unknown.push(`${skill.name} → ${name}`)
        }
    }
    assert.deepEqual(unknown, [], 'built-in skills must only claim real tools')
    // The editor domain policy must claim the core editing path, otherwise the
    // client's own document rules would arrive without any tool names attached.
    const policy = builtinSkills.find(skill => skill.name === 'document-editing')
    assert.ok(policy, 'the editor domain policy skill must be registered')
    for (const name of ['getDocumentStructure', 'replaceBlockById', 'insertAtBlockId', 'applyEdits']) {
        assert.ok(policy!.requiredTools.includes(name), `document-editing must require ${name}`)
    }

    // The backend is domain-blind, so this fragment is the WHOLE editor prompt:
    // it has to stay complete. A condensed copy loses rules silently — the last
    // one (rule 7, "never end a turn with an unexecuted plan") is the canary.
    const fragment = policy!.systemPromptFragment ?? ''
    for (const section of ['# CRITICAL RULES', '# DOCUMENT STRUCTURE', '# WORKFLOW']) {
        assert.ok(fragment.includes(section),
            `the editor prompt must keep its ${section} section`)
    }
    assert.ok(fragment.includes('Never end a turn with an unexecuted plan'),
        'the editor prompt must keep every critical rule')
    assert.ok(fragment.includes("position: 'before'|'after'"),
        'the editor prompt must keep the insertAtBlockId argument shape')
    assert.ok(fragment.includes('buildLayout'),
        'the editor prompt must keep the whole-page layout guidance')
}

function checkContextWhitelist(): void {
    // Deny by default: declaring a provider is not authorizing it.
    clearAgentContextWhitelist()
    assert.equal(isAgentContextAllowed('page-selection'), false)
    assert.equal(isAgentContextAllowed(undefined), false)
    assert.equal(isAgentContextAllowed(''), false)

    setAgentContextWhitelist(['page-selection', '  workspace-outline  '])
    assert.equal(isAgentContextAllowed('page-selection'), true)
    // Ids are trimmed, so a padded declaration still matches.
    assert.equal(isAgentContextAllowed('workspace-outline'), true)
    assert.equal(isAgentContextAllowed('open-tabs'), false)

    // An empty authorization list is still deny-all, never allow-all.
    setAgentContextWhitelist([])
    assert.equal(isAgentContextAllowed('page-selection'), false)

    setAgentContextWhitelist(null)
    assert.equal(isAgentContextAllowed('page-selection'), false)
}

function main(): void {
    checkNamespaceSanitizes()
    checkWireName()
    checkScopes()
    checkLegacyAdapter()
    checkScopeFilter()
    checkRegistry()
    checkToolNameResolution()
    checkCatalogFilter()
    checkSkillToolNamesTravel()
    checkEditingBaselineIsNeverWithheld()
    checkToolBudgetOverflow()
    checkBuiltinSkillToolNamesExist()
    checkArtifactCollection()
    checkContextWhitelist()
    console.log('plugin-agent checks passed')
}

main()
