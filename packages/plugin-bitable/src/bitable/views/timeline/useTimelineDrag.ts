import { useState, useCallback } from "react";
import { addDays, differenceInCalendarDays } from "date-fns";
import type { RecordData, FieldConfig } from "../../../types";
import type { DragState, DragPreview, DragType, BarPosition } from "./types";
import type { TimelineGeometry } from "./timelineGeometry";

interface UseTimelineDragArgs {
    editable: boolean;
    geometry: TimelineGeometry;
    startDateField?: FieldConfig;
    endDateField?: FieldConfig | null;
    onUpdateRecord: (recordId: string, updates: Partial<RecordData>) => void;
}

export function useTimelineDrag({
    editable,
    geometry,
    startDateField,
    endDateField,
    onUpdateRecord,
}: UseTimelineDragArgs) {
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);

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
                recordId: String(record.id),
                type,
                startX: e.clientX,
                originalLeft: position.left,
                originalWidth: position.width,
                originalStartDate: position.startDate,
                originalEndDate: position.endDate,
            });
            setDragPreview({
                left: position.left,
                width: position.width,
                startDate: position.startDate,
                endDate: position.endDate,
            });
        },
        [editable]
    );

    const handleDragMove = useCallback(
        (e: React.MouseEvent) => {
            if (!dragState) return;
            const deltaX = e.clientX - dragState.startX;

            if (dragState.type === "move") {
                const left = geometry.snapXToDay(dragState.originalLeft + deltaX);
                const startDate = geometry.xToDate(left);
                const duration = differenceInCalendarDays(
                    dragState.originalEndDate,
                    dragState.originalStartDate
                );
                const endDate = addDays(startDate, duration);
                const position = geometry.positionForInclusiveRange(startDate, endDate);
                setDragPreview({ ...position, startDate, endDate });
                return;
            }

            if (dragState.type === "resize-left") {
                const left = geometry.snapXToDay(dragState.originalLeft + deltaX);
                const candidate = geometry.xToDate(left);
                const startDate = candidate > dragState.originalEndDate
                    ? dragState.originalEndDate
                    : candidate;
                const endDate = dragState.originalEndDate;
                const position = geometry.positionForInclusiveRange(startDate, endDate);
                setDragPreview({ ...position, startDate, endDate });
                return;
            }

            if (dragState.type === "resize-right") {
                const originalRight = dragState.originalLeft + dragState.originalWidth;
                const right = geometry.snapXToDay(originalRight + deltaX);
                const candidate = addDays(geometry.xToDate(right), -1);
                const endDate = candidate < dragState.originalStartDate
                    ? dragState.originalStartDate
                    : candidate;
                const startDate = dragState.originalStartDate;
                const position = geometry.positionForInclusiveRange(startDate, endDate);
                setDragPreview({ ...position, startDate, endDate });
            }
        },
        [dragState, geometry]
    );

    const handleDragEnd = useCallback(() => {
        if (!dragState || !dragPreview || !startDateField) {
            setDragState(null);
            setDragPreview(null);
            return;
        }

        const updates: Partial<RecordData> = {};
        if (dragState.type === "move" || dragState.type === "resize-left") {
            updates[startDateField.id] = dragPreview.startDate.toISOString();
        }
        if (endDateField && (dragState.type === "move" || dragState.type === "resize-right")) {
            updates[endDateField.id] = dragPreview.endDate.toISOString();
        }

        if (Object.keys(updates).length > 0) {
            onUpdateRecord(dragState.recordId, updates);
        }

        setDragState(null);
        setDragPreview(null);
    }, [dragState, dragPreview, startDateField, endDateField, onUpdateRecord]);

    return {
        dragState,
        dragPreview,
        handleDragStart,
        handleDragMove,
        handleDragEnd,
    };
}

export type UseTimelineDragReturn = ReturnType<typeof useTimelineDrag>;
