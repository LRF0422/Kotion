import React, { useRef, useEffect } from "react";
import { useDrag, useDrop } from "react-dnd";
import { getEmptyImage } from "react-dnd-html5-backend";

import { KanbanItemTypes, type KanbanColumnDragItem } from "./draggable-card";

interface DraggableColumnProps {
    columnId: string;
    index: number;
    onReorder: (sourceId: string, targetId: string) => void;
    disabled?: boolean;
    children: React.ReactNode;
}

/**
 * Wraps a kanban column to enable drag-to-reorder via react-dnd.
 */
export function DraggableColumn({
    columnId,
    index,
    onReorder,
    disabled = false,
    children,
}: DraggableColumnProps) {
    const ref = useRef<HTMLDivElement>(null);

    const [{ isDragging }, drag, preview] = useDrag(
        () => ({
            type: KanbanItemTypes.COLUMN,
            item: (): KanbanColumnDragItem => {
                const width = ref.current?.offsetWidth || 0;
                const height = ref.current?.offsetHeight || 0;
                return { columnId, index, width, height };
            },
            canDrag: () => !disabled,
            collect: (monitor) => ({
                isDragging: monitor.isDragging(),
            }),
        }),
        [columnId, index, disabled]
    );

    const [{ isOver }, drop] = useDrop(
        () => ({
            accept: KanbanItemTypes.COLUMN,
            hover: (item: KanbanColumnDragItem) => {
                if (!disabled && item.columnId !== columnId) {
                    onReorder(item.columnId, columnId);
                    item.index = index;
                    item.columnId = columnId;
                }
            },
            collect: (monitor) => ({
                isOver: monitor.isOver(),
            }),
        }),
        [columnId, index, onReorder, disabled]
    );

    useEffect(() => {
        preview(getEmptyImage(), { captureDraggingState: true });
    }, [preview]);

    drag(drop(ref));

    return (
        <div
            ref={ref}
            className={`bitable-kanban__column-wrapper${
                isDragging ? " bitable-kanban__column-wrapper--dragging" : ""
            }${isOver ? " bitable-kanban__column-wrapper--drop-target" : ""}`}
        >
            {children}
        </div>
    );
}
