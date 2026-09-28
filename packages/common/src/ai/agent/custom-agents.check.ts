/**
 * Runtime checks for the custom-agent pure logic (no React, no storage).
 */

import { strict as assert } from 'node:assert'
import {
    buildCustomAgentNote,
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

function main(): void {
    checkNormalizeDropsInvalid()
    checkNormalizeKeepsAndTrims()
    checkNormalizeDedupesIds()
    checkNormalizeSelected()
    checkFind()
    checkCustomAgentNote()
    console.log('custom-agents checks passed')
}

main()
