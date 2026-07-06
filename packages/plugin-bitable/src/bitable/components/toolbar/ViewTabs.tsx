/**
 * View tabs — Notion-style tab bar with drag reorder, right-click context menu,
 * and inline rename.
 *
 * Interactions:
 * - Single-click to switch view
 * - Right-click for context menu (Rename, Duplicate, Delete)
 * - Drag tabs to reorder (react-dnd)
 * - Active tab has bottom border accent line
 * - Inline editing when editingViewId matches
 * - "+" button at end for adding views
 */
import React, { useState, useCallback, useRef, useEffect } from "react";
import { useDrag, useDrop } from "react-dnd";
import { Input } from "@kn/ui";
import { ChevronLeft, ChevronRight, Check, X } from "@kn/icon";
import { useTranslation } from "@kn/common";
import { ViewConfig } from "../../../types";
import { getViewIcon } from "../../fields/fieldIcons";
import { ContextMenu, type ContextMenuEntry } from "../ContextMenu";
import { AddViewMenu } from "./AddViewMenu";

const VIEW_TAB_TYPE = "view-tab";

interface DragItem {
    index: number;
    id: string;
}

interface ViewTabsProps {
    views: ViewConfig[];
    currentViewId: string;
    onSelectView: (viewId: string) => void;
    editorEditable: boolean;
    editingViewId: string | null;
    editingViewName: string;
    onStartEditingView: (viewId: string, name: string) => void;
    onSaveViewName: () => void;
    onCancelEditingView: () => void;
    onEditingViewNameChange: (name: string) => void;
    onOpenDeleteDialog: (viewId: string) => void;
    onAddView: (type: import("../../../types").ViewType) => void;
    onReorderViews: (newOrder: ViewConfig[]) => void;
    onDuplicateView?: (viewId: string) => void;
}

/** Single view tab with drag/drop for reordering. */
const ViewTab: React.FC<{
    view: ViewConfig;
    index: number;
    isActive: boolean;
    isEditing: boolean;
    editorEditable: boolean;
    editingViewName: string;
    onSelect: () => void;
    onStartEdit: () => void;
    onSaveName: () => void;
    onCancelEdit: () => void;
    onNameChange: (name: string) => void;
    onContextMenu: () => void;
    onReorder: (dragIndex: number, hoverIndex: number) => void;
}> = ({
    view,
    index,
    isActive,
    isEditing,
    editorEditable,
    editingViewName,
    onSelect,
    onStartEdit,
    onSaveName,
    onCancelEdit,
    onNameChange,
    onReorder,
}) => {
    const ref = useRef<HTMLDivElement>(null);

    const [{ isDragging }, drag] = useDrag<
        DragItem,
        void,
        { isDragging: boolean }
    >(() => ({
        type: VIEW_TAB_TYPE,
        item: { index, id: view.id },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
    }), [index, view.id]);

    const [, drop] = useDrop<DragItem>(() => ({
        accept: VIEW_TAB_TYPE,
        hover: (item: DragItem, monitor) => {
            if (!ref.current) return;
            const dragIndex = item.index;
            const hoverIndex = index;
            if (dragIndex === hoverIndex) return;
            const hoverRect = ref.current.getBoundingClientRect();
            const hoverMiddleX = (hoverRect.right - hoverRect.left) / 2;
            const clientOffset = monitor.getClientOffset();
            if (!clientOffset) return;
            const hoverClientX = clientOffset.x - hoverRect.left;
            if (dragIndex < hoverIndex && hoverClientX < hoverMiddleX) return;
            if (dragIndex > hoverIndex && hoverClientX > hoverMiddleX) return;
            onReorder(dragIndex, hoverIndex);
            item.index = hoverIndex;
        },
    }), [index, onReorder]);

    drag(drop(ref));

    return (
        <div
            ref={ref}
            className={`bitable-toolbar__tab${
                isActive ? " bitable-toolbar__tab--active" : ""
            }${isDragging ? " bitable-toolbar__tab--dragging" : ""}`}
            onClick={(e) => {
                if (!isEditing) onSelect();
            }}
            onDoubleClick={() => {
                if (editorEditable && isActive) onStartEdit();
            }}
            style={{ opacity: isDragging ? 0.5 : 1 }}
        >
            {getViewIcon(view.type)}
            {isEditing ? (
                <div
                    className="bitable-toolbar__tab-edit"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Input
                        value={editingViewName}
                        onChange={(e) => onNameChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") onSaveName();
                            else if (e.key === "Escape") onCancelEdit();
                        }}
                        onBlur={onSaveName}
                        autoFocus
                        className="h-6 w-32 px-2 text-sm"
                    />
                    <button
                        className="bitable-toolbar__tab-edit-confirm"
                        onClick={(e) => {
                            e.stopPropagation();
                            onSaveName();
                        }}
                    >
                        <Check className="h-3 w-3" />
                    </button>
                    <button
                        className="bitable-toolbar__tab-edit-cancel"
                        onClick={(e) => {
                            e.stopPropagation();
                            onCancelEdit();
                        }}
                    >
                        <X className="h-3 w-3" />
                    </button>
                </div>
            ) : (
                <span>{view.name}</span>
            )}
        </div>
    );
};

export const ViewTabs: React.FC<ViewTabsProps> = ({
    views,
    currentViewId,
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
    onSelectView,
}) => {
    const { t } = useTranslation();
    const viewTabsRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const checkScrollState = useCallback(() => {
        const container = viewTabsRef.current;
        if (container) {
            setCanScrollLeft(container.scrollLeft > 0);
            setCanScrollRight(
                container.scrollLeft < container.scrollWidth - container.clientWidth - 1
            );
        }
    }, []);

    useEffect(() => {
        checkScrollState();
        const container = viewTabsRef.current;
        if (container) {
            container.addEventListener("scroll", checkScrollState);
            const resizeObserver = new ResizeObserver(checkScrollState);
            resizeObserver.observe(container);
            return () => {
                container.removeEventListener("scroll", checkScrollState);
                resizeObserver.disconnect();
            };
        }
    }, [checkScrollState, views.length]);

    const scrollViewTabs = useCallback((direction: "left" | "right") => {
        const container = viewTabsRef.current;
        if (container) {
            container.scrollBy({
                left: direction === "left" ? -150 : 150,
                behavior: "smooth",
            });
        }
    }, []);

    const handleReorder = (dragIndex: number, hoverIndex: number) => {
        const items = Array.from(views);
        const [reorderedItem] = items.splice(dragIndex, 1);
        if (!reorderedItem) return;
        items.splice(hoverIndex, 0, reorderedItem);
        onReorderViews(items);
    };

    const buildContextMenu = (view: ViewConfig): ContextMenuEntry[] => {
        const items: ContextMenuEntry[] = [
            {
                label: t("bitable.actions.renameView"),
                onClick: () => onStartEditingView(view.id, view.name),
            },
        ];
        if (onDuplicateView) {
            items.push({
                label: t("bitable.actions.duplicateView", "Duplicate"),
                onClick: () => onDuplicateView(view.id),
            });
        }
        if (views.length > 1) {
            items.push({ separator: true });
            items.push({
                label: t("bitable.actions.deleteView"),
                danger: true,
                onClick: () => onOpenDeleteDialog(view.id),
            });
        }
        return items;
    };

    return (
        <div className="bitable-toolbar__tabs">
            {canScrollLeft && (
                <button
                    className="bitable-toolbar__action"
                    onClick={() => scrollViewTabs("left")}
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>
            )}

            <div
                ref={viewTabsRef}
                className="bitable-toolbar__tabs-scroll"
            >
                {views.map((view, index) => {
                    const tab = (
                        <ViewTab
                            key={view.id}
                            view={view}
                            index={index}
                            isActive={currentViewId === view.id}
                            isEditing={editingViewId === view.id}
                            editorEditable={editorEditable}
                            editingViewName={editingViewName}
                            onSelect={() => {
                                if (editingViewId !== view.id) {
                                    onSelectView(view.id);
                                }
                            }}
                            onStartEdit={() =>
                                onStartEditingView(view.id, view.name)
                            }
                            onSaveName={onSaveViewName}
                            onCancelEdit={onCancelEditingView}
                            onNameChange={onEditingViewNameChange}
                            onContextMenu={() => {}}
                            onReorder={handleReorder}
                        />
                    );

                    // Wrap with context menu for right-click
                    return (
                        <ContextMenu key={view.id} items={buildContextMenu(view)}>
                            {tab}
                        </ContextMenu>
                    );
                })}

                {editorEditable && <AddViewMenu onAddView={onAddView} />}
            </div>

            {canScrollRight && (
                <button
                    className="bitable-toolbar__action"
                    onClick={() => scrollViewTabs("right")}
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
            )}
        </div>
    );
};
