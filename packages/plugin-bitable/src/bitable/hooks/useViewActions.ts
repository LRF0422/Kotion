import { useState, useCallback, RefObject } from "react";
import { NodeViewProps } from "@kn/editor";
import { useTranslation } from "@kn/common";
import {
    BitableAttrs,
    ViewType,
    ViewConfig,
    ChartType,
} from "../../types";
import { generateViewId } from "../../utils/id";
import { getViewTypeName } from "../fields/fieldIcons";
import type { ActionDeps } from "./useRecordActions";

/**
 * View CRUD operations + view-tab inline editing state.
 */
export function useViewActions(
    deps: ActionDeps,
    currentViewId: string,
    setCurrentViewId: (id: string) => void
) {
    const { attrsRef, updateAttributes } = deps;
    const { t } = useTranslation();

    // ---- View-tab editing state ----
    const [editingViewId, setEditingViewId] = useState<string | null>(null);
    const [editingViewName, setEditingViewName] = useState("");
    const [deleteViewId, setDeleteViewId] = useState<string | null>(null);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

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
        [attrsRef, updateAttributes, t, setCurrentViewId]
    );

    const handleDeleteView = useCallback(
        (viewId: string) => {
            const newViews = attrsRef.current.views.filter((v) => v.id !== viewId);
            if (newViews.length === 0) return;
            const newCurrentView = currentViewId === viewId ? newViews[0]!.id : currentViewId;
            setCurrentViewId(newCurrentView);
            updateAttributes({ views: newViews, currentView: newCurrentView });
        },
        [attrsRef, currentViewId, updateAttributes, setCurrentViewId]
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
    }, [editingViewId, editingViewName, attrsRef, updateAttributes]);

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
        [attrsRef, updateAttributes]
    );

    const handleReorderViews = useCallback(
        (newOrder: ViewConfig[]) => {
            updateAttributes({ views: newOrder });
        },
        [updateAttributes]
    );

    const handleDuplicateView = useCallback(
        (viewId: string) => {
            const { views } = attrsRef.current;
            const sourceView = views.find((v) => v.id === viewId);
            if (!sourceView) return;
            const newView: ViewConfig = {
                ...sourceView,
                id: generateViewId(),
                name: `${sourceView.name} (copy)`,
            };
            const sourceIndex = views.findIndex((v) => v.id === viewId);
            const newViews = [
                ...views.slice(0, sourceIndex + 1),
                newView,
                ...views.slice(sourceIndex + 1),
            ];
            updateAttributes({ views: newViews, currentView: newView.id });
            setCurrentViewId(newView.id);
        },
        [attrsRef, updateAttributes, setCurrentViewId]
    );

    return {
        editingViewId,
        editingViewName,
        deleteViewId,
        showDeleteDialog,
        handleAddView,
        handleDeleteView,
        handleUpdateView,
        handleReorderViews,
        handleDuplicateView,
        openDeleteDialog,
        confirmDeleteView,
        startEditingView,
        saveViewName,
        cancelEditingView,
        setShowDeleteDialog,
        setEditingViewName,
    };
}
