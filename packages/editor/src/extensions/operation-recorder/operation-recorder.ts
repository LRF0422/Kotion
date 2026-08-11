import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import {
    applyInverseChanges,
    diffTopBlocks,
    type EditorOpBlockChange,
    type OperationRollbackResult,
} from './op-diff'

// ─── Public Types ────────────────────────────────────────────────────

/**
 * One recorded operation: the block-level delta the document went through
 * inside a single recording window (e.g. one agent tool call). The block
 * snapshots live here in memory only — consumers persist just the id/label
 * and look the payload up through {@link getRecordedOperation}.
 */
export interface EditorOperation {
    id: string
    /** What produced the op — an agent tool name, or any free-form label. */
    label: string
    timestamp: number
    changes: EditorOpBlockChange[]
    reverted: boolean
}

export interface OperationRecorderStorage {
    /** Recorded operations, oldest first. */
    ops: EditorOperation[]
    /**
     * Open a recording window; every doc change until `end` is attributed to
     * a single op. A dangling window is auto-closed by the next `begin`.
     */
    begin: (label: string) => void
    /** Close the window; returns the recorded op, or null when nothing changed. */
    end: (label?: string) => EditorOperation | null
    /** Abandon the open window without recording (e.g. stream aborted mid-tool). */
    cancel: () => void
    /** Invert one recorded op in a single transaction. */
    rollback: (opId: string) => OperationRollbackResult | null
    get: (opId: string) => EditorOperation | undefined
    clear: () => void
}

// ─── opId -> editor registry ─────────────────────────────────────────
// Lets consumers (chat UI) resolve an op back to the editor that recorded it
// without holding editor references themselves. Entries die with the editor
// (onDestroy) or when ops are dropped from the bounded log.

const opEditorRegistry = new Map<string, Editor>()

/** Look up a recorded op and its owning editor; null when the payload is
 *  gone (editor destroyed, op evicted) — consumers render that as expired. */
export const getRecordedOperation = (
    opId: string,
): { op: EditorOperation; editor: Editor } | null => {
    const editor = opEditorRegistry.get(opId)
    if (!editor || editor.isDestroyed) {
        opEditorRegistry.delete(opId)
        return null
    }
    const storage = (editor.storage as any).operationRecorder as OperationRecorderStorage | undefined
    const op = storage?.get(opId)
    return op ? { op, editor } : null
}

/** Roll back a recorded op on whichever editor recorded it. */
export const rollbackRecordedOperation = (opId: string): OperationRollbackResult | null => {
    const entry = getRecordedOperation(opId)
    if (!entry) return null
    return ((entry.editor.storage as any).operationRecorder as OperationRecorderStorage).rollback(opId)
}

// ─── Extension ───────────────────────────────────────────────────────

/** Memory bound per editor; evicted ops read as expired downstream. */
const MAX_RECORDED_OPS = 100

let opCounter = 0

/**
 * OperationRecorder — a unified, editor-level record of document operations
 * with block-level before/after snapshots and selective rollback.
 *
 * Recording is window-based: a consumer (the AI chat) calls
 * `storage.operationRecorder.begin(label)` before a unit of work and `end()`
 * after it. Read-only windows cost one doc-reference comparison; mutating
 * windows diff the top-level blocks of the two immutable doc snapshots, so
 * any edit source (builtin tools, plugin tools, manual code paths) is
 * captured without a tool-name allowlist.
 */
export const OperationRecorder = Extension.create<Record<string, never>, OperationRecorderStorage>({
    name: 'operationRecorder',

    addStorage() {
        return {
            ops: [],
            begin: () => {},
            end: () => null,
            cancel: () => {},
            rollback: () => null,
            get: () => undefined,
            clear: () => {},
        }
    },

    onCreate() {
        const editor = this.editor
        const storage = this.storage
        // The open recording window. Single and non-nested: agent tool calls
        // execute sequentially, and a stray `begin` closes the previous one.
        let recording: { label: string; doc: ProseMirrorNode } | null = null

        const finish = (label?: string): EditorOperation | null => {
            const win = recording
            recording = null
            if (!win) return null
            const beforeDoc = win.doc
            const afterDoc = editor.state.doc
            if (beforeDoc === afterDoc) return null
            const changes = diffTopBlocks(beforeDoc, afterDoc)
            if (changes.length === 0) return null
            const op: EditorOperation = {
                id: `op-${Date.now().toString(36)}-${++opCounter}`,
                label: label ?? win.label,
                timestamp: Date.now(),
                changes,
                reverted: false,
            }
            storage.ops.push(op)
            while (storage.ops.length > MAX_RECORDED_OPS) {
                const dropped = storage.ops.shift()
                if (dropped) opEditorRegistry.delete(dropped.id)
            }
            opEditorRegistry.set(op.id, editor)
            return op
        }

        storage.begin = (label: string) => {
            if (recording) finish()
            recording = { label, doc: editor.state.doc }
        }
        storage.end = (label?: string) => finish(label)
        storage.cancel = () => {
            recording = null
        }
        storage.get = (opId: string) => storage.ops.find(o => o.id === opId)
        storage.clear = () => {
            for (const op of storage.ops) opEditorRegistry.delete(op.id)
            storage.ops = []
            recording = null
        }
        storage.rollback = (opId: string): OperationRollbackResult | null => {
            const op = storage.get(opId)
            if (!op) return null
            if (op.reverted) return { applied: 0, skipped: 0 }
            const result = applyInverseChanges(editor, op.changes)
            if (result.applied > 0) op.reverted = true
            return result
        }
    },

    onDestroy() {
        for (const op of this.storage.ops) opEditorRegistry.delete(op.id)
    },
})
