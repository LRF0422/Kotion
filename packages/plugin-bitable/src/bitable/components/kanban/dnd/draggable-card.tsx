import React, { useRef, useEffect } from "react";
import { useDrag } from "react-dnd";
import { getEmptyImage } from "react-dnd-html5-backend";

import { cn } from "@kn/ui";

import type { RecordData } from "../../../../types";

export const KanbanItemTypes = {
    CARD: "kanban-card",
};

export interface KanbanDragItem {
    record: RecordData;
    sourceColumnId: string;
    children: React.ReactNode;
    width: number;
    height: number;
}

interface DraggableCardProps {
    record: RecordData;
    columnId: string;
    children: React.ReactNode;
    disabled?: boolean;
}

export function DraggableCard({ record, columnId, children, disabled = false }: DraggableCardProps) {
    const ref = useRef<HTMLDivElement>(null);

    const [{ isDragging }, drag, preview] = useDrag(
        () => ({
            type: KanbanItemTypes.CARD,
            item: (): KanbanDragItem => {
                const width = ref.current?.offsetWidth || 0;
                const height = ref.current?.offsetHeight || 0;
                return {
                    record,
                    sourceColumnId: columnId,
                    children,
                    width,
                    height
                };
            },
            canDrag: () => !disabled,
            collect: (monitor) => ({
                isDragging: monitor.isDragging(),
            }),
        }),
        [record, columnId, disabled]
    );

    // Hide the default drag preview
    useEffect(() => {
        preview(getEmptyImage(), { captureDraggingState: true });
    }, [preview]);

    drag(ref);

    return (
        <div
            ref={ref}
            className={cn(
                "transition-all duration-200",
                isDragging && "opacity-40 scale-95",
                !disabled && "cursor-grab active:cursor-grabbing"
            )}
        >
            {children}
        </div>
    );
}
