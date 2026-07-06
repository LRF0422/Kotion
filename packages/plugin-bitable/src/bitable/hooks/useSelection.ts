import { useState, useCallback } from "react";

/**
 * Row selection state with Shift+click range selection support.
 * Works with react-data-grid's selectedRows API (Set<string>).
 */
export function useSelection() {
    const [selectedRows, setSelectedRows] = useState<ReadonlySet<string>>(new Set());
    const [lastSelectedRowId, setLastSelectedRowId] = useState<string | null>(null);

    const toggleRow = useCallback((rowId: string) => {
        setSelectedRows((prev) => {
            const next = new Set(prev);
            if (next.has(rowId)) {
                next.delete(rowId);
            } else {
                next.add(rowId);
            }
            return next;
        });
        setLastSelectedRowId(rowId);
    }, []);

    const selectRange = useCallback(
        (fromId: string, toId: string, allRowIds: string[]) => {
            const fromIdx = allRowIds.indexOf(fromId);
            const toIdx = allRowIds.indexOf(toId);
            if (fromIdx === -1 || toIdx === -1) return;
            const [start, end] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
            const rangeIds = allRowIds.slice(start, end + 1);
            setSelectedRows(new Set(rangeIds));
            setLastSelectedRowId(toId);
        },
        []
    );

    const handleRowClick = useCallback(
        (rowId: string, shiftKey: boolean, allRowIds: string[]) => {
            if (shiftKey && lastSelectedRowId) {
                selectRange(lastSelectedRowId, rowId, allRowIds);
            } else {
                toggleRow(rowId);
            }
        },
        [lastSelectedRowId, selectRange, toggleRow]
    );

    const clearSelection = useCallback(() => {
        setSelectedRows(new Set());
        setLastSelectedRowId(null);
    }, []);

    const selectAll = useCallback((rowIds: string[]) => {
        setSelectedRows(new Set(rowIds));
    }, []);

    return {
        selectedRows,
        setSelectedRows,
        lastSelectedRowId,
        toggleRow,
        selectRange,
        handleRowClick,
        clearSelection,
        selectAll,
    };
}
