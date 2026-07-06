/**
 * Toolbar action buttons — icon-only, compact, grouped.
 * Groups: [field config] | [sort | filter | group] | [search] | [import | export] | [add record] | [delete table]
 */
import React from "react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@kn/ui";
import {
    Settings,
    Upload,
    Download,
    Plus,
    Trash2,
} from "@kn/icon";
import { useTranslation } from "@kn/common";
import { SortPanel } from "../SortPanel";
import { FilterPanel } from "../FilterPanel";
import { GroupPanel } from "../GroupPanel";
import { SearchBar } from "./SearchBar";
import type { ViewConfig } from "../../../types";

interface ToolbarActionsProps {
    editorEditable: boolean;
    onOpenFieldConfig: () => void;
    onOpenExcelImport: () => void;
    onExport: (fmt: "csv" | "excel") => void;
    onAddRecord: () => void;
    onDeleteNode: () => void;
    currentView: ViewConfig;
    fields: any[];
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
    searchText: string;
    onSearchChange: (text: string) => void;
}

export const ToolbarActions: React.FC<ToolbarActionsProps> = ({
    editorEditable,
    onOpenFieldConfig,
    onOpenExcelImport,
    onExport,
    onAddRecord,
    onDeleteNode,
    currentView,
    fields,
    onUpdateView,
    searchText,
    onSearchChange,
}) => {
    const { t } = useTranslation();

    return (
        <div className="bitable-toolbar__actions">
            {/* Field config */}
            <button
                className="bitable-toolbar__action"
                onClick={onOpenFieldConfig}
                title={t("bitable.actions.fieldSettings")}
            >
                <Settings className="h-4 w-4" />
            </button>

            {/* Divider */}
            <span className="bitable-toolbar__divider" />

            {/* Sort / Filter / Group */}
            <GroupPanel view={currentView} fields={fields} onUpdateView={onUpdateView} />
            <SortPanel view={currentView} fields={fields} onUpdateView={onUpdateView} />
            <FilterPanel view={currentView} fields={fields} onUpdateView={onUpdateView} />

            {/* Divider */}
            <span className="bitable-toolbar__divider" />

            {/* Search */}
            <SearchBar searchText={searchText} onSearchChange={onSearchChange} />

            {/* Divider */}
            <span className="bitable-toolbar__divider" />

            {/* Import / Export */}
            {editorEditable && (
                <button
                    className="bitable-toolbar__action"
                    onClick={onOpenExcelImport}
                    title={t("bitable.actions.importExcel")}
                >
                    <Upload className="h-4 w-4" />
                </button>
            )}

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        className="bitable-toolbar__action"
                        title={t("bitable.actions.exportCsv", "Export")}
                    >
                        <Download className="h-4 w-4" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onExport("csv")}>
                        {t("bitable.actions.exportCsv", "Export as CSV")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onExport("excel")}>
                        {t("bitable.actions.exportExcel", "Export as Excel")}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Divider */}
            <span className="bitable-toolbar__divider" />

            {/* Add record */}
            {editorEditable && (
                <button
                    className="bitable-toolbar__action bitable-toolbar__action--primary"
                    onClick={onAddRecord}
                    title={t("bitable.actions.addRecord")}
                >
                    <Plus className="h-4 w-4" />
                </button>
            )}

            {/* Delete table */}
            {editorEditable && (
                <button
                    className="bitable-toolbar__action bitable-toolbar__action--danger"
                    onClick={onDeleteNode}
                    title={t("bitable.actions.deleteTable")}
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            )}
        </div>
    );
};
