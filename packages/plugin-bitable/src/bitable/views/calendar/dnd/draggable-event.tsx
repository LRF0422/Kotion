import React, { useRef } from "react";
import { useDrag } from "react-dnd";
import type { CalendarEvent } from "../types";

export const CalendarItemTypes = {
    EVENT: "calendar-event",
} as const;

interface DraggableEventProps {
    event: CalendarEvent;
    children: React.ReactNode;
}

/** Wraps an event block to make it draggable via react-dnd. */
export function DraggableEvent({ event, children }: DraggableEventProps) {
    const ref = useRef<HTMLDivElement>(null);

    const [{ isDragging }, drag] = useDrag(() => ({
        type: CalendarItemTypes.EVENT,
        item: () => ({ event }),
        canDrag: () => true,
        collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }), [event]);

    drag(ref);

    return (
        <div
            ref={ref}
            className={isDragging ? "bitable-cal-event--dragging" : undefined}
        >
            {children}
        </div>
    );
}
