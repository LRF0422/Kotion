import React from "react";
import { useDragLayer } from "react-dnd";

import type { KanbanDragItem } from "./draggable-card";

export function KanbanDragLayer() {
    const { isDragging, item, currentOffset, initialOffset, initialClientOffset } = useDragLayer(
        (monitor) => ({
            item: monitor.getItem() as KanbanDragItem | null,
            itemType: monitor.getItemType(),
            isDragging: monitor.isDragging(),
            currentOffset: monitor.getClientOffset(),
            initialOffset: monitor.getInitialSourceClientOffset(),
            initialClientOffset: monitor.getInitialClientOffset(),
        })
    );

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

    return (
        <div style={layerStyles}>
            <div
                className="shadow-xl rounded-md transform rotate-2 opacity-90"
                style={{
                    width: item.width,
                    height: item.height,
                }}
            >
                {item.children}
            </div>
        </div>
    );
}
