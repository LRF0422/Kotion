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

/** The shared document that backs L3 storage, when collaboration is active. */
export function workbookStoreFor(editor: Editor): StoreDoc | undefined {
    const runtime = getCollaborationRuntime(editor)
    const document = runtime?.document
    return document ? (document as unknown as StoreDoc) : undefined
}

/** Read a stored workbook by node ref, or null when unavailable/absent. */
export function loadStoredWorkbook(doc: StoreDoc | undefined, ref: unknown): WorkbookData | null {
    if (!doc || typeof ref !== 'string' || ref.length === 0) return null
    return loadWorkbook(doc, ref)
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
    const previous = loadWorkbook(doc, ref)
    storeWorkbook(doc, ref, previous, next)
    return true
}
