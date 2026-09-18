/**
 * Runtime checks for the custom-agent pure logic (no React, no storage).
 */

import { strict as assert } from 'node:assert'
import {
    composeAgentSystemPrompt,
    findCustomAgent,
    normalizeCustomAgents,
    normalizeSelectedAgentId,
    type CustomAgent,
} from './custom-agents'

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

function checkCompose(): void {
    // No agent, no guidance: the base prompt is untouched.
    assert.equal(composeAgentSystemPrompt('BASE', null), 'BASE')
    assert.equal(composeAgentSystemPrompt('', null), undefined)
    assert.equal(composeAgentSystemPrompt(undefined, undefined), undefined)

    // Guidance without a base prompt still produces a usable system prompt.
    const agentOnly = composeAgentSystemPrompt(undefined, {
        id: 'a', name: 'Researcher', instructions: 'Cite sources.', createdAt: 0, updatedAt: 0,
    })
    assert.ok(agentOnly)
    assert.ok(agentOnly!.includes('# CUSTOM AGENT: Researcher'))
    assert.ok(agentOnly!.includes('Cite sources.'))

    // Base first, custom guidance appended behind it (cache-friendly prefix).
    const both = composeAgentSystemPrompt('BASE RULES', {
        id: 'a', name: 'Researcher', instructions: 'Cite sources.', createdAt: 0, updatedAt: 0,
    })!
    assert.ok(both.startsWith('BASE RULES'))
    assert.ok(both.includes('# CUSTOM AGENT: Researcher'))
    assert.ok(both.includes('Cite sources.'))
    assert.ok(both.indexOf('BASE RULES') < both.indexOf('# CUSTOM AGENT'))

    // Whitespace-only guidance behaves like no guidance at all.
    const blank: CustomAgent = { id: 'a', name: 'X', instructions: '   ', createdAt: 0, updatedAt: 0 }
    assert.equal(composeAgentSystemPrompt('BASE', blank), 'BASE')
}

function main(): void {
    checkNormalizeDropsInvalid()
    checkNormalizeKeepsAndTrims()
    checkNormalizeDedupesIds()
    checkNormalizeSelected()
    checkFind()
    checkCompose()
    console.log('custom-agents checks passed')
}

main()
