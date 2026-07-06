import { useCallback } from "react";
import { FieldConfig, RecordData, ViewConfig } from "../../types";
import { exportToCSV, exportToExcel } from "../../utils/exportData";

/**
 * CSV and Excel export logic.
 */
export function useExport(
    fields: FieldConfig[],
    processedData: RecordData[],
    currentView: ViewConfig | undefined
) {
    const handleExport = useCallback(
        (fmt: "csv" | "excel") => {
            const base = (currentView?.name || "bitable").replace(/[\\/:*?"<>|]/g, "_");
            if (fmt === "csv") {
                exportToCSV(fields, processedData, currentView, `${base}.csv`);
            } else {
                exportToExcel(fields, processedData, currentView, `${base}.xlsx`);
            }
        },
        [fields, processedData, currentView]
    );

    return handleExport;
}
