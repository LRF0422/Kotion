import React from "react";
import { useDrop } from "react-dnd";
import { parseISO, differenceInMilliseconds } from "date-fns";
import { CalendarItemTypes } from "./draggable-event";
import { useCalendar } from "../CalendarContext";
import type { CalendarEvent, CalendarCell } from "../types";

/* ================ DroppableDayCell ================ */

interface DroppableDayCellProps {
    cell: CalendarCell;
    children: React.ReactNode;
}

/** Drop target for month view day cells - moves event to the dropped date. */
export function DroppableDayCell({ cell, children }: DroppableDayCellProps) {
    const { onEventMove } = useCalendar();

    const [{ isOver, canDrop }, drop] = useDrop(
        () => ({
            accept: CalendarItemTypes.EVENT,
            drop: (item: { event: CalendarEvent }) => {
                const e = item.event;
                const eStart = parseISO(e.startDate);
                const eEnd = parseISO(e.endDate);
                const duration = differenceInMilliseconds(eEnd, eStart);

                const newStart = new Date(cell.date);
                newStart.setHours(eStart.getHours(), eStart.getMinutes(), eStart.getSeconds(), 0);
                const newEnd = new Date(newStart.getTime() + duration);

                onEventMove?.(e.recordId, newStart, newEnd);
                return { moved: true };
            },
            collect: (m) => ({ isOver: m.isOver(), canDrop: m.canDrop() }),
        }),
        [cell.date, onEventMove]
    );

    return (
        <div
            ref={drop as unknown as React.RefObject<HTMLDivElement>}
            className={isOver && canDrop ? "bitable-cal-cell--drop" : undefined}
        >
            {children}
        </div>
    );
}

/* ================ DroppableTimeBlock ================ */

interface DroppableTimeBlockProps {
    date: Date;
    hour: number;
    minute: number;
    children: React.ReactNode;
}

/** Drop target for week/day view time blocks - moves event to the dropped time slot. */
export function DroppableTimeBlock({ date, hour, minute, children }: DroppableTimeBlockProps) {
    const { onEventMove } = useCalendar();

    const [{ isOver, canDrop }, drop] = useDrop(
        () => ({
            accept: CalendarItemTypes.EVENT,
            drop: (item: { event: CalendarEvent }) => {
                const e = item.event;
                const eStart = parseISO(e.startDate);
                const eEnd = parseISO(e.endDate);
                const duration = differenceInMilliseconds(eEnd, eStart);

                const newStart = new Date(date);
                newStart.setHours(hour, minute, 0, 0);
                const newEnd = new Date(newStart.getTime() + duration);

                onEventMove?.(e.recordId, newStart, newEnd);
                return { moved: true };
            },
            collect: (m) => ({ isOver: m.isOver(), canDrop: m.canDrop() }),
        }),
        [date, hour, minute, onEventMove]
    );

    return (
        <div
            ref={drop as unknown as React.RefObject<HTMLDivElement>}
            className={`bitable-cal-time-slot${isOver && canDrop ? " bitable-cal-time-slot--drop" : ""}`}
        >
            {children}
        </div>
    );
}
