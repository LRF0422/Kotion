import React from "react";
import { useDragLayer } from "react-dnd";

import { KanbanItemTypes, type KanbanDragItem, type KanbanColumnDragItem } from "./draggable-card";

export function KanbanDragLayer() {
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

    const layerStyles: React.CSSProperties = {
        position: "fixed",
        pointerEvents: "none",
        zIndex: 1000,
        left: currentOffset.x - offsetX,
        top: currentOffset.y - offsetY,
    };

    // Column drag preview
    if (itemType === KanbanItemTypes.COLUMN) {
        const colItem = item as KanbanColumnDragItem;
        return (
            <div style={layerStyles}>
                <div
                    className="bitable-kanban__column-drag-preview"
                    style={{ width: colItem.width, height: colItem.height }}
                />
            </div>
        );
    }

    // Card drag preview
    const cardItem = item as KanbanDragItem;
    return (
        <div style={layerStyles}>
            <div
                className="bitable-kanban__card-drag-preview"
                style={{ width: cardItem.width, height: cardItem.height }}
            >
                {cardItem.children}
            </div>
        </div>
    );
}
