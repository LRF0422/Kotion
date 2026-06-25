import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { NodeViewProps } from "@kn/editor";
import { useTranslation } from "@kn/common";
import {
    BitableAttrs,
    ViewType,
    ViewConfig,
    FieldConfig,
    RecordData,
    ChartType,
    FieldType,
    SelectOption,
    Person,
} from "../../types";
import { generateViewId } from "../../utils/id";
import { createEmptyRecord, updatedByPatch } from "../../utils/record";
import { convertFieldValue, generateSelectOptionsFromData } from "../../utils/fieldConversion";
import { applyFilters, applySorts, applyGroups } from "../../utils/dataProcessing";
import { exportToCSV, exportToExcel } from "../../utils/exportData";
import { getViewTypeName } from "../utils/viewUtils";

/**
 * Encapsulates every CRUD handler and derived data that BitableView needs.
 * Extracting this keeps BitableView.tsx focused on rendering.
 */
export function useBitableActions(
    node: NodeViewProps["node"],
    updateAttributes: NodeViewProps["updateAttributes"],
    selectedRecord: RecordData | null,
    setSelectedRecord: (r: RecordData | null) => void,
    currentViewId: string,
    setCurrentViewId: (id: string) => void
) {
    const attrs = node.attrs as BitableAttrs;
    const { t } = useTranslation();

    // Keep a ref to the latest attrs so update handlers can read current
    // data/fields/views without listing `attrs` as a dependency.
    const attrsRef = useRef(attrs);
    attrsRef.current = attrs;

    // Current user (for created_by / updated_by auto-fill)
    const currentPersonRef = useRef<Person | undefined>(undefined);
    const setCurrentPerson = useCallback((p: Person | undefined) => {
        currentPersonRef.current = p;
    }, []);

    // ---- View-tab editing state ----
    const [editingViewId, setEditingViewId] = useState<string | null>(null);
    const [editingViewName, setEditingViewName] = useState("");
    const [deleteViewId, setDeleteViewId] = useState<string | null>(null);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    // Synchronise local state with node attributes
    useEffect(() => {
        setCurrentViewId(attrs.currentView);
    }, [attrs.currentView, setCurrentViewId]);

    const data: RecordData[] = attrs.data || [];

    // ---- Current view ----
    const currentView: ViewConfig = useMemo(
        () => attrs.views.find((v) => v.id === currentViewId) || attrs.views[0],
        [attrs.views, currentViewId]
    );

    // ---- Record handlers ----
    const handleAddRecord = useCallback(() => {
        const { data: currentData = [], fields } = attrsRef.current;
        const newRecord = createEmptyRecord(fields, currentData, currentPersonRef.current);
        updateAttributes({ data: [...currentData, newRecord] });
    }, [updateAttributes]);

    const handleCreateRecord = useCallback(
        (values: Partial<RecordData>) => {
            const { data: currentData = [], fields } = attrsRef.current;
            const newRecord = { ...createEmptyRecord(fields, currentData, currentPersonRef.current), ...values };
            updateAttributes({ data: [...currentData, newRecord] });
        },
        [updateAttributes]
    );

    const handleUpdateRecord = useCallback(
        (recordId: string, updates: Partial<RecordData>) => {
            const currentData = attrsRef.current.data || [];
            const byUpdater = updatedByPatch(attrsRef.current.fields, currentPersonRef.current);
            const newData = currentData.map((record: any) =>
                record.id === recordId
                    ? { ...record, ...updates, ...byUpdater, updatedTime: new Date().toISOString() }
                    : record
            );
            updateAttributes({ data: newData });

            if (selectedRecord?.id === recordId) {
                const updatedRecord = newData.find((r: any) => r.id === recordId);
                if (updatedRecord) setSelectedRecord(updatedRecord);
            }
        },
        [updateAttributes, selectedRecord?.id, setSelectedRecord]
    );

    const handleBatchUpdateRecords = useCallback(
        (updatesMap: Map<string, Partial<RecordData>>) => {
            const currentData = attrsRef.current.data || [];
            const now = new Date().toISOString();
            const byUpdater = updatedByPatch(attrsRef.current.fields, currentPersonRef.current);
            const newData = currentData.map((record: any) => {
                const recordUpdates = updatesMap.get(record.id);
                if (recordUpdates) {
                    return { ...record, ...recordUpdates, ...byUpdater, updatedTime: now };
                }
                return record;
            });
            updateAttributes({ data: newData });
        },
        [updateAttributes]
    );

    const handleDeleteRecord = useCallback(
        (recordIds: string[]) => {
            const currentData = attrsRef.current.data || [];
            const newData = currentData.filter((record: any) => !recordIds.includes(record.id));
            updateAttributes({ data: newData });
        },
        [updateAttributes]
    );

    // ---- Field handlers ----
    const handleAddField = useCallback(
        (field: FieldConfig) => {
            const newFields = [...attrsRef.current.fields, field];
            updateAttributes({ fields: newFields });
        },
        [updateAttributes]
    );

    const handleUpdateField = useCallback(
        (fieldId: string, updates: Partial<FieldConfig>) => {
            const newFields = attrsRef.current.fields.map((field) =>
                field.id === fieldId ? { ...field, ...updates } : field
            );
            updateAttributes({ fields: newFields });
        },
        [updateAttributes]
    );

    const handleDeleteField = useCallback(
        (fieldId: string) => {
            const { data: currentData = [], fields } = attrsRef.current;
            const newFields = fields.filter((field) => field.id !== fieldId);
            const newData: RecordData[] = currentData.map((record: any) => {
                const { [fieldId]: _, ...rest } = record;
                return rest;
            }) as RecordData[];
            updateAttributes({ fields: newFields, data: newData });
        },
        [updateAttributes]
    );

    const handleReorderFields = useCallback(
        (newOrder: FieldConfig[]) => {
            updateAttributes({ fields: newOrder });
        },
        [updateAttributes]
    );

    const handleConvertFieldType = useCallback(
        (fieldId: string, newType: FieldType, newOptions?: SelectOption[]) => {
            const { data: currentData = [], fields } = attrsRef.current;
            const field = fields.find((f) => f.id === fieldId);
            if (!field) return;

            const oldType = field.type;
            const updatedField: FieldConfig = { ...field, type: newType };

            if (newType === FieldType.SELECT || newType === FieldType.MULTI_SELECT) {
                if (newOptions && newOptions.length > 0) {
                    updatedField.options = newOptions;
                } else {
                    const generatedOptions = generateSelectOptionsFromData(currentData, fieldId, oldType);
                    updatedField.options = generatedOptions.length > 0 ? generatedOptions : newOptions || [];
                }
            } else {
                delete updatedField.options;
            }

            const newFields = fields.map((f) => (f.id === fieldId ? updatedField : f));
            const newData = currentData.map((record: any) => {
                const value = record[fieldId];
                const convertedValue = convertFieldValue(value, oldType, newType, updatedField);
                return { ...record, [fieldId]: convertedValue };
            });

            updateAttributes({ fields: newFields, data: newData });
        },
        [updateAttributes]
    );

    // ---- Excel import ----
    const handleExcelImport = useCallback(
        (newFields: FieldConfig[], newRecords: RecordData[]) => {
            const { data: currentData = [], fields } = attrsRef.current;
            const mergedFields = [...fields, ...newFields];
            const idField = fields.find((f) => f.type === "id");
            const startId = currentData.length + 1;
            const recordsWithId = newRecords.map((record, index) => ({
                ...record,
                [idField?.id || "id"]: startId + index,
            }));
            const mergedData = [...currentData, ...recordsWithId];
            updateAttributes({ fields: mergedFields, data: mergedData });
        },
        [updateAttributes]
    );

    // ---- View handlers ----
    const handleAddView = useCallback(
        (viewType: ViewType) => {
            const { fields, views } = attrsRef.current;
            const newView: ViewConfig = {
                id: generateViewId(),
                name: getViewTypeName(viewType, t),
                type: viewType,
                filters: [],
                sorts: [],
                groups: [],
                hiddenFields: [],
                fieldOrder: [],
            };

            if (viewType === ViewType.KANBAN) {
                newView.kanbanConfig = {
                    groupByField: fields.find((f) => f.type === "select")?.id || fields[0]!.id,
                };
            } else if (viewType === ViewType.GALLERY) {
                newView.galleryConfig = { coverField: "", fitType: "cover", cardSize: "medium" };
            } else if (viewType === ViewType.TIMELINE) {
                newView.timelineConfig = {
                    startDateField: fields.find((f) => f.type === "date")?.id || "dueDate",
                    endDateField: undefined,
                    titleField: fields.find((f) => f.type === "text")?.id,
                    progressField: fields.find((f) => f.type === "progress")?.id,
                    groupByField: fields.find((f) => f.type === "select")?.id,
                    scaleUnit: "day",
                };
            } else if (viewType === ViewType.CALENDAR) {
                newView.calendarConfig = {
                    dateField: fields.find((f) => f.type === "date")?.id || "",
                    endDateField: undefined,
                    titleField: fields.find((f) => f.type === "text")?.id,
                };
            } else if (viewType === ViewType.CHART) {
                newView.chartConfig = {
                    chartType: ChartType.BAR,
                    xAxisField: fields.find((f) => f.type === "text" || f.type === "select")?.id || "",
                    yAxisFields: [],
                    title: "",
                    description: "",
                    showLegend: true,
                    showGrid: true,
                    aggregation: "count",
                };
            }

            const newViews = [...views, newView];
            updateAttributes({ views: newViews, currentView: newView.id });
            setCurrentViewId(newView.id);
        },
        [updateAttributes, t, setCurrentViewId]
    );

    const handleDeleteView = useCallback(
        (viewId: string) => {
            const newViews = attrsRef.current.views.filter((v) => v.id !== viewId);
            if (newViews.length === 0) return;
            const newCurrentView = currentViewId === viewId ? newViews[0]!.id : currentViewId;
            setCurrentViewId(newCurrentView);
            updateAttributes({ views: newViews, currentView: newCurrentView });
        },
        [currentViewId, updateAttributes, setCurrentViewId]
    );

    const openDeleteDialog = useCallback((viewId: string) => {
        setDeleteViewId(viewId);
        setShowDeleteDialog(true);
    }, []);

    const confirmDeleteView = useCallback(() => {
        if (deleteViewId) {
            handleDeleteView(deleteViewId);
            setShowDeleteDialog(false);
            setDeleteViewId(null);
        }
    }, [deleteViewId, handleDeleteView]);

    const startEditingView = useCallback((viewId: string, currentName: string) => {
        setEditingViewId(viewId);
        setEditingViewName(currentName);
    }, []);

    const saveViewName = useCallback(() => {
        if (editingViewId && editingViewName.trim()) {
            const newViews = attrsRef.current.views.map((v) =>
                v.id === editingViewId ? { ...v, name: editingViewName.trim() } : v
            );
            updateAttributes({ views: newViews });
        }
        setEditingViewId(null);
        setEditingViewName("");
    }, [editingViewId, editingViewName, updateAttributes]);

    const cancelEditingView = useCallback(() => {
        setEditingViewId(null);
        setEditingViewName("");
    }, []);

    const handleUpdateView = useCallback(
        (viewId: string, updates: Partial<ViewConfig>) => {
            const newViews = attrsRef.current.views.map((v) =>
                v.id === viewId ? { ...v, ...updates } : v
            );
            updateAttributes({ views: newViews });
        },
        [updateAttributes]
    );

    // ---- Derived data (must be before handleExport) ----
    const processedData = useMemo(() => {
        let result = data;
        if (currentView?.filters?.length) {
            result = applyFilters(result, currentView.filters, attrs.fields, currentView.filterLogic);
        }
        if (currentView?.sorts?.length) {
            result = applySorts(result, currentView.sorts, attrs.fields);
        }
        return result;
    }, [data, currentView?.filters, currentView?.filterLogic, currentView?.sorts, attrs.fields]);
    
    const groupedData = useMemo(() => {
        if (!currentView?.groups?.length) return undefined;
        return applyGroups(processedData, currentView.groups, attrs.fields);
    }, [processedData, currentView?.groups, attrs.fields]);
    
    // ---- Export ----
    const handleExport = useCallback(
        (fmt: "csv" | "excel") => {
            const base = (currentView?.name || "bitable").replace(/[\\\/:*?"<>|]/g, "_");
            if (fmt === "csv") {
                exportToCSV(attrs.fields, processedData, currentView, `${base}.csv`);
            } else {
                exportToExcel(attrs.fields, processedData, currentView, `${base}.xlsx`);
            }
        },
        [attrs.fields, processedData, currentView]
    );

    return {
        // state
        data,
        currentView,
        processedData,
        groupedData,
        editingViewId,
        editingViewName,
        deleteViewId,
        showDeleteDialog,
        // record actions
        handleAddRecord,
        handleCreateRecord,
        handleUpdateRecord,
        handleBatchUpdateRecords,
        handleDeleteRecord,
        // field actions
        handleAddField,
        handleUpdateField,
        handleDeleteField,
        handleReorderFields,
        handleConvertFieldType,
        handleExcelImport,
        // view actions
        handleAddView,
        handleDeleteView,
        handleUpdateView,
        handleExport,
        // view-tab editing
        openDeleteDialog,
        confirmDeleteView,
        startEditingView,
        saveViewName,
        cancelEditingView,
        setShowDeleteDialog,
        setEditingViewName,
        // person ref setter
        setCurrentPerson,
    };
}


