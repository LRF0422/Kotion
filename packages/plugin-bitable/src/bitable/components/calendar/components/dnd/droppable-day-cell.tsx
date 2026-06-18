import { useDrop } from "react-dnd";
import { parseISO, differenceInMilliseconds } from "date-fns";

import { cn } from "@kn/ui";
import { ItemTypes } from "../../components/dnd/draggable-event";
import { useCalendar } from "../../contexts/calendar-context";

import type { IEvent, ICalendarCell } from "../../interfaces";
import React from "react";

interface DroppableDayCellProps {
  cell: ICalendarCell;
  children: React.ReactNode;
}

export function DroppableDayCell({ cell, children }: DroppableDayCellProps) {
  const { onEventUpdate } = useCalendar();

  const [{ isOver, canDrop }, drop] = useDrop(
    () => ({
      accept: ItemTypes.EVENT,
      drop: (item: { event: IEvent }) => {
        const droppedEvent = item.event;

        const eventStartDate = parseISO(droppedEvent.startDate);
        const eventEndDate = parseISO(droppedEvent.endDate);

        const eventDurationMs = differenceInMilliseconds(eventEndDate, eventStartDate);

        const newStartDate = new Date(cell.date);
        newStartDate.setHours(eventStartDate.getHours(), eventStartDate.getMinutes(), eventStartDate.getSeconds(), eventStartDate.getMilliseconds());
        const newEndDate = new Date(newStartDate.getTime() + eventDurationMs);

        // 把新日期写回 bitable（之前只返回 moved:true，拖拽不会保存）
        onEventUpdate?.(droppedEvent.id, { startDateTime: newStartDate, endDateTime: newEndDate });

        return { moved: true };
      },
      collect: monitor => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [cell.date, onEventUpdate]
  );

  return (
    <div ref={drop as unknown as React.RefObject<HTMLDivElement>} className={cn(isOver && canDrop && "bg-accent/50")}>
      {children}
    </div>
  );
}
