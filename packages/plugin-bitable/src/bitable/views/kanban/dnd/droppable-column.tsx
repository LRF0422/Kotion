import React from "react";
import { useDrop } from "react-dnd";

import { KanbanItemTypes, type KanbanDragItem } from "./draggable-card";

interface DroppableColumnProps {
    columnId: string;
    onDrop: (item: KanbanDragItem, targetColumnId: string) => void;
    children: React.ReactNode;
    disabled?: boolean;
}

export function DroppableColumn({
    columnId,
    onDrop,
    children,
    disabled = false,
}: DroppableColumnProps) {
    const [{ isOver, canDrop }, drop] = useDrop(
        () => ({
            accept: KanbanItemTypes.CARD,
            drop: (item: KanbanDragItem) => {
                if (item.sourceColumnId !== columnId) {
                    onDrop(item, columnId);
                }
                return { moved: true, targetColumnId: columnId };
            },
            canDrop: (item: KanbanDragItem) => {
                return !disabled && item.sourceColumnId !== columnId;
            },
            collect: (monitor) => ({
                isOver: monitor.isOver(),
                canDrop: monitor.canDrop(),
            }),
        }),
        [columnId, onDrop, disabled]
    );

    const isActive = isOver && canDrop;

    return (
        <div
            ref={drop as unknown as React.RefObject<HTMLDivElement>}
            className={`bitable-kanban__drop-zone${
                isActive ? " bitable-kanban__drop-zone--active" : ""
            }${isOver && !canDrop ? " bitable-kanban__drop-zone--invalid" : ""}`}
        >
            {children}
        </div>
    );
}
