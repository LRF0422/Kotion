/**
 * BitableToolbar — main composition shell.
 * Delegates to ViewTabs, ToolbarActions.
 * Uses bitable.css classes for styling.
 */
import React from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { ViewType, ViewConfig } from "../../types";
import { ViewTabs } from "./toolbar";
import { ToolbarActions } from "./toolbar";

export interface BitableToolbarProps {
    views: ViewConfig[];
    currentViewId: string;
    onSelectView: (viewId: string) => void;
    editorEditable: boolean;
    /** View-tab editing helpers */
    editingViewId: string | null;
    editingViewName: string;
    onStartEditingView: (viewId: string, name: string) => void;
    onSaveViewName: () => void;
    onCancelEditingView: () => void;
    onEditingViewNameChange: (name: string) => void;
    onOpenDeleteDialog: (viewId: string) => void;
    /** Add-view */
    onAddView: (type: ViewType) => void;
    /** Reorder views */
    onReorderViews: (newOrder: ViewConfig[]) => void;
    /** Duplicate view */
    onDuplicateView?: (viewId: string) => void;
    /** Actions */
    onAddRecord: () => void;
    onExport: (fmt: "csv" | "excel") => void;
    onOpenFieldConfig: () => void;
    onOpenExcelImport: () => void;
    onDeleteNode: () => void;
    /** Current view for sort/filter/group panels */
    currentView: ViewConfig;
    fields: any[];
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
    /** Search */
    searchText: string;
    onSearchChange: (text: string) => void;
}

export const BitableToolbar: React.FC<BitableToolbarProps> = (props) => {
    const {
        views,
        currentViewId,
        onSelectView,
        editorEditable,
        editingViewId,
        editingViewName,
        onStartEditingView,
        onSaveViewName,
        onCancelEditingView,
        onEditingViewNameChange,
        onOpenDeleteDialog,
        onAddView,
        onReorderViews,
        onDuplicateView,
        onAddRecord,
        onExport,
        onOpenFieldConfig,
        onOpenExcelImport,
        onDeleteNode,
        currentView,
        fields,
        onUpdateView,
        searchText,
        onSearchChange,
    } = props;

    return (
        <DndProvider backend={HTML5Backend}>
            <div className="bitable-toolbar">
                {/* Left: view tabs */}
                <ViewTabs
                    views={views}
                    currentViewId={currentViewId}
                    onSelectView={onSelectView}
                    editorEditable={editorEditable}
                    editingViewId={editingViewId}
                    editingViewName={editingViewName}
                    onStartEditingView={onStartEditingView}
                    onSaveViewName={onSaveViewName}
                    onCancelEditingView={onCancelEditingView}
                    onEditingViewNameChange={onEditingViewNameChange}
                    onOpenDeleteDialog={onOpenDeleteDialog}
                    onAddView={onAddView}
                    onReorderViews={onReorderViews}
                    onDuplicateView={onDuplicateView}
                />

                {/* Right: action buttons */}
                <ToolbarActions
                    editorEditable={editorEditable}
                    onOpenFieldConfig={onOpenFieldConfig}
                    onOpenExcelImport={onOpenExcelImport}
                    onExport={onExport}
                    onAddRecord={onAddRecord}
                    onDeleteNode={onDeleteNode}
                    currentView={currentView}
                    fields={fields}
                    onUpdateView={onUpdateView}
                    searchText={searchText}
                    onSearchChange={onSearchChange}
                />
            </div>
        </DndProvider>
    );
};
