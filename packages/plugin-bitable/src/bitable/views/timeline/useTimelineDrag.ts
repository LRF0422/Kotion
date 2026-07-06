import { useState, useCallback } from "react";
import { addDays } from "date-fns";
import type { RecordData, FieldConfig } from "../../../types";
import type { DragState, DragPreview, DragType, BarPosition, TimelineScale } from "./types";

interface UseTimelineDragArgs {
    editable: boolean;
    columnWidth: number;
    daysPerPixel: number;
    startDateField?: FieldConfig;
    endDateField?: FieldConfig | null;
    onUpdateRecord: (recordId: string, updates: Partial<RecordData>) => void;
}

export function useTimelineDrag({
    editable,
    columnWidth,
    daysPerPixel,
    startDateField,
    endDateField,
    onUpdateRecord,
}: UseTimelineDragArgs) {
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);

    const snapToGrid = useCallback(
        (position: number) => Math.round(position / columnWidth) * columnWidth,
        [columnWidth]
    );

    const handleDragStart = useCallback(
        (
            e: React.MouseEvent,
            record: RecordData,
            type: DragType,
            position: BarPosition
        ) => {
            if (!editable || !type) return;
            e.preventDefault();
            e.stopPropagation();

            setDragState({
                recordId: record.id,
                type,
                startX: e.clientX,
                originalLeft: position.left,
                originalWidth: position.width,
                originalStartDate: position.startDate,
                originalEndDate: position.endDate,
            });
            setDragPreview({ left: position.left, width: position.width });
        },
        [editable]
    );

    const handleDragMove = useCallback(
        (e: React.MouseEvent) => {
            if (!dragState || !dragPreview) return;

            const deltaX = e.clientX - dragState.startX;
            let newLeft = dragPreview.left;
            let newWidth = dragPreview.width;

            switch (dragState.type) {
                case "move":
                    newLeft = snapToGrid(dragState.originalLeft + deltaX);
                    break;
                case "resize-left":
                    newLeft = dragState.originalLeft + deltaX;
                    newWidth = dragState.originalWidth - deltaX;
                    if (newWidth < columnWidth) {
                        newWidth = columnWidth;
                        newLeft = dragState.originalLeft + dragState.originalWidth - columnWidth;
                    }
                    newLeft = snapToGrid(newLeft);
                    break;
                case "resize-right":
                    newWidth = dragState.originalWidth + deltaX;
                    if (newWidth < columnWidth) newWidth = columnWidth;
                    break;
            }

            setDragPreview({ left: newLeft, width: newWidth });
        },
        [dragState, dragPreview, columnWidth, snapToGrid]
    );

    const handleDragEnd = useCallback(() => {
        if (!dragState || !dragPreview || !startDateField) {
            setDragState(null);
            setDragPreview(null);
            return;
        }

        const deltaX = dragPreview.left - dragState.originalLeft;
        const widthDelta = dragPreview.width - dragState.originalWidth;
        const daysDelta = Math.round(deltaX * daysPerPixel);
        const durationDelta = Math.round(widthDelta * daysPerPixel);

        const updates: Partial<RecordData> = {};

        switch (dragState.type) {
            case "move": {
                const newStartDate = addDays(dragState.originalStartDate, daysDelta);
                updates[startDateField.id] = newStartDate.toISOString();
                if (endDateField) {
                    const newEndDate = addDays(dragState.originalEndDate, daysDelta);
                    updates[endDateField.id] = newEndDate.toISOString();
                }
                break;
            }
            case "resize-left": {
                const adjustedStartDate = addDays(dragState.originalStartDate, daysDelta);
                updates[startDateField.id] = adjustedStartDate.toISOString();
                break;
            }
            case "resize-right": {
                if (endDateField) {
                    const adjustedEndDate = addDays(dragState.originalEndDate, durationDelta);
                    updates[endDateField.id] = adjustedEndDate.toISOString();
                }
                break;
            }
        }

        if (Object.keys(updates).length > 0) {
            onUpdateRecord(dragState.recordId, updates);
        }

        setDragState(null);
        setDragPreview(null);
    }, [dragState, dragPreview, daysPerPixel, startDateField, endDateField, onUpdateRecord]);

    return {
        dragState,
        dragPreview,
        handleDragStart,
        handleDragMove,
        handleDragEnd,
    };
}

export type UseTimelineDragReturn = ReturnType<typeof useTimelineDrag>;
