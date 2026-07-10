import React from "react";
import { createPortal } from "react-dom";
import { useDragLayer } from "react-dnd";
import { useResolvedTheme } from "@kn/ui";

import { KanbanItemTypes, type KanbanDragItem, type KanbanColumnDragItem } from "./draggable-card";

export function KanbanDragLayer() {
    const resolvedTheme = useResolvedTheme();
    const { isDragging, item, itemType, currentOffset, initialOffset, initialClientOffset } =
        useDragLayer((monitor) => ({
            item: monitor.getItem() as KanbanDragItem | KanbanColumnDragItem | null,
            itemType: monitor.getItemType(),
            isDragging: monitor.isDragging(),
            currentOffset: monitor.getClientOffset(),
            initialOffset: monitor.getInitialSourceClientOffset(),
            initialClientOffset: monitor.getInitialClientOffset(),
        }));

    if (!isDragging || !item || !currentOffset || !initialOffset || !initialClientOffset) {
        return null;
    }

    const offsetX = initialClientOffset.x - initialOffset.x;
    const offsetY = initialClientOffset.y - initialOffset.y;

    const themeClass = resolvedTheme === "dark" ? "bitable bitable--dark" : "bitable";

    const layerStyles: React.CSSProperties = {
        position: "fixed",
        pointerEvents: "none",
        zIndex: 1000,
        left: currentOffset.x - offsetX,
        top: currentOffset.y - offsetY,
    };

    let preview: React.ReactNode;

    if (itemType === KanbanItemTypes.COLUMN) {
        const colItem = item as KanbanColumnDragItem;
        preview = (
            <div style={layerStyles} className={themeClass}>
                <div
                    className="bitable-kanban__column-drag-preview"
                    style={{ width: colItem.width, height: colItem.height }}
                />
            </div>
        );
    } else {
        const cardItem = item as KanbanDragItem;
        preview = (
            <div style={layerStyles} className={themeClass}>
                <div
                    className="bitable-kanban__card-drag-preview"
                    style={{ width: cardItem.width, height: cardItem.height }}
                >
                    {cardItem.children}
                </div>
            </div>
        );
    }

    return createPortal(preview, document.body);
}
