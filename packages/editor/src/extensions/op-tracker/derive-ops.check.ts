/**
 * Executable checks for {@link deriveOps}.
 *
 * The plan calls op derivation the single biggest risk in this stage: getting
 * move-versus-insert wrong corrupts documents in ways no type checker sees. This
 * repo has no JavaScript test runner, so rather than add one, this file is a
 * plain program — `pnpm --filter @kn/editor check:ops` compiles it and runs it.
 * Cheap to keep, and it fails loudly.
 *
 * The two properties worth more than all the individual cases:
 *   - every anchor an op references already exists when the server reaches it,
 *     which is what makes sequential application safe;
 *   - replaying the emitted ops onto the baseline reproduces the document
 *     exactly. Greedy derivation is allowed to emit redundant moves; it is not
 *     allowed to converge on the wrong order.
 * Both are checked against thousands of randomised documents, because those are
 * the cases nobody thinks to write by hand.
 */
import type { JSONContent } from '@tiptap/core'
import { deriveOps, BlockOp } from './derive-ops'

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

const nodeOf = (id: string): JSONContent => ({ type: 'paragraph', attrs: { id } })

const run = (order: string[], baseline: string[], dirty: string[] = []): BlockOp[] =>
  deriveOps({ order, baselineOrder: baseline, dirty: new Set(dirty), nodeOf })

// ─── The property that makes autosave cheap ──────────────────────────

{
  const ops = run(['a', 'b', 'c'], ['a', 'b', 'c'])
  check('aligned document emits zero ops', ops.length === 0, ops)
}

{
  const ops = run(['a', 'b', 'c'], ['a', 'b', 'c'], ['b'])
  check(
    'pure edit emits exactly one replace',
    ops.length === 1 && ops[0].op === 'replace' && ops[0].blockId === 'b',
    ops,
  )
  check('replace carries no position', ops[0].pos === undefined && ops[0].refBlockId === undefined, ops[0])
}

// ─── Drag: the case the tracker exists for ───────────────────────────

{
  // 'c' pulled up between 'a' and 'b'. The block is not new, so this must be a
  // move. Expressed as delete+insert it would lose the block's identity, and
  // with it the block's history and comments.
  const ops = run(['a', 'c', 'b'], ['a', 'b', 'c'])
  const moves = ops.filter(o => o.op === 'move')
  check('drag emits a move, never insert+delete', !ops.some(o => o.op === 'insert' || o.op === 'delete'), ops)
  check('drag emits exactly one move', moves.length === 1, ops)
  check('moved block is the one that travelled', moves[0].blockId === 'c', moves[0])
  check('move is anchored after its new predecessor', moves[0].pos === 'after' && moves[0].refBlockId === 'a', moves[0])
  check('move carries no content', moves[0].node === undefined, moves[0])
}

{
  // ProseMirror's move-drop rewrites the range, so the tracker marks the block
  // dirty as well. Both ops must appear, replace first, so the block's content
  // is in place before anything is anchored to it.
  const ops = run(['a', 'c', 'b'], ['a', 'b', 'c'], ['c'])
  check('dirty drag emits replace + move', ops.length === 2, ops)
  check('replace precedes move', ops[0].op === 'replace' && ops[1].op === 'move', ops)
}

{
  const ops = run(['c', 'a', 'b'], ['a', 'b', 'c'])
  const m = ops.find(o => o.op === 'move')!
  check(
    'move to head uses firstChild and names no parent',
    // Deliberately `undefined`, not 'root'. The server's top-level sentinel is a
    // blank parent id; a literal 'root' would be resolved as a real parent block,
    // which does not exist, and the moved block would drop out of the document.
    m.pos === 'firstChild' && m.parentId === undefined && m.refBlockId === undefined,
    m,
  )
}

// ─── Insert ──────────────────────────────────────────────────────────

{
  const ops = run(['a', 'b', 'c'], ['a', 'b'], ['c'])
  check('appended block is a single insert', ops.length === 1 && ops[0].op === 'insert' && ops[0].blockId === 'c', ops)
  check('insert anchored after predecessor', ops[0].pos === 'after' && ops[0].refBlockId === 'b', ops[0])
  check('insert carries content', ops[0].node !== undefined, ops[0])
  check('a new block never also emits replace', !ops.some(o => o.op === 'replace'), ops)
}

{
  // Splitting a paragraph puts a new block in the middle.
  const ops = run(['a', 'x', 'b'], ['a', 'b'], ['a', 'x'])
  const ins = ops.filter(o => o.op === 'insert')
  check('mid-document insert emits one insert', ins.length === 1 && ins[0].blockId === 'x', ops)
  check('mid insert anchored after a', ins[0].refBlockId === 'a', ins[0])
  check('untouched following block does not move', !ops.some(o => o.op === 'move'), ops)
}

{
  const ops = run(['a', 'b', 'c'], [], ['a', 'b', 'c'])
  check('empty baseline inserts everything', ops.length === 3 && ops.every(o => o.op === 'insert'), ops)
  check('first insert goes to head', ops[0].pos === 'firstChild', ops[0])
  check('inserts chain to their predecessor', ops[1].refBlockId === 'a' && ops[2].refBlockId === 'b', ops)
}

// ─── Delete ──────────────────────────────────────────────────────────

{
  const ops = run(['a', 'c'], ['a', 'b', 'c'])
  check('removal emits exactly one delete', ops.length === 1 && ops[0].op === 'delete' && ops[0].blockId === 'b', ops)
  check('surviving blocks do not move', !ops.some(o => o.op === 'move'), ops)
}

{
  // Deletes go last so a doomed block can still serve as an anchor earlier in
  // the same batch.
  const ops = run(['b', 'a'], ['a', 'b', 'z'])
  check('deletes are emitted last', ops.findIndex(o => o.op === 'delete') === ops.length - 1, ops)
}

// ─── Invariants, against randomised documents ────────────────────────

/** Walk the batch the way the server does and report the first dangling anchor. */
function firstDanglingAnchor(order: string[], baseline: string[], dirty: string[]): unknown {
  const ops = deriveOps({ order, baselineOrder: baseline, dirty: new Set(dirty), nodeOf })
  const live = new Set(baseline)
  for (const op of ops) {
    if (op.op === 'insert') {
      if (op.refBlockId && !live.has(op.refBlockId)) return { op, reason: 'insert anchor missing' }
      live.add(op.blockId)
    } else if (op.op === 'move') {
      if (op.refBlockId && !live.has(op.refBlockId)) return { op, reason: 'move anchor missing' }
    } else if (op.op === 'replace') {
      if (!live.has(op.blockId)) return { op, reason: 'replace of absent block' }
    } else if (op.op === 'delete') {
      if (!live.has(op.blockId)) return { op, reason: 'delete of absent block' }
      live.delete(op.blockId)
    }
  }
  return null
}

/** Apply the batch to the baseline order and return where it lands. */
function replay(order: string[], baseline: string[], dirty: string[]): string[] | string {
  const ops = deriveOps({ order, baselineOrder: baseline, dirty: new Set(dirty), nodeOf })
  let cur = baseline.slice()
  for (const op of ops) {
    if (op.op === 'replace') continue
    if (op.op === 'delete') {
      cur = cur.filter(x => x !== op.blockId)
      continue
    }
    // insert / move: detach if present, then place relative to the anchor.
    cur = cur.filter(x => x !== op.blockId)
    if (op.pos === 'firstChild') {
      cur.unshift(op.blockId)
    } else {
      const at = cur.indexOf(op.refBlockId!)
      if (at < 0) return 'anchor not found during replay: ' + op.refBlockId
      cur.splice(at + 1, 0, op.blockId)
    }
  }
  return cur
}

/** Deterministic xorshift32, so a failure is reproducible. */
function makeRandom(seed: number): (n: number) => number {
  let state = seed >>> 0
  return (n: number) => {
    // Stays inside 32 bits throughout. A textbook LCG does not: `state *
    // 1103515245` exceeds 2^53, the double silently loses its low bits, and the
    // generator degenerates to a constant — which made an earlier version of
    // this file generate the same trivial document 4000 times and pass.
    state ^= state << 13
    state >>>= 0
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state % n
  }
}

{
  const rnd = makeRandom(12345)
  let anchorFails = 0
  let replayFails = 0
  let movesTotal = 0
  let shuffledCases = 0
  const iterations = 4000

  for (let iter = 0; iter < iterations; iter++) {
    const n = 1 + rnd(9)
    const baseline = Array.from({ length: n }, (_, i) => 'b' + i)
    let order = baseline.slice()
    for (let i = order.length - 1; i > 0; i--) {
      const j = rnd(i + 1)
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    order = order.filter(() => rnd(4) !== 0)
    for (let k = 0; k < rnd(3); k++) order.splice(rnd(order.length + 1), 0, `new${iter}_${k}`)
    const dirty = order.filter(() => rnd(3) === 0)

    const dangling = firstDanglingAnchor(order, baseline, dirty)
    if (dangling) {
      if (anchorFails++ === 0) console.log('    first anchor failure: ' + JSON.stringify({ order, baseline, dangling }))
    }

    const landed = replay(order, baseline, dirty)
    if (typeof landed === 'string' || landed.join(',') !== order.join(',')) {
      if (replayFails++ === 0) console.log('    first replay failure: ' + JSON.stringify({ order, baseline, landed }))
    }

    if (order.length > 1) {
      shuffledCases++
      movesTotal += deriveOps({ order, baselineOrder: baseline, dirty: new Set(dirty), nodeOf }).filter(
        o => o.op === 'move',
      ).length
    }
  }

  check(`${iterations} random documents: every anchor exists when referenced`, anchorFails === 0, { anchorFails })
  check(`${iterations} random documents: replaying the ops reproduces the document`, replayFails === 0, { replayFails })
  // Guards against the generator collapsing again: if the random documents were
  // degenerate the invariants above would pass vacuously, and this would not.
  check('random documents actually exercise reordering', movesTotal > shuffledCases, { movesTotal, shuffledCases })
  console.log('    (average moves per random document: ' + (movesTotal / Math.max(shuffledCases, 1)).toFixed(2) + ')')
}

{
  const rnd = makeRandom(999)
  let bad = 0
  for (let iter = 0; iter < 2000; iter++) {
    const n = 2 + rnd(8)
    const baseline = Array.from({ length: n }, (_, i) => 'b' + i)
    const order = baseline.slice()
    for (let i = order.length - 1; i > 0; i--) {
      const j = rnd(i + 1)
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    const ops = deriveOps({ order, baselineOrder: baseline, dirty: new Set(), nodeOf })
    if (ops.some(o => o.op === 'insert' || o.op === 'delete')) bad++
  }
  check('pure reorder never emits insert or delete', bad === 0, { bad })
}

// A single drag must cost a single move whichever way it went. The naive greedy
// rule satisfies this downwards and fails it upwards, which is what motivated
// using a longest increasing subsequence.
{
  const size = 500
  const baseline = Array.from({ length: size }, (_, i) => 'b' + i)

  const toTop = baseline.slice()
  toTop.unshift(toTop.pop()!)
  const upOps = deriveOps({ order: toTop, baselineOrder: baseline, dirty: new Set(), nodeOf })
  const upMoves = upOps.filter(o => o.op === 'move')
  check('dragging the last block to the top is one move', upMoves.length === 1, {
    moves: upMoves.length,
    of: size,
  })
  check('that move is the dragged block, to the head', upMoves[0]?.blockId === 'b499' && upMoves[0]?.pos === 'firstChild', upMoves[0])

  const toBottom = baseline.slice()
  toBottom.push(toBottom.shift()!)
  const downMoves = deriveOps({ order: toBottom, baselineOrder: baseline, dirty: new Set(), nodeOf }).filter(
    o => o.op === 'move',
  )
  check('dragging the first block to the bottom is one move', downMoves.length === 1, {
    moves: downMoves.length,
    of: size,
  })

  // Sanity floor for the whole rule: an aligned 500-block page must stay free.
  check(
    'a 500-block untouched page emits nothing',
    deriveOps({ order: baseline.slice(), baselineOrder: baseline, dirty: new Set(), nodeOf }).length === 0,
  )
}

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
