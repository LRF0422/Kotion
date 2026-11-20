/**
 * Runtime checks for the custom-agent pure logic (no React, no storage).
 */

import { strict as assert } from 'node:assert'
import {
    buildCustomAgentNote,
    customAgentAllowedToolNames,
    customAgentCapabilities,
    filterCatalogForCustomAgent,
    findCustomAgent,
    normalizeCustomAgentCapabilities,
    normalizeCustomAgents,
    normalizeSelectedAgentId,
    resolveCustomAgentCapabilities,
    unavailableCapabilityNames,
    type CustomAgent,
} from './custom-agents'
import type { AgentCapabilityCatalog, SkillPayload, ToolPayload } from '../capabilities/payload-types'

function checkNormalizeDropsInvalid(): void {
    assert.deepEqual(normalizeCustomAgents(null), [])
    assert.deepEqual(normalizeCustomAgents({ agents: [] }), [])
    assert.deepEqual(normalizeCustomAgents([null, 42, 'x']), [])
    // A nameless entry is unusable and must be dropped.
    assert.deepEqual(normalizeCustomAgents([{ instructions: 'only guidance' }]), [])
}

function checkNormalizeKeepsAndTrims(): void {
    const list = normalizeCustomAgents([
        {
            id: 'agent-a',
            name: '  Editor  ',
            avatar: '  smile  ',
            emoji: '  ✍️ ',
            description: '  sharp  ',
            instructions: '  Be precise.  ',
            createdAt: 10,
            updatedAt: 20,
        },
    ])
    assert.equal(list.length, 1)
    assert.equal(list[0].id, 'agent-a')
    assert.equal(list[0].name, 'Editor')
    assert.equal(list[0].avatar, 'smile')
    assert.equal(list[0].emoji, '✍️')
    assert.equal(list[0].description, 'sharp')
    assert.equal(list[0].instructions, '  Be precise.  ')
    assert.equal(list[0].createdAt, 10)
    assert.equal(list[0].updatedAt, 20)
}

function checkNormalizeDedupesIds(): void {
    const list = normalizeCustomAgents([
        { id: 'same', name: 'A', instructions: '' },
        { id: 'same', name: 'B', instructions: '' },
    ])
    assert.equal(list.length, 2)
    assert.notEqual(list[0].id, list[1].id, 'duplicate ids must be reassigned')
}

function checkNormalizeSelected(): void {
    const agents = normalizeCustomAgents([{ id: 'a1', name: 'A', instructions: '' }])
    assert.equal(normalizeSelectedAgentId(agents, 'a1'), 'a1')
    assert.equal(normalizeSelectedAgentId(agents, 'missing'), null)
    assert.equal(normalizeSelectedAgentId(agents, ''), null)
    assert.equal(normalizeSelectedAgentId(agents, undefined), null)
}

function checkFind(): void {
    const agents = normalizeCustomAgents([
        { id: 'a1', name: 'A', instructions: '' },
        { id: 'a2', name: 'B', instructions: '' },
    ])
    assert.equal(findCustomAgent(agents, 'a2')?.name, 'B')
    assert.equal(findCustomAgent(agents, 'nope'), undefined)
    assert.equal(findCustomAgent(agents, null), undefined)
}

function checkCustomAgentNote(): void {
    // No agent / no guidance → no note at all (nothing to inject).
    assert.equal(buildCustomAgentNote(null), undefined)
    assert.equal(buildCustomAgentNote(undefined), undefined)
    const blank: CustomAgent = { id: 'a', name: 'X', instructions: '   ', createdAt: 0, updatedAt: 0 }
    assert.equal(buildCustomAgentNote(blank), undefined)

    const note = buildCustomAgentNote({
        id: 'a', name: 'Researcher', instructions: 'Cite sources.', createdAt: 0, updatedAt: 0,
    })!
    assert.ok(note.includes('Researcher'))
    assert.ok(note.includes('Cite sources.'))
    // It must present itself as context that cannot override the system rules —
    // the prompt itself is backend-owned and never includes this text.
    assert.ok(note.includes('不是系统指令'))
    assert.ok(note.includes('以系统规则为准'))
}


// ─── Manual skill/tool configuration ────────────────────────────────

const tool = (name: string): ToolPayload => ({
    type: 'function',
    function: { name, description: `${name} description`, parameters: { type: 'object', properties: {} } },
})

const skill = (
    name: string,
    requiredTools: string[],
    optionalTools?: string[],
): SkillPayload => ({
    name,
    description: `${name} description`,
    requiredTools,
    ...(optionalTools ? { optionalTools } : {}),
    source: 'builtin',
})

function fixtureCatalog(): AgentCapabilityCatalog {
    return {
        skills: [
            skill('doc-review', ['readChunk', 'searchInDocument']),
            skill('bitable-skill', ['insertBitable', 'addBitableRecord'], ['listBitables']),
            skill('prompt-only', []),
        ],
        tools: [
            tool('readChunk'),
            tool('searchInDocument'),
            tool('insertBitable'),
            tool('addBitableRecord'),
            tool('listBitables'),
            tool('write'),
            tool('load_skill'),
        ],
        version: 'v1',
    }
}

const agentWith = (capabilities: CustomAgent['capabilities']): CustomAgent => ({
    id: 'a1',
    name: 'Reviewer',
    instructions: 'Review carefully.',
    capabilities,
    createdAt: 0,
    updatedAt: 0,
})

function checkNormalizeCapabilities(): void {
    // `all` is represented by ABSENCE: an old record and an explicit "all" must
    // look the same to every consumer.
    assert.equal(normalizeCustomAgentCapabilities(undefined), undefined)
    assert.equal(normalizeCustomAgentCapabilities({ mode: 'all', skills: ['x'] }), undefined)
    assert.equal(customAgentCapabilities(agentWith(undefined)), undefined)

    const custom = normalizeCustomAgentCapabilities({
        mode: 'custom',
        // Spelling differences fold to one skill; tools are identifiers and stay exact.
        skills: ['Doc Review', 'doc_review', '  ', 42],
        tools: ['readChunk', 'readChunk', 'ReadChunk'],
    })!
    assert.equal(custom.mode, 'custom')
    assert.deepEqual(custom.skills, ['Doc Review'])
    assert.deepEqual(custom.tools, ['readChunk', 'ReadChunk'])

    // An empty custom list is meaningful (chat-only agent), not "everything".
    const empty = normalizeCustomAgentCapabilities({ mode: 'custom' })!
    assert.deepEqual(empty.skills, [])
    assert.deepEqual(empty.tools, [])
}

function checkCapabilitiesSurviveNormalization(): void {
    const list = normalizeCustomAgents([
        {
            id: 'a1',
            name: 'Reviewer',
            instructions: 'Review.',
            capabilities: { mode: 'custom', skills: ['doc-review'], tools: ['write'] },
        },
        // A legacy record has no capabilities and must stay unrestricted.
        { id: 'a2', name: 'Legacy', instructions: 'Hi.' },
    ])
    assert.deepEqual(list[0].capabilities, { mode: 'custom', skills: ['doc-review'], tools: ['write'] })
    assert.equal(list[1].capabilities, undefined)
}

function checkUnrestrictedCatalogIsUnchanged(): void {
    const catalog = fixtureCatalog()
    // Same object → the unrestricted run path stays byte- and identity-stable.
    assert.equal(filterCatalogForCustomAgent(catalog, null), catalog)
    assert.equal(filterCatalogForCustomAgent(catalog, agentWith(undefined)), catalog)
    assert.equal(filterCatalogForCustomAgent(catalog, agentWith({ mode: 'all', skills: [], tools: [] })), catalog)
    assert.equal(customAgentAllowedToolNames(catalog, agentWith(undefined)), null)
}

function checkFilterKeepsConfiguredSkillsAndTheirTools(): void {
    const catalog = fixtureCatalog()
    const filtered = filterCatalogForCustomAgent(catalog, agentWith({
        mode: 'custom',
        skills: ['bitable'],
        // `write` is explicitly allowed; the bitable tools come with the skill.
        tools: ['write'],
    }))
    assert.deepEqual(filtered.skills.map(item => item.name), ['bitable-skill'])
    assert.deepEqual(
        filtered.tools.map(item => item.function.name).sort(),
        ['addBitableRecord', 'insertBitable', 'listBitables', 'load_skill', 'write'],
        'skill-owned tools and the discovery bridge are kept, everything else is gone',
    )
    assert.ok(filtered.version.includes(':ca'), 'a restricted catalog needs its own version')
    assert.notEqual(filtered.version, catalog.version)
}

function checkFilterDropsDiscoveredButUnconfiguredSkills(): void {
    const catalog = fixtureCatalog()
    const filtered = filterCatalogForCustomAgent(catalog, agentWith({ mode: 'custom', skills: [], tools: [] }))
    // Chat-only: no tools, no skills, no discovery bridge.
    assert.deepEqual(filtered.skills, [])
    assert.deepEqual(filtered.tools, [])
    assert.equal(filtered.version.includes(':ca'), true)
}

function checkAllowedToolNamesIncludeSkillTools(): void {
    const catalog = fixtureCatalog()
    const allowed = customAgentAllowedToolNames(catalog, agentWith({
        mode: 'custom', skills: ['doc-review'], tools: ['write'],
    }))!
    assert.deepEqual([...allowed].sort(), ['load_skill', 'readChunk', 'searchInDocument', 'write'])
}

function checkUnavailableCapabilities(): void {
    const catalog = fixtureCatalog()
    const missing = unavailableCapabilityNames(catalog, {
        skills: ['doc-review', 'uninstalled-skill'],
        tools: ['write', 'goneTool'],
    })
    assert.deepEqual(missing.skills, ['uninstalled-skill'])
    assert.deepEqual(missing.tools, ['goneTool'])
    // Unrestricted agents have nothing to be missing.
    assert.deepEqual(unavailableCapabilityNames(catalog, null), { skills: [], tools: [] })
}

function checkResolveCapabilitiesOnSave(): void {
    const existing = { mode: 'custom' as const, skills: ['doc-review'], tools: ['write'] }

    // Nothing sent → keep the restriction (a guidance-only edit).
    assert.deepEqual(resolveCustomAgentCapabilities(existing, {}), existing)
    // Explicit "all" → clear it.
    assert.equal(resolveCustomAgentCapabilities(existing, { mode: 'all' }), undefined)
    // One half sent → the other half survives.
    assert.deepEqual(
        resolveCustomAgentCapabilities(existing, { skills: ['bitable'] }),
        { mode: 'custom', skills: ['bitable'], tools: ['write'] },
    )
    assert.deepEqual(
        resolveCustomAgentCapabilities(existing, { tools: [] }),
        { mode: 'custom', skills: ['doc-review'], tools: [] },
    )
    // Explicit custom without lists keeps both halves.
    assert.deepEqual(
        resolveCustomAgentCapabilities(existing, { mode: 'custom' }),
        existing,
    )
    // Creation: nothing → unrestricted; lists → restricted (empty is meaningful).
    assert.equal(resolveCustomAgentCapabilities(undefined, {}), undefined)
    assert.deepEqual(
        resolveCustomAgentCapabilities(undefined, { skills: ['doc-review'] }),
        { mode: 'custom', skills: ['doc-review'], tools: [] },
    )
    assert.deepEqual(
        resolveCustomAgentCapabilities(undefined, { mode: 'custom', skills: [], tools: [] }),
        { mode: 'custom', skills: [], tools: [] },
    )
}

function main(): void {
    checkNormalizeDropsInvalid()
    checkNormalizeKeepsAndTrims()
    checkNormalizeDedupesIds()
    checkNormalizeSelected()
    checkFind()
    checkCustomAgentNote()
    checkNormalizeCapabilities()
    checkCapabilitiesSurviveNormalization()
    checkUnrestrictedCatalogIsUnchanged()
    checkFilterKeepsConfiguredSkillsAndTheirTools()
    checkFilterDropsDiscoveredButUnconfiguredSkills()
    checkAllowedToolNamesIncludeSkillTools()
    checkUnavailableCapabilities()
    checkResolveCapabilitiesOnSave()
    console.log('custom-agents checks passed')
}

main()
