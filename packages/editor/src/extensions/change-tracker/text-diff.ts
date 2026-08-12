import type { JSONContent } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

// ─── Types ───────────────────────────────────────────────────────────

/**
 * One inline (span-level) edit against a textblock's plain-text content.
 * Offsets are always in BASELINE text coordinates; map to current-text
 * coordinates by accumulating the deltas of preceding ops.
 */
export interface InlineOp {
    type: 'insert' | 'delete'
    /** Offset in the baseline text. */
    baseOffset: number
    /** Inserted text (present in current), or deleted text (present in baseline). */
    text: string
}

/** Placeholder for leaf inline atoms (images, mentions) when flattening text. */
export const LEAF_CHAR = '�'

/** Flatten a textblock's inline content to plain text (atoms become LEAF_CHAR). */
export const inlineTextOf = (node: ProseMirrorNode): string =>
    node.textBetween(0, node.content.size, '', LEAF_CHAR)

// ─── Character-level diff (Myers) ────────────────────────────────────

/** Above this combined length, skip the exact diff and report one replacement. */
const MAX_DIFF_INPUT = 8000

/**
 * Diff two strings at character granularity. Returns ops in ascending
 * baseOffset order, adjacent same-type ops merged.
 */
export const diffInlineText = (base: string, cur: string): InlineOp[] => {
    if (base === cur) return []

    // Common prefix / suffix.
    let start = 0
    const minLen = Math.min(base.length, cur.length)
    while (start < minLen && base[start] === cur[start]) start++
    let endBase = base.length
    let endCur = cur.length
    while (endBase > start && endCur > start && base[endBase - 1] === cur[endCur - 1]) {
        endBase--
        endCur--
    }

    const ops: InlineOp[] = []
    diffMiddle(base.slice(start, endBase), cur.slice(start, endCur), start, ops)
    return mergeAdjacent(ops)
}

const diffMiddle = (a: string, b: string, offset: number, out: InlineOp[]) => {
    const n = a.length
    const m = b.length
    if (n === 0) {
        if (m > 0) out.push({ type: 'insert', baseOffset: offset, text: b })
        return
    }
    if (m === 0) {
        out.push({ type: 'delete', baseOffset: offset, text: a })
        return
    }
    if (n + m > MAX_DIFF_INPUT) {
        out.push({ type: 'delete', baseOffset: offset, text: a })
        out.push({ type: 'insert', baseOffset: offset, text: b })
        return
    }

    // Myers O(ND) with a trace for backtracking.
    const max = n + m
    const width = 2 * max + 1
    let v = new Int32Array(width)
    const trace: Int32Array[] = []
    let found = 0
    outer: for (let d = 0; d <= max; d++) {
        trace.push(v.slice())
        for (let k = -d; k <= d; k += 2) {
            let x: number
            if (k === -d || (k !== d && v[k - 1 + max] < v[k + 1 + max])) {
                x = v[k + 1 + max]
            } else {
                x = v[k - 1 + max] + 1
            }
            let y = x - k
            while (x < n && y < m && a[x] === b[y]) {
                x++
                y++
            }
            v[k + max] = x
            if (x >= n && y >= m) {
                found = d
                break outer
            }
        }
    }

    // Backtrack from (n, m) to (0, 0), emitting ops in reverse.
    const reversed: InlineOp[] = []
    let x = n
    let y = m
    for (let d = found; d > 0; d--) {
        const vPrev = trace[d - 1]
        const k = x - y
        let prevK: number
        if (k === -d || (k !== d && vPrev[k - 1 + max] < vPrev[k + 1 + max])) {
            prevK = k + 1
        } else {
            prevK = k - 1
        }
        const prevX = vPrev[prevK + max]
        const prevY = prevX - prevK
        // Snake (matching characters) — walk up-left.
        while (x > prevX && y > prevY) {
            x--
            y--
        }
        if (d > 0) {
            if (x === prevX) {
                // Down move = insertion of b[y - 1] at baseline offset x.
                reversed.push({ type: 'insert', baseOffset: offset + x, text: b[y - 1] })
                y--
            } else {
                // Right move = deletion of a[x - 1].
                reversed.push({ type: 'delete', baseOffset: offset + x - 1, text: a[x - 1] })
                x--
            }
        }
    }

    reversed.reverse()
    out.push(...reversed)
}

const mergeAdjacent = (ops: InlineOp[]): InlineOp[] => {
    const merged: InlineOp[] = []
    for (const op of ops) {
        const last = merged[merged.length - 1]
        // Merge runs of the same type that are adjacent in their own text:
        // inserts at the same offset, deletes at consecutive offsets.
        if (
            last &&
            last.type === op.type &&
            (op.type === 'insert'
                ? op.baseOffset === last.baseOffset
                : op.baseOffset === last.baseOffset + last.text.length)
        ) {
            if (op.type === 'insert') last.text += op.text
            else last.text += op.text
        } else {
            merged.push({ ...op })
        }
    }
    // After merging, sort: deletes before inserts at the same offset.
    return merged.sort(
        (a, b) =>
            a.baseOffset - b.baseOffset ||
            (a.type === b.type ? 0 : a.type === 'delete' ? -1 : 1),
    )
}

// ─── Offset mapping ──────────────────────────────────────────────────

/**
 * Map a baseline offset to a current-text offset, given the ops that precede
 * it. `delta` bookkeeping shared by decoration building and action dispatch.
 */
export const currentOffsets = (ops: InlineOp[]): number[] => {
    const out: number[] = []
    let delta = 0
    for (const op of ops) {
        out.push(op.baseOffset + delta)
        delta += op.type === 'insert' ? op.text.length : -op.text.length
    }
    return out
}

// ─── Baseline surgery (span-level accept) ────────────────────────────

interface TextSeg {
    start: number
    end: number
    text: string
    marks?: any[]
}

/**
 * Produce a new block JSON equal to `blockJson` (the CURRENT block) with the
 * given ops INVERTED: pending insertions are cut out, pending deletions are
 * written back as plain text (marks inherit from the insertion neighbour).
 * The result serves as the block's new baseline after the complementary ops
 * were accepted. Only called for all-text inline content (the LEAF_CHAR
 * guard upstream rejects blocks containing atoms).
 */
export const removeOpsFromBlockJSON = (blockJson: JSONContent, ops: InlineOp[]): JSONContent => {
    const content = blockJson.content ?? []
    const segs: TextSeg[] = []
    let off = 0
    for (const node of content) {
        if (node.type !== 'text' || typeof node.text !== 'string') return blockJson
        segs.push({ start: off, end: off + node.text.length, text: node.text, marks: node.marks })
        off += node.text.length
    }
    const total = off

    // Cut ranges / insert points in CURRENT-text coordinates.
    const cuts: Array<[number, number]> = []
    const inserts: Array<{ pos: number; text: string }> = []
    const curOff = currentOffsets(ops)
    ops.forEach((op, i) => {
        if (op.type === 'insert') cuts.push([curOff[i], curOff[i] + op.text.length])
        else inserts.push({ pos: curOff[i], text: op.text })
    })

    const emitRange = (from: number, to: number, out: TextSeg[]) => {
        for (const seg of segs) {
            const s = Math.max(from, seg.start)
            const e = Math.min(to, seg.end)
            if (s >= e) continue
            out.push({
                start: 0,
                end: 0,
                text: seg.text.slice(s - seg.start, e - seg.start),
                marks: seg.marks,
            })
        }
    }
    const marksAt = (pos: number): any[] | undefined =>
        segs.find(s => pos >= s.start && pos < s.end)?.marks ?? segs[segs.length - 1]?.marks

    // Merge cuts + inserts into a single event stream ordered by position;
    // at the same position the insert lands where the cut starts.
    const events = [
        ...cuts.map(([from, to]) => ({ pos: from, cutTo: to, ins: undefined as string | undefined })),
        ...inserts.map(i => ({ pos: i.pos, cutTo: undefined as number | undefined, ins: i.text })),
    ].sort((a, b) => a.pos - b.pos || (a.ins !== undefined ? -1 : 1))

    const pieces: TextSeg[] = []
    let cursor = 0
    for (const ev of events) {
        if (ev.pos > cursor) emitRange(cursor, ev.pos, pieces)
        if (ev.ins !== undefined) {
            pieces.push({ start: 0, end: 0, text: ev.ins, marks: marksAt(ev.pos) })
        }
        if (ev.cutTo !== undefined) cursor = Math.max(cursor, ev.cutTo)
        else cursor = Math.max(cursor, ev.pos)
    }
    if (cursor < total) emitRange(cursor, total, pieces)

    return {
        ...blockJson,
        content: pieces
            .filter(p => p.text.length > 0)
            .map(p => ({
                type: 'text',
                text: p.text,
                ...(p.marks && p.marks.length > 0 ? { marks: p.marks } : {}),
            })),
    }
}
