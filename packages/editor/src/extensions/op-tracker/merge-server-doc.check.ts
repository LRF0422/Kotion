/**
 * Executable checks for {@link mergeServerDoc}.
 *
 * The plan's test target for this stage is a behaviour, not a value: "会话存续期间
 * 服务端写入一次 op，断言房主在一个心跳周期内拉取并对齐，且**不会把该改动 revert**".
 * The revert is the failure that matters, and the only thing standing between the
 * code and it is which side wins for each block — so that is what is enumerated
 * here, one case per row of the decision table, plus the two properties that no
 * amount of enumeration would cover.
 *
 * The second of those properties is the interesting one. Catching up is not the
 * end of the story: the host then has to be able to *save* again, from a document
 * that is neither what it had nor what the server sent. So the merge output is
 * fed straight into `deriveOps` with the baseline the catch-up installs, and the
 * resulting ops are replayed onto the server's order. If they do not land exactly
 * on the merged document, the catch-up has left the client in a state it cannot
 * write from, and the next save would corrupt the page instead of the current one.
 *
 * No JavaScript test runner in this repo, so like its neighbours this is a plain
 * program: `pnpm --filter @kn/editor check:merge`.
 */
import type { JSONContent } from '@tiptap/core'
import { mergeServerDoc, readServerBlocks, MergePlan } from './merge-server-doc'
import { deriveOps } from './derive-ops'

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

const merge = (
  localOrder: string[],
  serverOrder: string[],
  baselineOrder: string[],
  dirty: string[] = [],
): MergePlan =>
  mergeServerDoc({ localOrder, serverOrder, baselineOrder, dirty: new Set(dirty) })

const idle = (p: MergePlan): boolean =>
  p.insert.size === 0 && p.remove.size === 0 && p.replace.size === 0

// ─── Nothing happened ────────────────────────────────────────────────

console.log('\nan aligned document')

{
  // The common case by far: the watermark moved because of a write this client
  // made itself and had already applied. Doing anything at all here would drop
  // the caret and push a document through Yjs for no reason.
  const plan = merge(['a', 'b', 'c'], ['a', 'b', 'c'], ['a', 'b', 'c'])
  check('emits no insert or remove', plan.insert.size === 0 && plan.remove.size === 0, plan)
  check('order is unchanged', plan.order.join(',') === 'a,b,c', plan.order)
  check(
    'clean blocks are replace *candidates* only',
    // Policy, not work: the applier compares the nodes and finds them equal. If
    // this set were treated as a work list the whole page would be rewritten on
    // every catch-up.
    plan.replace.size === 3,
    plan,
  )
}

// ─── The case the mechanism exists for ───────────────────────────────

console.log('\na server-side write')

{
  // AI appended a block while the session was live.
  const plan = merge(['a', 'b'], ['a', 'b', 'ai'], ['a', 'b'])
  check('the new block is inserted', plan.insert.has('ai') && plan.insert.size === 1, plan)
  check('nothing is removed', plan.remove.size === 0, plan)
  check('it lands in the server position', plan.order.join(',') === 'a,b,ai', plan.order)
}

{
  // Inserted mid-document, which is where a naive "append" implementation would
  // look right in a demo and be wrong in use.
  const plan = merge(['a', 'b'], ['a', 'ai', 'b'], ['a', 'b'])
  check('a mid-document server insert keeps its position', plan.order.join(',') === 'a,ai,b', plan.order)
}

{
  // A scheduled job removed a block nobody here had touched.
  const plan = merge(['a', 'b', 'c'], ['a', 'c'], ['a', 'b', 'c'])
  check('a server delete of a clean block is applied', plan.remove.has('b') && plan.remove.size === 1, plan)
  check('the deleted block leaves the order', plan.order.join(',') === 'a,c', plan.order)
}

{
  // The server reordered. Rank is the server's to assign, so its order is the
  // one to hold: keeping the local order would push it straight back as moves.
  const plan = merge(['a', 'b', 'c'], ['c', 'a', 'b'], ['a', 'b', 'c'])
  check('a server reorder is adopted', plan.order.join(',') === 'c,a,b', plan.order)
  check('a reorder moves nothing in or out', plan.insert.size === 0 && plan.remove.size === 0, plan)
}

// ─── Unsaved local work, which is why writing was suspended ──────────

console.log('\nlocal work the server has never seen')

{
  // Writing is suspended by the time we get here, so unsaved local blocks are
  // the normal state, not an edge case. `mine` is in neither the baseline nor
  // the server's document — that is what marks it as ours and unsaved.
  const plan = merge(['a', 'mine', 'b'], ['a', 'b'], ['a', 'b'], ['mine'])
  check('an unsaved local insert is not removed', !plan.remove.has('mine'), plan)
  check('it stays in the merged order', plan.order.includes('mine'), plan.order)
  check(
    'it is anchored after the block it followed',
    // The same rule `deriveOps` uses to describe the insert, so the position the
    // merge chooses is the position the op will ask for.
    plan.order.join(',') === 'a,mine,b',
    plan.order,
  )
}

{
  const plan = merge(['mine', 'a', 'b'], ['a', 'b'], ['a', 'b'], ['mine'])
  check('an unsaved local insert at the head stays at the head', plan.order.join(',') === 'mine,a,b', plan.order)
}

{
  // Two consecutive unsaved blocks must keep their order relative to each other.
  const plan = merge(['a', 'x', 'y', 'b'], ['a', 'b'], ['a', 'b'], ['x', 'y'])
  check('consecutive unsaved inserts keep their relative order', plan.order.join(',') === 'a,x,y,b', plan.order)
}

{
  // The same block, but *not* dirty. Every other case here marks local inserts
  // dirty, which is how they normally are — and that made this case pass for the
  // wrong reason: the "server deleted a block we have since edited" rule below
  // was quietly covering for the presence rule above it, so mutating the
  // presence guard away changed nothing until this case existed.
  //
  // Presence is the right criterion on its own. A block the server has never
  // heard of cannot have been deleted by it, whether or not we edited it since.
  const plan = merge(['a', 'mine', 'b'], ['a', 'b'], ['a', 'b'])
  check(
    'an unsaved local insert survives even when it is not dirty',
    !plan.remove.has('mine') && plan.order.join(',') === 'a,mine,b',
    plan,
  )
}

{
  // We deleted 'b' locally and could not save it. The server still has it.
  const plan = merge(['a', 'c'], ['a', 'b', 'c'], ['a', 'b', 'c'])
  check(
    'a locally deleted block is not resurrected',
    // Without the baseline this is indistinguishable from a server insert, and
    // the block would come back on every catch-up until the delete finally lands.
    !plan.insert.has('b') && !plan.order.includes('b'),
    plan,
  )
}

{
  // Both sides changed the same block. Local wins — not because it is more
  // likely right, but because the server's version survives the loss (it is in
  // the op journal, and the local edit is pushed on top of it) and the local
  // edit does not.
  const plan = merge(['a', 'b'], ['a', 'b'], ['a', 'b'], ['b'])
  check('a dirty block is not overwritten by the server', !plan.replace.has('b'), plan)
  check('its clean neighbour still is', plan.replace.has('a'), plan)
}

{
  // The server deleted a block that has since been edited locally.
  const plan = merge(['a', 'b'], ['a'], ['a', 'b'], ['b'])
  check('a server delete loses to a local edit', !plan.remove.has('b') && plan.order.includes('b'), plan)
}

{
  // ...but only while the edit is unsaved. Once it is clean, the delete applies.
  const plan = merge(['a', 'b'], ['a'], ['a', 'b'])
  check('the same delete applies once the block is clean', plan.remove.has('b'), plan)
}

// ─── A first load, and an empty page ─────────────────────────────────

console.log('\ndegenerate inputs')

{
  const plan = merge([], ['a', 'b'], [])
  check('an empty local document takes everything', plan.insert.size === 2 && plan.order.join(',') === 'a,b', plan)
}

{
  const plan = merge(['a', 'b'], [], ['a', 'b'])
  check('a server document emptied of everything removes everything', plan.remove.size === 2 && plan.order.length === 0, plan)
}

{
  const plan = merge(['a', 'b'], [], [], ['a', 'b'])
  check('unsaved local work survives an empty server document', plan.order.join(',') === 'a,b' && plan.remove.size === 0, plan)
}

{
  check('two empty documents are a no-op', idle(merge([], [], [])))
}

// ─── Reading the payload ─────────────────────────────────────────────

console.log('\nreading the server payload')

{
  const doc: JSONContent = {
    type: 'doc',
    content: [
      { type: 'paragraph', attrs: { id: 'a' } },
      { type: 'paragraph', attrs: {} },
      { type: 'paragraph', attrs: { id: 'a' } },
      { type: 'paragraph', attrs: { id: 'b' } },
    ],
  }
  const blocks = readServerBlocks(doc, 'id')
  check('blocks are indexed in document order', blocks.order.join(',') === 'a,b', blocks.order)
  check(
    'a block without an id is skipped, not given one',
    // An id minted here exists only in this browser. The server has no row for
    // it, so the next save inserts it as a new block — and the page grows
    // another copy on every catch-up.
    blocks.nodeById.size === 2,
    blocks.order,
  )
  check('a duplicate id is not indexed twice', blocks.order.filter(id => id === 'a').length === 1, blocks.order)
}

{
  check('a missing document reads as empty', readServerBlocks(undefined, 'id').order.length === 0)
  check('a document with no content reads as empty', readServerBlocks({ type: 'doc' }, 'id').order.length === 0)
}

// ─── The properties ──────────────────────────────────────────────────

/** Deterministic xorshift32, so a failure is reproducible. */
function makeRandom(seed: number): (n: number) => number {
  let state = seed >>> 0
  return (n: number) => {
    state ^= state << 13
    state >>>= 0
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state % n
  }
}

const nodeOf = (id: string): JSONContent => ({ type: 'paragraph', attrs: { id } })

/** Apply an op batch to an order and report where it lands. */
function replay(ops: ReturnType<typeof deriveOps>, from: string[]): string[] | string {
  let cur = from.slice()
  for (const op of ops) {
    if (op.op === 'replace') continue
    if (op.op === 'delete') {
      cur = cur.filter(x => x !== op.blockId)
      continue
    }
    cur = cur.filter(x => x !== op.blockId)
    if (op.pos === 'firstChild') {
      cur.unshift(op.blockId)
    } else {
      const at = cur.indexOf(op.refBlockId!)
      if (at < 0) return 'anchor not found: ' + op.refBlockId
      cur.splice(at + 1, 0, op.blockId)
    }
  }
  return cur
}

console.log('\nrandomised properties')

{
  const rnd = makeRandom(24680)
  let dupes = 0
  let lostWork = 0
  let unsavable = 0
  let reverted = 0
  let mergesWithWork = 0
  const iterations = 4000

  for (let iter = 0; iter < iterations; iter++) {
    const n = 1 + rnd(8)
    const baseline = Array.from({ length: n }, (_, i) => 'b' + i)

    // The server's document: baseline, minus some, plus some, reordered.
    let serverOrder = baseline.filter(() => rnd(5) !== 0)
    for (let k = 0; k < rnd(3); k++) serverOrder.splice(rnd(serverOrder.length + 1), 0, `srv${iter}_${k}`)
    for (let i = serverOrder.length - 1; i > 0; i--) {
      if (rnd(3) !== 0) continue
      const j = rnd(i + 1)
      ;[serverOrder[i], serverOrder[j]] = [serverOrder[j], serverOrder[i]]
    }

    // Ours: the same baseline with unsaved local changes on top.
    let localOrder = baseline.filter(() => rnd(5) !== 0)
    const localNew: string[] = []
    for (let k = 0; k < rnd(3); k++) {
      const id = `loc${iter}_${k}`
      localNew.push(id)
      localOrder.splice(rnd(localOrder.length + 1), 0, id)
    }
    // Local inserts are *usually* dirty, but not always: leaving some clean is
    // what stops the presence rule and the dirtiness rule covering for each
    // other, which is how the hand-written cases originally passed a mutation
    // that removed the presence rule outright.
    const dirty = new Set<string>(localNew.filter(() => rnd(4) !== 0))
    for (const id of localOrder) if (rnd(3) === 0) dirty.add(id)

    const plan = mergeServerDoc({ localOrder, serverOrder, baselineOrder: baseline, dirty })

    // 1. The merged order is a set, not a bag. A duplicate id here is the
    //    heading-duplication bug this architecture exists to stop.
    if (new Set(plan.order).size !== plan.order.length) {
      if (dupes++ === 0) console.log('    first duplicate: ' + JSON.stringify({ localOrder, serverOrder, order: plan.order }))
    }

    // 2. Unsaved local work is never dropped. This is the data-loss direction.
    for (const id of localNew) {
      if (!plan.order.includes(id)) {
        if (lostWork++ === 0) console.log('    first lost block: ' + JSON.stringify({ id, localOrder, serverOrder, order: plan.order }))
      }
    }

    // 3. The client can still save. After the catch-up the baseline *is* the
    //    server's order, so deriving ops against it and replaying them onto it
    //    has to reproduce the merged document exactly — otherwise the next save
    //    writes something nobody is looking at.
    const ops = deriveOps({
      order: plan.order,
      baselineOrder: serverOrder,
      dirty: new Set(plan.order.filter(id => dirty.has(id))),
      nodeOf,
    })
    const landed = replay(ops, serverOrder)
    if (typeof landed === 'string' || landed.join(',') !== plan.order.join(',')) {
      if (unsavable++ === 0) console.log('    first unsavable merge: ' + JSON.stringify({ serverOrder, order: plan.order, landed }))
    }

    // 4. The server's write is not reverted. Every block the server added and
    //    we had no opinion about must survive both the merge and the save that
    //    follows it.
    for (const id of serverOrder) {
      if (baseline.includes(id)) continue
      if (typeof landed !== 'string' && !landed.includes(id)) {
        if (reverted++ === 0) console.log('    first reverted server block: ' + JSON.stringify({ id, serverOrder, order: plan.order, landed }))
      }
    }

    if (!idle(plan)) mergesWithWork++
  }

  check(`${iterations} random merges: no duplicate ids`, dupes === 0, { dupes })
  check(`${iterations} random merges: unsaved local work is never dropped`, lostWork === 0, { lostWork })
  check(`${iterations} random merges: the merged document is still savable`, unsavable === 0, { unsavable })
  check(`${iterations} random merges: the server's write is never reverted`, reverted === 0, { reverted })
  // Without this the four properties above could all be passing vacuously on
  // 4000 identical no-op merges, which is exactly how the sibling check file's
  // random generator once broke.
  check('random merges actually have work to do', mergesWithWork > iterations / 2, { mergesWithWork, iterations })
}

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
