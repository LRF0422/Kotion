/**
 * Executable checks for the seed-source rule.
 *
 * The rule is five branches long, which is exactly why it needs pinning: most of
 * them look interchangeable and are not, and getting two of them wrong loses or
 * resurrects user content silently. There is no assertion a running page could
 * make about this — by the time the wrong branch has been taken, the evidence is
 * a reconcile that already happened.
 *
 * This repo has no JavaScript test runner, so like the other `.check.ts` files
 * this is a plain program: `pnpm --filter @kn/editor check:seed` runs it.
 */
import { chooseSeed, BlockStoreRead } from './seed-source'

let pass = 0
let fail = 0

function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) {
    pass++
    console.log('  ok   ' + name)
  } else {
    fail++
    console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''))
  }
}

const LEGACY = { type: 'doc', content: [{ type: 'title', attrs: { id: 'legacy' } }] }
const BLOCKS = { type: 'doc', content: [{ type: 'title', attrs: { id: 'blocks' } }] }
const EMPTY = { type: 'doc' }

const read = (rev: number | null, doc: unknown | null = BLOCKS): BlockStoreRead => ({ doc, rev })

// ─── Waiting ──────────────────────────────────────────────────────────

console.log('\nbefore the read lands')

check(
  'an in-flight read decides nothing',
  chooseSeed(undefined, LEGACY) === null,
)

check(
  'and still decides nothing when there is no legacy content to fall back on',
  // The tempting shortcut — "nothing to wait for, mount now" — seeds emptiness
  // into a page whose content is about to arrive from the block store.
  chooseSeed(undefined, undefined) === null,
)

// ─── The authoritative answer ─────────────────────────────────────────

console.log('\nthe block store has rows')

{
  const seed = chooseSeed(read(4), LEGACY)
  check(
    'a page at a real rev is seeded from the block store, not the legacy column',
    seed?.doc === BLOCKS && seed?.trusted === true,
    seed,
  )
}

{
  // The case the whole `rev` round trip exists for. An emptied page and a page
  // that predates this model are indistinguishable by content: both have no
  // blocks. Only the rev separates "the user deleted everything" from "this page
  // has never been written under this model", and reading this one as the latter
  // hands the user back content they deliberately removed.
  const seed = chooseSeed(read(7, EMPTY), LEGACY)
  check(
    'a page emptied by the user stays empty rather than resurrecting the legacy column',
    seed?.doc === EMPTY && seed?.trusted === true,
    seed,
  )
}

{
  const seed = chooseSeed(read(7, null), LEGACY)
  check(
    'a real rev with no document in the response seeds nothing, and is still trusted',
    seed?.doc === undefined && seed?.trusted === true,
    seed,
  )
}

// ─── The migration bridge ─────────────────────────────────────────────

console.log('\nthe block store has never held this page')

{
  const seed = chooseSeed(read(0, EMPTY), LEGACY)
  check(
    'rev 0 falls back to the legacy column',
    seed?.doc === LEGACY && seed?.trusted === true,
    seed,
  )
}

{
  // Writing is what migrates the page, so it must be allowed here. Withholding
  // trust would leave every un-backfilled page permanently un-saveable.
  const seed = chooseSeed(read(0, EMPTY), LEGACY)
  check(
    'and permits writing, because the first write is what performs the migration',
    seed?.trusted === true,
    seed,
  )
}

{
  const seed = chooseSeed(read(0, EMPTY), undefined)
  check(
    'a genuinely new page seeds nothing and is still writable',
    seed?.doc === undefined && seed?.trusted === true,
    seed,
  )
}

// ─── The rev could not be read ────────────────────────────────────────

console.log('\nthe response carried no readable rev')

{
  // This is not hypothetical: the backend serialises every 64-bit integer as a
  // JSON string, so a parser that only accepted numbers read every real rev as
  // absent. Treating that as rev 0 seeded the legacy column over a page the
  // block store had content for — and then trusted it, so the first keystroke
  // reconciled that content away.
  const seed = chooseSeed(read(null, BLOCKS), LEGACY)
  check(
    'an unreadable rev still shows the block store document, not the legacy column',
    seed?.doc === BLOCKS,
    seed,
  )
}

{
  // Without a rev, "never written" and "emptied on purpose" are the same answer,
  // so there is nothing left to justify a write. Read-only costs an edit;
  // guessing costs the page.
  const seed = chooseSeed(read(null, BLOCKS), LEGACY)
  check(
    'and refuses to write, because nothing here distinguishes new from emptied',
    seed?.trusted === false,
    seed,
  )
}

{
  const seed = chooseSeed(read(null, null), LEGACY)
  check(
    'with no document either, it falls back to the legacy column, still untrusted',
    seed?.doc === LEGACY && seed?.trusted === false,
    seed,
  )
}

// ─── The read failed ──────────────────────────────────────────────────

console.log('\nthe read failed')

{
  const seed = chooseSeed(null, LEGACY)
  check(
    'a failed read shows the legacy column rather than a blank page',
    seed?.doc === LEGACY,
    seed,
  )
}

{
  // The important half. Showing stale content is a cosmetic problem; writing it
  // back is not, because the first write of a session is a reconcile and a
  // reconcile declares whatever this client holds to be the truth.
  const seed = chooseSeed(null, LEGACY)
  check(
    'but withholds trust, so nothing is written back over content we could not read',
    seed?.trusted === false,
    seed,
  )
}

{
  const seed = chooseSeed(null, undefined)
  check(
    'a failed read with no fallback still refuses to write',
    seed?.doc === undefined && seed?.trusted === false,
    seed,
  )
}

// ─── Invariants across every answer ───────────────────────────────────

console.log('\ninvariants')

{
  // Trust is granted on exactly one condition: the block store answered *and
  // said which rev it answered for*. Stated as a property so a new branch cannot
  // quietly become another way to earn it.
  const answers: Array<[BlockStoreRead | null | undefined, unknown]> = [
    [undefined, LEGACY], [undefined, undefined],
    [null, LEGACY], [null, undefined],
    [read(0, EMPTY), LEGACY], [read(0, EMPTY), undefined],
    [read(1, BLOCKS), LEGACY], [read(9, EMPTY), LEGACY], [read(9, null), undefined],
    [read(null, EMPTY), LEGACY], [read(null, BLOCKS), LEGACY], [read(null, null), undefined],
  ]
  const wrong = answers.filter(([r, l]) => {
    const seed = chooseSeed(r, l)
    if (seed === null) return r !== undefined
    return seed.trusted !== (r != null && r.rev != null)
  })
  check(
    'trust is granted exactly when the block store answered with a rev',
    wrong.length === 0,
    wrong.length,
  )
}

{
  // A seed is only ever one of the two documents it was given. Anything else
  // means the rule invented content, and invented content is what a reconcile
  // would then persist.
  const answers: Array<[BlockStoreRead | null | undefined, unknown]> = [
    [null, LEGACY], [read(0, EMPTY), LEGACY], [read(3, BLOCKS), LEGACY],
    [read(3, EMPTY), LEGACY], [read(3, null), LEGACY], [read(0, EMPTY), undefined],
    [read(null, BLOCKS), LEGACY], [read(null, null), LEGACY],
  ]
  const invented = answers.filter(([r, l]) => {
    const seed = chooseSeed(r, l)
    if (seed === null) return false
    return seed.doc !== undefined && seed.doc !== l && seed.doc !== r?.doc
  })
  check(
    'the seed is always either the block store document or the legacy one',
    invented.length === 0,
    invented.length,
  )
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
