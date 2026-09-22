/**
 * Orchestrates a save into the workbook store.
 *
 * Kept apart from workbook-store.ts so that module stays free of runtime
 * relative imports (and therefore Node-testable). This file ties the pure diff
 * to the store and is exercised through the browser/adaptor smoke instead.
 */
import { diffWorkbook } from './workbook-diff'
import { applyWorkbookDiff, clearWorkbook, seedWorkbook, type StoreDoc } from './workbook-store'
import type { WorkbookData } from './workbook-data'

/**
 * Persist the live workbook, choosing the cheapest correct operation.
 *
 * A structure change (sheet added/removed/reordered) is rewritten wholesale;
 * everything else becomes a cell-level diff, so a normal edit touches a single
 * Y.Map key.
 */
export function storeWorkbook(
    doc: StoreDoc,
    ref: string,
    previous: WorkbookData | null,
    next: WorkbookData,
): number {
    const diff = diffWorkbook(previous, next)
    if (diff.structureChanged) {
        clearWorkbook(doc, ref)
        seedWorkbook(doc, ref, next)
        return 1
    }
    return applyWorkbookDiff(doc, ref, diff)
}
