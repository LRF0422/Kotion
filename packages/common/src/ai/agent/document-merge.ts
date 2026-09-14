/**
 * Block-level three-way merge for per-agent documents.
 *
 * True parallelism means a delegated agent never writes the shared page while it
 * works: it forks the page into a private document, edits that, and the result
 * is merged back when the agent finishes. This module is the merge itself, kept
 * free of any editor/DOM dependency so it can be reasoned about (and tested) in
 * isolation.
 *
 * The unit is a **top-level block**, identified by its stable block id
 * (`attrs.blockId`/`attrs.id`, the editor's UniqueID convention) with a
 * positional fallback for id-less nodes. The rules are deliberately
 * conservative — the live document is never clobbered:
 *
 *   - a block the agent changed is applied only when nobody else touched it
 *     since the fork (otherwise it is reported as a conflict and left alone);
 *   - a block the agent deleted is deleted only when it is still untouched;
 *   - blocks the agent added are inserted right after the agent's preceding
 *     block (or at the head), preserving the agent's ordering;
 *   - changes made by others since the fork are always preserved;
 *   - reorders are detected and *not* applied (they need intent we do not have).
 */

export interface DocJson {
    type?: string
    content?: DocJson[]
    [key: string]: unknown
}

export type MergeConflictReason = 'both-changed' | 'changed-and-deleted' | 'missing-anchor'

export interface MergeConflict {
    key: string
    reason: MergeConflictReason
    /** Short human-readable label (the block's first text, truncated). */
    label: string
}

export type MergeOp =
    | { kind: 'insert'; anchorKey: string | null; node: DocJson }
    | { kind: 'replace'; key: string; node: DocJson }
    | { kind: 'delete'; key: string }

export interface MergeResult {
    ops: MergeOp[]
    /** Blocks the merge intends to apply. */
    applied: number
    conflicts: MergeConflict[]
    /** The agent reordered existing blocks; that part was skipped. */
    reorderDetected: boolean
}

/** Canonical stringify (sorted object keys) so attribute order never matters. */
function canonical(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}'
}

const nodesOf = (doc: DocJson | null | undefined): DocJson[] =>
    Array.isArray(doc?.content) ? (doc!.content as DocJson[]) : []

const attrsOf = (node: DocJson | undefined): Record<string, unknown> =>
    (node?.attrs as Record<string, unknown> | undefined) ?? {}

/** Stable block key: id when present, else a positional fallback. */
export function blockKey(node: DocJson | undefined, index: number): string {
    const attrs = attrsOf(node)
    const id = attrs.blockId ?? attrs.id
    return typeof id === 'string' && id.length > 0 ? id : '#' + index
}

/** First bit of text in the block, for conflict labels. */
function blockLabel(node: DocJson | undefined): string {
    if (!node) return ''
    let text = ''
    const walk = (n: DocJson) => {
        if (text.length > 60) return
        if (typeof (n as { text?: unknown }).text === 'string') {
            text += (n as { text: string }).text
        }
        for (const child of nodesOf(n)) walk(child)
    }
    walk(node)
    const trimmed = text.trim().replace(/\s+/g, ' ')
    return trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed
}

interface Indexed {
    keys: string[]
    byKey: Map<string, DocJson>
}

function index(doc: DocJson | null | undefined): Indexed {
    const keys: string[] = []
    const byKey = new Map<string, DocJson>()
    nodesOf(doc).forEach((node, i) => {
        const key = blockKey(node, i)
        keys.push(key)
        if (!byKey.has(key)) byKey.set(key, node)
    })
    return { keys, byKey }
}

const same = (a: DocJson | undefined, b: DocJson | undefined): boolean =>
    a === b || canonical(a) === canonical(b)

/**
 * Three-way merge of `mine` (the agent's private document) onto `theirs` (the
 * live document), with `baseline` as the fork point.
 */
export function mergeAgentDocument(
    baseline: DocJson | null | undefined,
    mine: DocJson | null | undefined,
    theirs: DocJson | null | undefined
): MergeResult {
    const base = index(baseline)
    const agent = index(mine)
    const live = index(theirs)

    const ops: MergeOp[] = []
    const conflicts: MergeConflict[] = []

    // Reorders are reported, never applied: the ops below assume live order is
    // the merge target's order, and moving blocks on the agent's say-so would
    // fight whoever else reordered meanwhile. Compare the agent's order of the
    // baseline blocks it kept against the baseline's own order.
    const baselineSurvivors = base.keys.filter(key => agent.byKey.has(key))
    const agentSurvivorOrder = agent.keys.filter(key => base.byKey.has(key))
    const reorderDetected =
        baselineSurvivors.length !== agentSurvivorOrder.length
        || baselineSurvivors.some((key, i) => key !== agentSurvivorOrder[i])

    // 1) Deletions (only when the live block is untouched since the fork).
    for (const key of base.keys) {
        if (agent.byKey.has(key)) continue
        const liveNode = live.byKey.get(key)
        if (!liveNode) continue
        if (same(liveNode, base.byKey.get(key))) {
            ops.push({ kind: 'delete', key })
        } else {
            conflicts.push({ key, reason: 'changed-and-deleted', label: blockLabel(liveNode) })
        }
    }

    // 2) Modifications.
    for (const key of base.keys) {
        const mineNode = agent.byKey.get(key)
        if (!mineNode) continue
        const baseNode = base.byKey.get(key)
        if (same(mineNode, baseNode)) continue
        const liveNode = live.byKey.get(key)
        if (!liveNode) continue // deleted meanwhile: keep the deletion
        if (same(liveNode, mineNode)) continue // both ended up identical
        if (same(liveNode, baseNode)) {
            ops.push({ kind: 'replace', key, node: mineNode })
        } else {
            conflicts.push({ key, reason: 'both-changed', label: blockLabel(mineNode) })
        }
    }

    // 3) Insertions, in the agent's order, anchored to the agent's preceding
    //    block (which is either a baseline block or an earlier insertion).
    const addedKeys = agent.keys.filter(key => !base.byKey.has(key))
    for (let i = 0; i < agent.keys.length; i += 1) {
        const key = agent.keys[i]
        if (base.byKey.has(key)) continue
        // Nearest preceding agent key that will exist in the merged document.
        let anchorKey: string | null = null
        for (let j = i - 1; j >= 0; j -= 1) {
            const candidate = agent.keys[j]
            if (base.byKey.has(candidate) || addedKeys.includes(candidate)) {
                anchorKey = candidate
                break
            }
        }
        const node = agent.byKey.get(key)
        if (!node) continue
        ops.push({ kind: 'insert', anchorKey, node })
    }

    return {
        ops,
        applied: ops.length,
        conflicts,
        reorderDetected,
    }
}
