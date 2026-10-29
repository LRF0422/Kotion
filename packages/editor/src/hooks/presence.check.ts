/**
 * Executable checks for `presentCollaborators`.
 *
 * These pin the two rules that keep the presence bar honest, because neither
 * failure is loud: a hidden agent session counted as a collaborator only looks
 * like a cosmetic duplicate, and a person counted twice just looks like someone
 * else joined the page.
 *
 * This repo has no JavaScript test runner, so like `session-rules.check.ts` this
 * is a plain program: `pnpm --filter @kn/editor check:presence` compiles and runs
 * it.
 */

import { AGENT_AWARENESS_FIELD, presentCollaborators } from './presence'

let pass = 0
let fail = 0

function check(name: string, cond: boolean, actual?: unknown): void {
  if (cond) {
    pass++
    console.log('  ok   ' + name)
  } else {
    fail++
    console.log('  FAIL ' + name + (actual !== undefined ? '  -> ' + JSON.stringify(actual) : ''))
  }
}

const json = (value: unknown): string => JSON.stringify(value)

const human = (clientId: number, id?: string, extra: Record<string, unknown> = {}) => ({
  clientId,
  user: { id, name: id ?? `user-${clientId}`, ...extra },
})

// ─── A hidden agent session is not a collaborator ─────────────────────

console.log('\nhidden agent sessions')

{
  const actual = presentCollaborators([
    human(1, 'u1'),
    { clientId: 2, user: { id: 'u1', name: 'u1' }, [AGENT_AWARENESS_FIELD]: true },
  ])
  check(
    'the hidden session the AI edits through is dropped (no second avatar)',
    json(actual) === json([{ clientId: 1, user: { id: 'u1', name: 'u1' } }]),
    actual,
  )
}

{
  const actual = presentCollaborators([
    { clientId: 3, user: { id: 'u3' }, [AGENT_AWARENESS_FIELD]: 'true' },
  ])
  check(
    'only an explicit `true` marks a hidden session (a stray value cannot hide a human)',
    actual.length === 1 && actual[0].clientId === 3,
    actual,
  )
}

// ─── One person, one avatar ───────────────────────────────────────────

console.log('\nsame person, several clients')

{
  const actual = presentCollaborators([human(1, 'u1'), human(2, 'u1')])
  check('the same user in two windows/tabs collapses to one avatar', actual.length === 1, actual)
}

{
  const actual = presentCollaborators([
    { clientId: 4, user: { name: 'Alice' } },
    { clientId: 5, user: { name: 'Alice' } },
  ])
  check('clients without an id still collapse by display name', actual.length === 1, actual)
}

{
  const actual = presentCollaborators([
    { clientId: 6, user: {} },
    { clientId: 7, user: {} },
  ])
  check('anonymous clients are not collapsed into one person', actual.length === 2, actual)
}

{
  const actual = presentCollaborators([human(1, 'u1'), human(2, 'u2')])
  check(
    'different users are all listed, in first-appearance order',
    json(actual.map(e => e.clientId)) === json([1, 2]),
    actual,
  )
}

// ─── Which copy wins ──────────────────────────────────────────────────

console.log('\nrichness and order')

{
  const actual = presentCollaborators([
    human(10, 'u1'),
    human(11, 'u2'),
    human(12, 'u1', { avatar: 'https://example.com/a.png' }),
  ])
  check(
    'the avatar-bearing copy replaces the poorer one and keeps its position',
    actual.length === 2 && actual[0].clientId === 12 && actual[1].clientId === 11,
    actual,
  )
}

// ─── Housekeeping states ─────────────────────────────────────────────

console.log('\nhousekeeping')

{
  const actual = presentCollaborators([
    { clientId: 1 },
    { clientId: 2, role: 'host' },
    { clientId: 3, user: null },
  ])
  check('states without a user are not collaborators', actual.length === 0, actual)
}

{
  const actual = presentCollaborators([])
  check('no states, no collaborators', actual.length === 0, actual)
}

// ─── Result ──────────────────────────────────────────────────────────

if (fail > 0) {
  console.log(`\n${fail} presence check(s) failed (${pass} passed).\n`)
  process.exit(1)
}
console.log(`\npresence checks passed (${pass}).\n`)
