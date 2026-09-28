/**
 * plugin-main's agent surface, pinned.
 *
 * The failure this guards (observed): `editPage` — the tool that switches the
 * conversation's / workbench's off-screen edit target — existed in core
 * (`createPageTools`) and in the built-in metadata registry, but plugin-main
 * neither DECLARED it (`agent.include`) nor named it in this skill. The workspace
 * surface only offers tools whose metadata is `source: 'plugin'` or carries a
 * scope, so the tool was filtered out of every no-document run: the model was told
 * by `workspace-home` to call `editPage`, tried, and got TOOL_NOT_FOUND — leaving
 * "编辑这个已有页面" impossible at the workbench (`openPage` navigates the user
 * away, which is not what the user asked for).
 *
 * The invariants, all checkable without pulling the React tree in:
 *  - the page entry points that GIVE a run a document (`createPage`, `editPage`)
 *    are declared, so they exist as plugin tools on the workspace surface;
 *  - the names the skill claims and `agent.include` are the SAME set — a skill
 *    naming an undeclared tool is prose about a function that cannot be called,
 *    and a declared tool no skill mentions is a capability the model never learns;
 *  - every claimed name appears in the skill's fragment, so prose and tool list
 *    cannot drift apart.
 */
import { strict as assert } from 'node:assert'
import { knowledgeBaseSkill } from './knowledge-base-skill'
import { PAGE_AGENT_INCLUDE } from './agent-surface'

const required: string[] = knowledgeBaseSkill.requiredTools ?? []
const optional: string[] = knowledgeBaseSkill.optionalTools ?? []
const claimed = [...required, ...optional]
const claimedSet = new Set(claimed)
const include = new Set<string>(PAGE_AGENT_INCLUDE as readonly string[])
const fragment: string = knowledgeBaseSkill.systemPromptFragment ?? ''

// The two halves of "give the run a document": create one, or retarget to an
// existing one. Declared AND required — a discovery round trip before either
// would stall the run's first step.
for (const name of ['createPage', 'editPage']) {
    assert.ok(include.has(name),
        `agent.include must declare ${name}: it is how a run gets (or switches) a document`)
    assert.ok(required.includes(name),
        `${name} is an entry point, not an optional extra`)
}

// The skill's prose and the plugin's declaration are two halves of one contract.
// A name in one but not the other is either an uncallable function or an
// undiscoverable capability.
for (const name of claimed) {
    assert.ok(include.has(name),
        `${name} is claimed by the skill but not declared in agent.include — it can never be called`)
}
for (const name of include) {
    assert.ok(claimedSet.has(name),
        `${name} is declared in agent.include but no skill names it — the model never learns it exists`)
}

// `openPage` navigates the user away, so it must never be the answer to
// "edit this page" — the skill has to keep pointing that case at editPage.
assert.ok(fragment.includes('editPage'),
    'the fragment must explain the editPage workflow: it is the only route to an existing page')

// Prose and tool list cannot drift: every name the skill claims is mentioned.
for (const name of claimedSet) {
    assert.ok(fragment.includes(name),
        `the fragment must mention the declared tool ${name}`)
}

console.log('knowledge-base skill checks passed')
