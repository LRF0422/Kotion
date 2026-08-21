/**
 * Merging a server-side write back into the live document.
 *
 * During a session the page keeps being written by things that are not a browser
 * — AI, import, scheduled jobs — straight through {@code PageOpService}. Those
 * writes advance the page's rev, and the host finds out via the heartbeat
 * watermark. If it then carried on saving, its next write would describe a
 * document that never contained those changes and would revert them, so writing
 * is suspended until the host has caught up. This module is how it catches up.
 *
 * ## Why this is a three-way merge and not a diff
 *
 * The tempting implementation is "fetch the server's document and adopt it".
 * That is wrong in the one situation this code exists for: writing is *already*
 * suspended by the time we get here, so the host is sitting on edits — its own
 * and every collaborator's, relayed through Yjs — that the server has never
 * seen. Adopting the server's document wholesale would delete exactly the work
 * that could not be saved yet.
 *
 * So the merge has three inputs, not two:
 *
 * - **base** — `baselineOrder` plus the dirty set, which together say what the
 *   server last confirmed and what has changed locally since.
 * - **ours** — the live document.
 * - **theirs** — the document the server just returned.
 *
 * With a real base, "the block is missing from the server's document" splits
 * into two opposite cases that a two-way diff cannot tell apart: we added it and
 * have not saved it yet, or the server deleted it. The base is what decides.
 *
 * ## The tie-break
 *
 * Where both sides changed the same block, **local wins**. Not because local is
 * more likely to be right, but because of what happens next: a local edit that
 * loses is gone for good, whereas the server's version that loses is still in
 * the op journal and in the block history, and the local edit is pushed on top
 * of it as an ordinary `replace` the moment writing resumes. One direction is
 * recoverable and the other is not.
 */
import type { JSONContent } from '@tiptap/core'

export interface MergeInput {
  /** Local top-level ids in document order, duplicates already removed. */
  localOrder: string[]
  /** Top-level ids in the document the server returned. */
  serverOrder: string[]
  /** Top-level ids as of the last write the server acknowledged. */
  baselineOrder: string[]
  /** Ids whose content changed locally since that write. */
  dirty: ReadonlySet<string>
}

export interface MergePlan
{
  /** Top-level ids the merged document should contain, in order. */
  order: string[]
  /** Ids to add, taking the server's node. Never already present locally. */
  insert: Set<string>
  /**
   * Ids present on both sides where the server's version wins.
   *
   * A *candidate* list, not a work list: this says the server's copy is
   * authoritative for these blocks, and the applier still compares the two nodes
   * and does nothing when they already agree. Splitting it that way keeps policy
   * ("whose version wins") here, where it can be tested against plain arrays,
   * and keeps minimality ("is there anything to actually change") next to the
   * document, where the comparison has a schema to do it properly. Rewriting
   * every clean block on every catch-up would work and would also drop the
   * caret and resend the whole page through Yjs.
   */
  replace: Set<string>
  /** Ids to remove locally, because the server no longer has them. */
  remove: Set<string>
}

/**
 * Decide what the document should look like once a server-side write is folded
 * into it.
 *
 * Pure, and deliberately expressed in ids rather than nodes: every rule here is
 * about *presence* and *authority*, and none of them needs to look inside a
 * block. That keeps it testable without a schema, an editor or a document.
 */
export function mergeServerDoc(input: MergeInput): MergePlan {
  const { localOrder, serverOrder, baselineOrder, dirty } = input

  const local = new Set(localOrder)
  const server = new Set(serverOrder)
  const base = new Set(baselineOrder)

  const insert = new Set<string>()
  const replace = new Set<string>()
  const remove = new Set<string>()
  const keep = new Set<string>()

  for (const id of local) {
    if (server.has(id)) {
      // Both have it. Local edits win; otherwise the server's copy is newer by
      // construction — it is at a rev we do not have.
      keep.add(id)
      if (!dirty.has(id)) replace.add(id)
      continue
    }

    if (!base.has(id)) {
      // We created it and have not managed to save it. The server cannot know
      // about it yet, so its absence there says nothing.
      keep.add(id)
      continue
    }

    if (dirty.has(id)) {
      // The server deleted a block we have since edited. Keeping it is the same
      // "local edits are not recoverable" rule as above: it stays dirty and is
      // re-inserted as an ordinary op once writing resumes, which is a decision
      // the user can see and undo. Dropping their edit is not.
      keep.add(id)
      continue
    }

    // The server deleted it and we had nothing invested in it.
    remove.add(id)
  }

  for (const id of server) {
    if (local.has(id)) continue

    if (base.has(id)) {
      // We deleted it locally and have not saved that yet. Re-inserting it here
      // would resurrect a block the user removed, and it would come back on
      // every catch-up until the delete finally lands.
      continue
    }

    // The server added it. This is the case the whole mechanism is for.
    insert.add(id)
    keep.add(id)
  }

  return { order: orderOf(localOrder, serverOrder, keep, server), insert, replace, remove }
}

/**
 * Lay the kept blocks out in an order both sides can be recognised in.
 *
 * The server's order is the spine, because it is the only order that is
 * authoritative: rank is the server's to assign, and a catch-up that quietly
 * kept a local ordering would push it straight back as a batch of moves.
 *
 * Blocks the server has never seen are then threaded back in **after the block
 * they currently follow**, which is the same anchoring rule `deriveOps` uses to
 * describe an insert. Using the same rule in both places is what makes the
 * round trip stable: the position this function puts an unsaved block in is the
 * position the op describing it will ask for.
 */
function orderOf(
  localOrder: string[],
  serverOrder: string[],
  keep: ReadonlySet<string>,
  server: ReadonlySet<string>,
): string[] {
  // Anchor id -> the kept local-only blocks that follow it. `null` is the head,
  // for a block with no kept predecessor the server knows about.
  const trailing = new Map<string | null, string[]>()
  let anchor: string | null = null

  for (const id of localOrder) {
    if (!keep.has(id)) continue
    if (server.has(id)) {
      anchor = id
      continue
    }
    const at = trailing.get(anchor)
    if (at) at.push(id)
    else trailing.set(anchor, [id])
  }

  const order: string[] = []
  const head = trailing.get(null)
  if (head) order.push(...head)

  for (const id of serverOrder) {
    if (!keep.has(id)) continue
    order.push(id)
    const after = trailing.get(id)
    if (after) order.push(...after)
  }

  return order
}

// ─── Reading a document the server sent ──────────────────────────────

export interface ServerBlocks {
  order: string[]
  nodeById: Map<string, JSONContent>
}

/**
 * Index a `{type: "doc", content: [...]}` payload by top-level block id.
 *
 * A block without an id is skipped rather than assigned one. An id invented here
 * would exist only in this browser: the server would have no row for it, so the
 * next save would insert it as a brand new block and the page would grow a copy
 * of it on every catch-up.
 *
 * A duplicate id is skipped for the same reason `orderOf` in the tracker drops
 * it — first occurrence wins, so the outcome is at least deterministic — but it
 * also means the server itself is storing something impossible, hence the warning.
 */
export function readServerBlocks(doc: JSONContent | null | undefined, attr: string): ServerBlocks {
  const order: string[] = []
  const nodeById = new Map<string, JSONContent>()
  let missing = 0
  let duplicates = 0

  for (const node of doc?.content ?? []) {
    const id = (node?.attrs?.[attr] ?? node?.attrs?.id ?? node?.attrs?.blockId) as string | undefined
    if (!id) {
      missing += 1
      continue
    }
    if (nodeById.has(id)) {
      duplicates += 1
      continue
    }
    order.push(id)
    nodeById.set(id, node)
  }

  if (missing > 0 || duplicates > 0) {
    console.warn(
      `[merge-server-doc] server document has ${missing} block(s) without an id and ${duplicates} duplicate id(s); skipped`,
    )
  }

  return { order, nodeById }
}
