import type { Editor } from '@kn/editor'
import type { CellValue, WorkbookData } from './workbook-data'

/**
 * Bridge between the ProseMirror node (what gets persisted) and the live grid
 * currently mounted for that node.
 *
 * Why this exists: the grid autosaves to node attributes on a throttle (see
 * SAVE_THROTTLE_MS), so `node.attrs.workbookData` can lag behind what the user
 * just typed. AI tools that read cells would return a stale snapshot, and tools
 * that wrote cells had to replace the whole workbook. Going through the live
 * grid fixes both: reads are current, writes land as a normal cell edit.
 *
 * The registry is keyed by the ProseMirror Node instance so it survives node
 * attribute updates. Nothing here is persisted; when no view is mounted the
 * tools fall back to the node attributes.
 */

export interface SpreadsheetLiveHandle {
    /** Full workbook snapshot, always current. */
    getSnapshot: () => WorkbookData | null
    /**
     * Write a rectangular block of values into a live sheet.
     * @returns the number of cells written, or null when it could not be applied
     *          (so the caller can fall back to updating the node attributes).
     */
    setRangeValues: (sheetIndex: number, startRow: number, startColumn: number, data: CellValue[][]) => number | null
    /** Whether the live grid accepts edits (mirrors the node view read-only flag). */
    isEditable: () => boolean
}

const liveHandles = new Map<Record<string, any>, SpreadsheetLiveHandle>()

export function registerSpreadsheetLive(node: Record<string, any>, handle: SpreadsheetLiveHandle): void {
    liveHandles.set(node, handle)
}

export function unregisterSpreadsheetLive(node: Record<string, any>): void {
    liveHandles.delete(node)
}

/** Live handle for a document position, or null when no view is mounted. */
export function getLiveHandle(editor: Editor, pos: number): SpreadsheetLiveHandle | null {
    const node = editor.state.doc.nodeAt(pos)
    if (!node || node.type.name !== 'spreadsheet') return null
    return liveHandles.get(node as unknown as Record<string, any>) ?? null
}

/** Live workbook data for a document position, or null when no view is mounted. */
export function getLiveWorkbookData(editor: Editor, pos: number): WorkbookData | null {
    const handle = getLiveHandle(editor, pos)
    if (!handle) return null
    try {
        return handle.getSnapshot()
    } catch {
        return null
    }
}
