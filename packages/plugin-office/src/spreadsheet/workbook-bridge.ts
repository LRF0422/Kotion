/**
 * Editor <-> workbook-store bridge.
 *
 * The store itself is editor-agnostic; this is the only place that knows how to
 * reach the shared Y.Doc from an editor. Kept apart so tools.ts and
 * SpreadsheetView can share it without duplicating the runtime lookup.
 */
import { getCollaborationRuntime, type Editor } from '@kn/editor'
import type { WorkbookData } from './workbook-data'
import { loadWorkbook, type StoreDoc } from './workbook-store'
import { storeWorkbook } from './workbook-persistence'

/**
 * Read the collaboration runtime defensively.
 *
 * A host whose @kn/editor build predates CollaborationRuntime (or an editor
 * without the extension) must degrade to the legacy attribute path rather than
 * throwing inside a node view.
 */
function runtimeFor(editor: Editor): ReturnType<typeof getCollaborationRuntime> {
    try {
        if (typeof getCollaborationRuntime !== 'function') return undefined
        return getCollaborationRuntime(editor)
    } catch {
        return undefined
    }
}

/** The shared document that backs L3 storage, when collaboration is active. */
export function workbookStoreFor(editor: Editor): StoreDoc | undefined {
    const document = runtimeFor(editor)?.document
    return document ? (document as unknown as StoreDoc) : undefined
}

/** The collaboration provider, so callers can wait for the initial sync. */
export function workbookProviderFor(editor: Editor) {
    return runtimeFor(editor)?.provider
}

/** True when this editor has the collaboration runtime L3 storage needs. */
export function hasWorkbookStore(editor: Editor): boolean {
    return workbookStoreFor(editor) !== undefined
}

/** Read a stored workbook by node ref, or null when unavailable/absent. */
export function loadStoredWorkbook(doc: StoreDoc | undefined, ref: unknown): WorkbookData | null {
    if (!doc || typeof ref !== 'string' || ref.length === 0) return null
    try {
        return loadWorkbook(doc, ref)
    } catch {
        return null
    }
}

/**
 * Persist a whole workbook produced outside the live grid (AI tools).
 *
 * Returns false when there is no store (legacy documents keep using the node
 * attribute). The caller is responsible for bumping `workbookRevision` so a
 * mounted view picks the change up.
 */
export function persistStoredWorkbook(
    doc: StoreDoc | undefined,
    ref: unknown,
    next: WorkbookData,
): boolean {
    if (!doc || typeof ref !== 'string' || ref.length === 0) return false
    try {
        const previous = loadWorkbook(doc, ref)
        storeWorkbook(doc, ref, previous, next)
        return true
    } catch (error) {
        console.error('[office/spreadsheet] failed to write the workbook store', error)
        return false
    }
}
