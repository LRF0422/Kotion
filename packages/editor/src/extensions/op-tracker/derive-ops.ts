import type { JSONContent } from '@tiptap/core'

// ─── Wire types (mirror of the backend BlockOpDTO) ───────────────────

export type BlockOpKind = 'insert' | 'replace' | 'move' | 'delete'

export type BlockOpPos = 'after' | 'before' | 'firstChild' | 'lastChild'

/**
 * One unit of intent. The client says *what it meant*, never *what the row
 * should look like*.
 *
 * Position is an anchor plus a relation, never a rank: rank is the server's to
 * assign, and a client that could write one could write one that violates
 * sibling ordering.
 */
export interface BlockOp {
  op: BlockOpKind
  blockId: string
  parentId?: string
  pos?: BlockOpPos
  refBlockId?: string
  /** The block's complete subtree. Only on `insert` / `replace`. */
  node?: JSONContent
}

export interface DeriveOpsInput {
  /** Current top-level ids in document order, duplicates already removed. */
  order: string[]
  /** Top-level ids in document order as of the last acknowledged write. */
  baselineOrder: string[]
  /** Ids whose content changed since the baseline. */
  dirty: ReadonlySet<string>
  /** Subtree JSON for a block. Only called for `insert` / `replace`. */
  nodeOf: (id: string) => JSONContent
}

/**
 * Anchor a block after its predecessor, or at the head when it has none.
 *
 * The head case leaves `parentId` unset rather than naming the root. The server's
 * top-level sentinel is the *empty* parent id (`normaliseParent` maps blank to
 * it), so any invented name — `'root'`, `'doc'` — is taken literally as a parent
 * block that does not exist, and the block is filed under it and disappears from
 * the document.
 */
function anchor(op: BlockOp, afterId: string | null): void {
  if (afterId) {
    op.pos = 'after'
    op.refBlockId = afterId
  } else {
    op.pos = 'firstChild'
  }
}

/**
 * Indices into `values` forming a longest strictly-increasing subsequence.
 *
 * Patience sorting, O(n log n). `tails[k]` holds the position of the smallest
 * possible tail of an increasing run of length k+1, and `prev` threads each
 * position back to its predecessor so the run itself can be recovered rather
 * than just its length.
 */
function longestIncreasingIndices(values: number[]): number[] {
  if (values.length === 0) return []

  const tails: number[] = []
  const prev = new Array<number>(values.length).fill(-1)

  for (let i = 0; i < values.length; i++) {
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (values[tails[mid]] < values[i]) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) prev[i] = tails[lo - 1]
    tails[lo] = i
  }

  const result: number[] = []
  for (let at = tails[tails.length - 1]; at !== -1; at = prev[at]) result.push(at)
  return result.reverse()
}

/**
 * Turn "here is the document, here is what the server last confirmed" into an op
 * sequence.
 *
 * Split out of the extension deliberately: this is the one piece of Stage 2 that
 * can get order wrong in a way no type checker would catch, and here it is a
 * pure function of three plain values — testable without a browser, a
 * ProseMirror document or an editor instance.
 *
 * ## The order rule
 *
 * Blocks whose baseline positions already form a longest increasing subsequence
 * of the desired order stay put; everything else moves after its predecessor.
 * That is the minimum number of moves, and it matters for more than tidiness.
 *
 * The obvious cheaper rule — walk the desired order and keep a block only if it
 * follows everything kept so far — is badly asymmetric. It is optimal dragging a
 * block *down* (one move) and pessimal dragging one *up*: because the first block
 * in the desired order always trivially qualifies, dragging a block to the top of
 * a 500-block page keeps the dragged block and emits 499 moves for everything
 * else. Same final order, but a 499-op batch and a version history claiming the
 * whole page moved. Users drag up as often as down, so that asymmetry is not an
 * acceptable trade.
 *
 * On an unchanged document the subsequence is the whole document and nothing is
 * emitted at all. That is the property autosave depends on.
 *
 * Deliberately index-based rather than node-reference-based: a native
 * drag-and-drop move reuses the moved node object, so a reference diff would
 * miss precisely the case this exists to catch.
 *
 * ## Ordering within the returned sequence
 *
 * Ops are emitted in document order, and deletes last. Both matter, because the
 * server applies them in sequence and an anchor has to exist by the time it is
 * referenced: a block is only ever anchored to its predecessor, which document
 * order guarantees has already been inserted or kept. Deletes go last so a block
 * can serve as an anchor in the same batch that removes it.
 */
export function deriveOps(input: DeriveOpsInput): BlockOp[] {
  const { order, baselineOrder, dirty, nodeOf } = input

  const baselineIndex = new Map<string, number>()
  baselineOrder.forEach((id, index) => baselineIndex.set(id, index))

  // Positions in `order` of blocks the server already has, and their baseline
  // indices. New blocks are excluded: they have no position to keep.
  const existingAt: number[] = []
  const existingValues: number[] = []
  for (let i = 0; i < order.length; i++) {
    const index = baselineIndex.get(order[i])
    if (index !== undefined) {
      existingAt.push(i)
      existingValues.push(index)
    }
  }
  const stays = new Set<string>()
  for (const at of longestIncreasingIndices(existingValues)) stays.add(order[existingAt[at]])

  const ops: BlockOp[] = []
  const present = new Set(order)
  let prevId: string | null = null

  for (const id of order) {
    const exists = baselineIndex.has(id)

    if (!exists) {
      const op: BlockOp = { op: 'insert', blockId: id, node: nodeOf(id) }
      anchor(op, prevId)
      ops.push(op)
    } else {
      if (dirty.has(id)) {
        ops.push({ op: 'replace', blockId: id, node: nodeOf(id) })
      }
      if (!stays.has(id)) {
        const op: BlockOp = { op: 'move', blockId: id }
        anchor(op, prevId)
        ops.push(op)
      }
    }

    prevId = id
  }

  for (const id of baselineOrder) {
    if (!present.has(id)) {
      ops.push({ op: 'delete', blockId: id })
    }
  }

  return ops
}
