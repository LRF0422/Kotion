/**
 * Runtime checks for the plugin-agent contribution contract (M0).
 *
 * Pure logic only — no React, no DOM, no live PluginManager. Covers
 * namespacing, scope selection, the legacy adapter and the core
 * implementation registry.
 */

import { strict as assert } from 'node:assert'
import {
    agentNamespace,
    agentScopeMatches,
    clearAgentToolImplementations,
    filterContributionByScope,
    getAgentToolImplementation,
    getAgentToolImplementations,
    legacyExtensionToAgentContribution,
    normalizeAgentScopes,
    registerAgentToolImplementations,
    resolveAgentToolNames,
    sanitizeNamespaceSegment,
    toAgentWireName,
    type AgentContribution,
    type AgentToolContext,
} from './index'
import { filterAgentCatalog } from '../kernel/filter-catalog'
import { agentArtifactKey, collectAgentArtifacts } from '../kernel/agent-artifact-collect'
import { describePluginAgents } from '../kernel/plugin-agents'

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
    const wire = toAgentWireName('@kn/plugin-studio', 'listPluginProjects')
    assert.equal(wire, 'kn_plugin-studio__listPluginProjects')
    assert.ok(wire.length <= 64)
    // Long namespaces still yield a valid function name (<= 64 chars).
    const longWire = toAgentWireName('a'.repeat(80), 'x'.repeat(80))
    assert.ok(longWire.length <= 64, 'wire name must respect the provider limit')
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

    const contribution = legacyExtensionToAgentContribution(ext)
    assert.equal(contribution.tools?.length, 1)
    const tool = contribution.tools![0]
    assert.equal(tool.name, 'legacyDoThing')
    // Legacy names must NOT change: the model may already know them.
    assert.equal(tool.namespace, false)
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
    const noEditor = legacyExtensionToAgentContribution({
        extendsion: [],
        name: 'editor-bound',
        tools: [
            {
                name: 'needsEditor',
                description: 'needs editor',
                inputSchema: {},
                execute: (editor: any) => {
                    if (!editor) throw new Error('no editor')
                    return () => 1
                },
            },
        ],
    } as any)
    assert.throws(() => noEditor.tools![0].create(ctx(undefined)))

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
        agents: [
            { id: 'page-agent', name: 'Page Agent', description: 'needs an editor', scope: 'page' },
            { id: 'always-agent', name: 'Always Agent', description: 'always offered' },
        ],
    }

    const workspace = filterContributionByScope(contribution, 'workspace')
    assert.deepEqual(workspace.tools?.map(t => t.name), ['ws', 'any', 'unscoped'])
    assert.equal(workspace.context?.length, 1)
    assert.equal(workspace.actions?.length, 0)

    const page = filterContributionByScope(contribution, 'page')
    assert.deepEqual(page.tools?.map(t => t.name), ['pg', 'any', 'unscoped'])
    assert.equal(page.actions?.length, 1)
    assert.equal(page.context?.length, 0)

    // Plugin agents are scope-gated like everything else: a page-scoped agent
    // must not be offered to a workspace run (hybrid delegation model).
    assert.deepEqual(workspace.agents?.map(a => a.id), ['always-agent'])
    assert.deepEqual(page.agents?.map(a => a.id), ['page-agent', 'always-agent'])
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

function checkAgentDirectory(): void {
    assert.equal(describePluginAgents(undefined), undefined)
    assert.equal(describePluginAgents([]), undefined)

    const note = describePluginAgents([{
        id: 'kn_plugin-main__page-ops',
        name: '页面操作',
        description: '创建/重命名/移动页面',
        systemPrompt: '你是页面操作员。',
        toolNames: ['kn_plugin-main__createPage'],
        pluginName: 'Basic plugin',
        pluginKey: '@kn/plugin-main',
    }] as any)!

    assert.ok(note.includes('可委派的插件 Agent'))
    assert.ok(note.includes('kn_plugin-main__page-ops'))
    assert.ok(note.includes('页面操作'))
    assert.ok(note.includes('systemPrompt'))
    assert.ok(note.includes('你是页面操作员。'))
    assert.ok(note.includes('kn_plugin-main__createPage'))
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
    checkArtifactCollection()
    checkAgentDirectory()
    console.log('plugin-agent checks passed')
}

main()
