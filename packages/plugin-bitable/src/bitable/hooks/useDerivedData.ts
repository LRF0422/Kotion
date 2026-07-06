import { useMemo } from "react";
import { BitableAttrs, RecordData, ViewConfig } from "../../types";
import { applyFilters, applySorts, applyGroups } from "../../utils/dataProcessing";

/**
 * Derived data computations: filtered, sorted, and grouped records.
 */
export function useDerivedData(
    data: RecordData[],
    currentView: ViewConfig | undefined,
    fields: BitableAttrs["fields"]
) {
    const processedData = useMemo(() => {
        let result = data;
        if (currentView?.filters?.length) {
            result = applyFilters(result, currentView.filters, fields, currentView.filterLogic);
        }
        if (currentView?.sorts?.length) {
            result = applySorts(result, currentView.sorts, fields);
        }
        return result;
    }, [data, currentView?.filters, currentView?.filterLogic, currentView?.sorts, fields]);

    const groupedData = useMemo(() => {
        if (!currentView?.groups?.length) return undefined;
        return applyGroups(processedData, currentView.groups, fields);
    }, [processedData, currentView?.groups, fields]);

    return { processedData, groupedData };
}
