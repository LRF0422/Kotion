import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useDebounce } from "ahooks";
import { NodeViewProps, NodeViewWrapper } from "@kn/editor";
import { useSelector, GlobalState, useTranslation } from "@kn/common";
import { useResolvedTheme, cn } from "@kn/ui";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@kn/ui";
import { BitableAttrs, ViewType, RecordData, Person } from "../types";
import { TableView } from "./views/TableView";
import { KanbanView } from "./views/KanbanView";
import { GalleryView } from "./views/GalleryView";
import { TimelineView } from "./views/TimelineView";
import { CalendarView } from "./views/CalendarView";
import { ChartView } from "./views/ChartView";
import { FormView } from "./views/FormView";
import { FieldConfigPanel } from "./components/FieldConfigPanel";
import { ExcelImportDialog } from "./components/ExcelImportDialog";
import { BitableToolbar } from "./components/BitableToolbar";
import { ViewConfigChips } from "./components/toolbar";
import { RecordDetailDrawer } from "./components/RecordDetailDrawer";
import { useBitableActions } from "./hooks/useBitableActions";
import { normalizeRecordIdentity } from "../utils/recordIdentity";

export const BitableView: React.FC<NodeViewProps> = (props) => {
    const { node, updateAttributes, deleteNode, editor } = props;
    const rawAttrs = node.attrs as BitableAttrs;
    const identityNormalization = useMemo(
        () => normalizeRecordIdentity(rawAttrs.fields, rawAttrs.views, rawAttrs.data || []),
        [rawAttrs.fields, rawAttrs.views, rawAttrs.data]
    );
    const attrs = useMemo<BitableAttrs>(
        () =>
            identityNormalization.changed
                ? {
                      ...rawAttrs,
                      fields: identityNormalization.fields,
                      views: identityNormalization.views,
                      data: identityNormalization.data,
                  }
                : rawAttrs,
        [rawAttrs, identityNormalization]
    );
    const { t } = useTranslation();
    const resolvedTheme = useResolvedTheme();

    useEffect(() => {
        if (!identityNormalization.changed) return;
        updateAttributes({
            fields: identityNormalization.fields,
            views: identityNormalization.views,
            data: identityNormalization.data,
        });
    }, [identityNormalization, updateAttributes]);

    // Current user (for created_by / updated_by)
    const userInfo = useSelector((s: GlobalState) => s.userInfo);
    const currentPerson = useMemo<Person | undefined>(() => {
        if (!userInfo) return undefined;
        const id = userInfo.id || userInfo.account || userInfo.email;
        if (!id) return undefined;
        return {
            id,
            name: userInfo.name || userInfo.account || userInfo.email || id,
            avatar: userInfo.avatar,
            email: userInfo.email,
        };
    }, [userInfo]);

    // Dialog states
    const [fieldConfigOpen, setFieldConfigOpen] = useState(false);
    const [excelImportOpen, setExcelImportOpen] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState<RecordData | null>(null);
    const [searchText, setSearchText] = useState("");
    // Filtering walks every record × field, so keep it off the keystroke path.
    const debouncedSearchText = useDebounce(searchText, { wait: 200 });
    const [currentViewId, setCurrentViewId] = useState(attrs.currentView);

    const actions = useBitableActions(
        attrs,
        updateAttributes,
        selectedRecord,
        setSelectedRecord,
        currentViewId,
        setCurrentViewId
    );

    // Keep the hook's person ref in sync
    React.useEffect(() => {
        actions.setCurrentPerson(currentPerson);
    }, [currentPerson, actions.setCurrentPerson]);

    const handleSelectView = useCallback(
        (viewId: string) => {
            if (actions.editingViewId !== viewId) {
                setCurrentViewId(viewId);
                updateAttributes({ currentView: viewId });
            }
        },
        [actions.editingViewId, updateAttributes]
    );

    const handleRecordClick = useCallback((record: RecordData) => {
        setSelectedRecord(record);
    }, []);

    const handleCloseRecordDetail = useCallback(() => {
        setSelectedRecord(null);
    }, []);

    const recordIds = useMemo(
        () => actions.processedData.map((r) => r.id),
        [actions.processedData]
    );

    const handleNavigateRecord = useCallback(
        (recordId: string) => {
            const rec = actions.processedData.find((r) => r.id === recordId);
            if (rec) setSelectedRecord(rec);
        },
        [actions.processedData]
    );

    // View routing — memoized so the (expensive) view subtrees can bail out of
    // re-renders triggered by unrelated state such as dialogs or the toolbar.
    const viewProps = useMemo(
        () => ({
            view: actions.currentView,
            fields: attrs.fields,
            data: actions.processedData,
            onAddRecord: actions.handleAddRecord,
            onDuplicateRecord: actions.handleDuplicateRecord,
            onCreateRecord: actions.handleCreateRecord,
            onUpdateRecord: actions.handleUpdateRecord,
            onBatchUpdateRecords: actions.handleBatchUpdateRecords,
            onDeleteRecord: actions.handleDeleteRecord,
            onAddField: actions.handleAddField,
            onUpdateField: actions.handleUpdateField,
            onDeleteField: actions.handleDeleteField,
            onUpdateView: actions.handleUpdateView,
            editable: editor.isEditable,
            editor: editor,
            onRecordClick: handleRecordClick,
        }),
        [
            actions.currentView,
            attrs.fields,
            actions.processedData,
            actions.handleAddRecord,
            actions.handleDuplicateRecord,
            actions.handleCreateRecord,
            actions.handleUpdateRecord,
            actions.handleBatchUpdateRecords,
            actions.handleDeleteRecord,
            actions.handleAddField,
            actions.handleUpdateField,
            actions.handleDeleteField,
            actions.handleUpdateView,
            editor,
            editor.isEditable,
            handleRecordClick,
        ]
    );

    const renderViewContent = () => {
        switch (actions.currentView?.type) {
            case ViewType.TABLE:
                return <TableView {...viewProps} searchText={debouncedSearchText} groups={actions.groupedData} />;
            case ViewType.KANBAN:
                return <KanbanView {...viewProps} />;
            case ViewType.GALLERY:
                return <GalleryView {...viewProps} />;
            case ViewType.TIMELINE:
                return <TimelineView {...viewProps} />;
            case ViewType.CALENDAR:
                return <CalendarView {...viewProps} />;
            case ViewType.CHART:
                return <ChartView {...viewProps} />;
            case ViewType.FORM:
                return (
                    <FormView
                        view={actions.currentView}
                        fields={attrs.fields}
                        editable={editor.isEditable}
                        onCreateRecord={actions.handleCreateRecord}
                    />
                );
            default:
                return <TableView {...viewProps} searchText={debouncedSearchText} groups={actions.groupedData} />;
        }
    };

    return (
        <NodeViewWrapper className="node-bitable-wrapper">
            <div className={cn("bitable bitable-container", resolvedTheme === "dark" && "bitable--dark")}>
                <BitableToolbar
                    views={attrs.views}
                    currentViewId={currentViewId}
                    onSelectView={handleSelectView}
                    editorEditable={editor.isEditable}
                    editingViewId={actions.editingViewId}
                    editingViewName={actions.editingViewName}
                    onStartEditingView={actions.startEditingView}
                    onSaveViewName={actions.saveViewName}
                    onCancelEditingView={actions.cancelEditingView}
                    onEditingViewNameChange={actions.setEditingViewName}
                    onOpenDeleteDialog={actions.openDeleteDialog}
                    onAddView={actions.handleAddView}
                    onReorderViews={actions.handleReorderViews}
                    onDuplicateView={actions.handleDuplicateView}
                    onAddRecord={actions.handleAddRecord}
                    onExport={actions.handleExport}
                    onOpenFieldConfig={() => setFieldConfigOpen(true)}
                    onOpenExcelImport={() => setExcelImportOpen(true)}
                    onDeleteNode={deleteNode}
                    currentView={actions.currentView}
                    fields={attrs.fields}
                    onUpdateView={actions.handleUpdateView}
                    searchText={searchText}
                    onSearchChange={setSearchText}
                />

                {/* View config chips (filters/sorts/groups) */}
                <ViewConfigChips
                    view={actions.currentView}
                    fields={attrs.fields}
                    onUpdateView={actions.handleUpdateView}
                />

                {/* View content */}
                <div className="bitable-content">{renderViewContent()}</div>

                {/* Bottom stats */}
                <div className="bitable-footer">
                    <span>{t("bitable.stats.totalRecords", { count: actions.data.length })}</span>
                </div>
            </div>

            {/* Field config panel */}
            <FieldConfigPanel
                open={fieldConfigOpen}
                onOpenChange={setFieldConfigOpen}
                fields={attrs.fields}
                onUpdateField={actions.handleUpdateField}
                onDeleteField={actions.handleDeleteField}
                onAddField={actions.handleAddField}
                onReorderFields={actions.handleReorderFields}
                onConvertFieldType={actions.handleConvertFieldType}
            />

            {/* Excel import dialog */}
            <ExcelImportDialog
                open={excelImportOpen}
                onOpenChange={setExcelImportOpen}
                fields={attrs.fields}
                onImport={actions.handleExcelImport}
            />

            {/* Delete view confirmation */}
            <AlertDialog open={actions.showDeleteDialog} onOpenChange={actions.setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("bitable.dialog.deleteViewTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("bitable.dialog.deleteViewDescription")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => actions.setShowDeleteDialog(false)}>
                            {t("bitable.dialog.cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={actions.confirmDeleteView}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {t("bitable.dialog.delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Record detail drawer */}
            <RecordDetailDrawer
                open={selectedRecord !== null}
                record={selectedRecord}
                fields={attrs.fields}
                recordIds={recordIds}
                onClose={handleCloseRecordDetail}
                onNavigate={handleNavigateRecord}
                onUpdateRecord={actions.handleUpdateRecord}
                editable={editor.isEditable}
            />
        </NodeViewWrapper>
    );
};
