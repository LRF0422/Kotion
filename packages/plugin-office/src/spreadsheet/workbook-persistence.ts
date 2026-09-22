/**
 * Orchestrates a save into the workbook store.
 *
 * Kept apart from workbook-store.ts so that module stays free of runtime
 * relative imports (and therefore Node-testable). This file ties the pure diff
 * to the store and is exercised through the browser/adaptor smoke instead.
 */
import { diffWorkbook } from './workbook-diff'
import {
    applyWorkbookDiff,
    clearWorkbook,
    countDeltaKeys,
    DELTA_COMPACT_THRESHOLD,
    hasWorkbook,
    seedWorkbook,
    type StoreDoc,
} from './workbook-store'
import type { WorkbookData } from './workbook-data'

/**
 * Persist the live workbook, choosing the cheapest correct operation.
 *
 * - first write (or a sheet added/removed/reordered): write one snapshot value;
 * - ordinary edits: write only the changed cells as delta entries;
 * - once the delta grows past {@link DELTA_COMPACT_THRESHOLD}: fold it back into
 *   a fresh snapshot so loading stays a single decode.
 */
export function storeWorkbook(
    doc: StoreDoc,
    ref: string,
    previous: WorkbookData | null,
    next: WorkbookData,
): number {
    if (!hasWorkbook(doc, ref)) {
        seedWorkbook(doc, ref, next)
        return 1
    }
    const diff = diffWorkbook(previous, next)
    if (diff.structureChanged) {
        clearWorkbook(doc, ref)
        seedWorkbook(doc, ref, next)
        return 1
    }
    const operations = applyWorkbookDiff(doc, ref, diff)
    if (countDeltaKeys(doc, ref) >= DELTA_COMPACT_THRESHOLD) {
        seedWorkbook(doc, ref, next)
    }
    return operations
}
