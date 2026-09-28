/**
 * `load_skill` is the agent's way in to a skill it was told about but has no
 * schema for.
 *
 * The contract that matters: it must return the skill's tools WITH their JSON
 * schemas (that is what the model needs to call them, and what the backend reads
 * to make them routable), it must fail usefully for an unknown skill, and it must
 * be read-only so a plan-mode run can still discover.
 */

import { strict as assert } from 'node:assert'
import { createSkillTools } from './skill-tools'
import { registerSkillToolSource, type SkillToolSource } from '../skills/skill-tool-bridge'

const tools = createSkillTools(undefined)
const loadSkill = tools.load_skill as any

const source: SkillToolSource = {
    skillNames: () => ['bitable-ops', 'chart-ops'],
    resolve: (skill: string) => skill === 'bitable-ops'
        ? {
            skill: 'bitable-ops',
            tools: [{
                name: 'addBitableRecord',
                description: 'append a record',
                inputSchema: {
                    type: 'object',
                    properties: { bitableIndex: { type: 'number' }, records: { type: 'array' } },
                },
                kind: 'frontend',
                readOnly: false,
                source: 'client',
            }],
        }
        : null,
}

async function checkReturnsSchemaBundle(): Promise<void> {
    registerSkillToolSource(source)
    const result = await loadSkill.execute({ skill: 'bitable-ops' })

    assert.equal(result.success, true)
    assert.equal(result.skill, 'bitable-ops')
    // The field the backend reads to make the tools routable for this run.
    assert.equal(result.activateTools.length, 1)
    const spec = result.activateTools[0]
    assert.equal(spec.name, 'addBitableRecord')
    assert.deepEqual(spec.inputSchema.properties.bitableIndex, { type: 'number' },
        'the schema must travel with the name: the model calls the tool from this')
    assert.ok(result.note.includes('addBitableRecord'), 'the note names what was loaded')
    assert.ok(loadSkill.readOnly, 'discovery must stay usable in plan mode')
}

async function checkUnknownSkillIsActionable(): Promise<void> {
    registerSkillToolSource(source)
    const result = await loadSkill.execute({ skill: 'nope' })
    assert.ok(result.error.includes('nope'))
    assert.deepEqual(result.available, ['bitable-ops', 'chart-ops'],
        'an unknown skill must list what CAN be loaded')

    const blank = await loadSkill.execute({ skill: '   ' })
    assert.ok(blank.error)
    assert.deepEqual(blank.available, ['bitable-ops', 'chart-ops'])
}

async function checkMissingSourceIsNotACrash(): Promise<void> {
    registerSkillToolSource(null)
    const result = await loadSkill.execute({ skill: 'bitable-ops' })
    assert.ok(result.error, 'a run with no capability catalog reports it instead of throwing')
}

async function main(): Promise<void> {
    await checkReturnsSchemaBundle()
    await checkUnknownSkillIsActionable()
    await checkMissingSourceIsNotACrash()
    console.log('skill tool checks passed')
}

main()
