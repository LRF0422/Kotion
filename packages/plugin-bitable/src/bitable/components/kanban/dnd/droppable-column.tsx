import React from "react";
import { useDrop } from "react-dnd";

import { cn } from "@kn/ui";

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
    disabled = false
}: DroppableColumnProps) {
    const [{ isOver, canDrop }, drop] = useDrop(
        () => ({
            accept: KanbanItemTypes.CARD,
            drop: (item: KanbanDragItem) => {
                // Only trigger drop if the card is moved to a different column
                if (item.sourceColumnId !== columnId) {
                    onDrop(item, columnId);
                }
                return { moved: true, targetColumnId: columnId };
            },
            canDrop: (item: KanbanDragItem) => {
                // Can drop if not disabled and it's a different column
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
            className={cn(
                "min-h-[200px] transition-colors duration-200 rounded-lg",
                isActive && "bg-accent/30 ring-2 ring-primary/30",
                isOver && !canDrop && "bg-destructive/10"
            )}
        >
            {children}
        </div>
    );
}
