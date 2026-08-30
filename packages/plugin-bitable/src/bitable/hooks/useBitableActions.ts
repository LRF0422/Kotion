import { useMemo, useRef, useEffect } from "react";
import { NodeViewProps } from "@kn/editor";
import {
    BitableAttrs,
    RecordData,
    Person,
} from "../../types";
import type { ActionDeps } from "./useRecordActions";
import { useRecordActions } from "./useRecordActions";
import { useFieldActions } from "./useFieldActions";
import { useViewActions } from "./useViewActions";
import { useDerivedData } from "./useDerivedData";
import { useExport } from "./useExport";
import { useSelection } from "./useSelection";

/**
 * Composition root — delegates to focused hooks and returns the combined API.
 * Keeps BitableView.tsx focused on rendering.
 */
export function useBitableActions(
    attrs: BitableAttrs,
    updateAttributes: NodeViewProps["updateAttributes"],
    selectedRecord: RecordData | null,
    setSelectedRecord: (r: RecordData | null) => void,
    currentViewId: string,
    setCurrentViewId: (id: string) => void
) {
    // Keep a ref to the latest attrs so update handlers can read current
    // data/fields/views without listing `attrs` as a dependency.
    const attrsRef = useRef(attrs);
    useEffect(() => {
        attrsRef.current = attrs;
    });

    // Current person (for created-by / updated-by fields)
    const currentPersonRef = useRef<Person | undefined>(undefined);

    const deps: ActionDeps = {
        attrsRef,
        updateAttributes,
        currentPersonRef,
    };

    // Compute the current view object first (needed by derived data + export)
    const currentView = useMemo(
        () => attrs.views.find((v) => v.id === currentViewId) || attrs.views[0],
        [attrs.views, currentViewId]
    );

    // --- Derived data ---
    const { processedData, groupedData } = useDerivedData(
        attrs.data, currentView, attrs.fields
    );

    // --- Selection ---
    const selection = useSelection();

    // --- Record actions ---
    const recordActions = useRecordActions(deps, selectedRecord, setSelectedRecord);

    // --- Field actions ---
    const fieldActions = useFieldActions(deps);

    // --- View actions ---
    const viewActions = useViewActions(deps, currentViewId, setCurrentViewId);

    // --- Export ---
    const handleExport = useExport(attrs.fields, processedData, currentView);

    return {
        // data
        data: attrs.data,
        fields: attrs.fields,
        views: attrs.views,
        currentView,
        processedData,
        groupedData,
        // selection
        ...selection,
        // record actions
        ...recordActions,
        // field actions
        ...fieldActions,
        // view actions
        ...viewActions,
        // export
        handleExport,
        // person ref setter
        setCurrentPerson: (p: Person | undefined) => {
            currentPersonRef.current = p;
        },
    };
}
