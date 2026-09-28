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
import {
    createSkillToolSource,
    registerSkillToolSource,
    releaseSkillToolSource,
    type SkillToolSource,
} from '../skills/skill-tool-bridge'
import { ToolProvider } from '../providers/ToolProvider'
import { SkillProvider } from '../providers/SkillProvider'

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
    diagnose: (skill: string) => (skill === 'bitable-ops'
        ? { name: 'bitable-ops', unavailable: [] }
        : { unavailable: [] }),
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

/**
 * Discovery answers for the ASKING run, from live state.
 *
 * The client registry is not the run's capability set: a plugin declares its skills
 * regardless of run scope, and the workbench owns page-scoped tools before it has
 * any document to run them on. `skillNames()` is what the model reads when it asks
 * what it can load, so it must reflect what that run can actually execute — and it
 * must follow a run that gains a document mid-conversation.
 */
async function checkDiscoveryAnswersForTheAskingRun(): Promise<void> {
    const executable = (label: string) => ({
        description: label,
        inputSchema: { type: 'object', properties: {} },
        execute: async () => ({ ok: true }),
    })
    const toolProvider = new ToolProvider({ editor: { id: 'stub' } as any })
    toolProvider.registerPluginTools({
        insertChart: executable('chart'),
        insertBitable: executable('bitable'),
    }, 'Chart')
    const skillProvider = new SkillProvider({})
    skillProvider.registerSkills([
        { name: 'chart-ops', description: 'chart', requiredTools: ['insertChart'], systemPromptFragment: 'chart' },
        { name: 'bitable-ops', description: 'bitable', requiredTools: ['insertBitable'], systemPromptFragment: 'bitable' },
        // Declared but its tool is not registered in this client at all.
        { name: 'columns-layout', description: 'columns', requiredTools: ['insertColumns'], systemPromptFragment: 'x' },
    ] as any)

    const source = createSkillToolSource(skillProvider, toolProvider)
    registerSkillToolSource(source)

    // The whole client, a run that can run everything it registered.
    assert.deepEqual(source.skillNames(), ['bitable-ops', 'chart-ops'],
        'a skill with no registered tool is never discoverable')

    // A workbench run with no document: page-scoped tools exist here but cannot run.
    const withoutDocument = (name: string) => name === 'insertBitable'
    assert.deepEqual(source.skillNames(withoutDocument), ['bitable-ops'],
        'discovery must answer for the asking run, not for the client')
    assert.equal(source.resolve('chart-ops', withoutDocument), null,
        'a tool this run cannot execute must not be delivered')

    const offered = await loadSkill.execute({ skill: 'chart-ops' }, undefined, {
        isToolAvailable: withoutDocument,
    } as any)
    assert.deepEqual(offered.available, ['bitable-ops'],
        'the model is told what IT can load, not what the client owns')

    // Same run, after `createPage` acquired a document: the tools it just gained
    // must be reachable without waiting for its next turn.
    const withDocument = () => true
    assert.deepEqual(source.skillNames(withDocument), ['bitable-ops', 'chart-ops'])
    const delivered = await loadSkill.execute({ skill: 'chart-ops' }, undefined, {
        isToolAvailable: withDocument,
    } as any)
    assert(delivered.success && delivered.activateTools.length === 1,
        'a capability that appeared mid-run must be deliverable immediately')

    registerSkillToolSource(source)
}

/**
 * The model names a skill from memory, not from a menu: case, spacing and the
 * `-skill` suffix all drift. A near miss must land on the same capability, and a
 * real miss must say what to try instead.
 */
async function checkSkillNamesAreForgiving(): Promise<void> {
    const executable = (label: string) => ({
        description: label,
        inputSchema: { type: 'object', properties: {} },
        execute: async () => ({ ok: true }),
    })
    const toolProvider = new ToolProvider({ editor: { id: 'stub' } as any })
    toolProvider.registerPluginTools({
        insertBitable: executable('bitable'),
        getBitableList: executable('list'),
        insertChart: executable('chart'),
    }, 'Bitable')
    const skillProvider = new SkillProvider({})
    skillProvider.registerSkills([
        {
            name: 'bitable-skill',
            description: 'bitable',
            requiredTools: ['insertBitable', 'getBitableList'],
            systemPromptFragment: 'bitable prose',
            tags: ['bitable', '多维表格'],
        },
        {
            name: 'Document Reviewer',
            description: 'comments',
            requiredTools: ['insertChart'],
            systemPromptFragment: 'reviewer prose',
            tags: ['comment', '批注'],
        },
    ] as any)
    registerSkillToolSource(createSkillToolSource(skillProvider, toolProvider))

    // Every spelling a model plausibly produces for `bitable-skill`.
    for (const reference of ['bitable-skill', 'bitable', 'Bitable', 'BITABLE-SKILL', ' bitable ', '多维表格']) {
        const loaded = await loadSkill.execute({ skill: reference })
        assert(loaded.success, `"${reference}" must reach the bitable skill`)
        assert.equal(loaded.skill, 'bitable-skill', `"${reference}" must resolve to the real name`)
        assert.equal(loaded.activateTools.length, 2, 'and deliver the whole capability')
    }
    // A skill whose name is a label with spaces, reached through its tag.
    const review = await loadSkill.execute({ skill: '批注' })
    assert(review.success && review.skill === 'Document Reviewer',
        'a tag the user would say must reach the skill too')

    // A real miss stays actionable.
    const miss = await loadSkill.execute({ skill: 'bitabl' })
    assert(!!miss.error)
    assert((miss.didYouMean ?? []).includes('bitable-skill'),
        'a near miss must name the closest skill instead of only failing')
    assert(miss.available.includes('bitable-skill'))
}

/**
 * "This skill exists but its tools cannot run here yet" is a different answer from
 * "no such skill", and the model acts differently on each. A workbench run has no
 * document until it creates one, and reporting that as a naming mistake sent it
 * hunting for another capability instead of creating the page.
 */
async function checkUnrunnableSkillSaysSo(): Promise<void> {
    const executable = (label: string) => ({
        description: label,
        inputSchema: { type: 'object', properties: {} },
        execute: async () => ({ ok: true }),
    })
    const toolProvider = new ToolProvider({ editor: { id: 'stub' } as any })
    toolProvider.registerPluginTools({
        insertBitable: executable('bitable'),
        addBitableRecord: executable('record'),
    }, 'Bitable')
    const skillProvider = new SkillProvider({})
    skillProvider.registerSkills([{
        name: 'bitable-skill',
        description: 'bitable',
        requiredTools: ['insertBitable', 'addBitableRecord'],
        systemPromptFragment: 'bitable prose',
    }] as any)
    registerSkillToolSource(createSkillToolSource(skillProvider, toolProvider))

    const nothingRunnable = () => false
    const result = await loadSkill.execute({ skill: 'bitable' }, undefined, {
        isToolAvailable: nothingRunnable,
    } as any)

    assert(!!result.error && !result.activateTools, 'nothing may be delivered when nothing can run')
    assert.equal(result.skill, 'bitable-skill', 'the skill must be recognised, not denied')
    assert.deepEqual(result.unavailableTools, ['insertBitable', 'addBitableRecord'],
        'the missing precondition must be named')
    assert(String(result.error).includes('不可调用'),
        'and the error must say the capability is not ready, not that it does not exist')

    registerSkillToolSource(source)
}

/**
 * Two surfaces can be mounted at once (the workbench and an editor panel). The
 * one that unmounts first must not take the other's discovery source with it —
 * that left a working catalogue behind a "能力目录未就绪" error.
 */
async function checkUnmountDoesNotStealTheSource(): Promise<void> {
    const mine = { skillNames: () => ['mine'], resolve: () => null, diagnose: () => ({ unavailable: [] }) }
    const other = { skillNames: () => ['other'], resolve: () => null, diagnose: () => ({ unavailable: [] }) }

    registerSkillToolSource(mine)
    registerSkillToolSource(other)   // a second surface mounts, last writer wins
    releaseSkillToolSource(mine)     // …and the FIRST one unmounts
    const stillThere = await loadSkill.execute({ skill: 'other' })
    assert.deepEqual(stillThere.available, ['other'],
        'an unrelated surface unmounting must not unregister the live discovery source')

    releaseSkillToolSource(other)
    const gone = await loadSkill.execute({ skill: 'other' })
    assert(!!gone.error && gone.available === undefined,
        'and the last one out does clear it')

    registerSkillToolSource(source)
}

async function main(): Promise<void> {
    await checkReturnsSchemaBundle()
    await checkUnknownSkillIsActionable()
    await checkMissingSourceIsNotACrash()
    await checkDiscoveryAnswersForTheAskingRun()
    await checkSkillNamesAreForgiving()
    await checkUnrunnableSkillSaysSo()
    await checkUnmountDoesNotStealTheSource()
    console.log('skill tool checks passed')
}

main()
