import React, { useMemo } from "react";
import { isToday, startOfDay, format, parseISO, isSameDay, endOfDay } from "date-fns";
import { useCalendar } from "./CalendarContext";
import { getCalendarCells, calculateMonthEventPositions, getMonthCellEvents } from "./helpers";
import { DraggableEvent, DroppableDayCell } from "./dnd";
import { EVENT_COLOR_CLASSES, EVENT_DOT_CLASSES } from "./types";
import type { CalendarEvent } from "./types";

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE = 3;

/* ================ EventBullet ================ */

function EventBullet({ color }: { color: CalendarEvent["color"] }) {
    return <span className={`bitable-cal-bullet ${EVENT_DOT_CLASSES[color]}`} />;
}

/* ================ MonthEventBadge ================ */

interface MonthEventBadgeProps {
    event: CalendarEvent;
    cellDate: Date;
    position?: "first" | "middle" | "last" | "none";
    eventCurrentDay?: number;
    eventTotalDays?: number;
}

function MonthEventBadge({ event, cellDate, position: propPos, eventCurrentDay, eventTotalDays }: MonthEventBadgeProps) {
    const { onRecordClick } = useCalendar();
    const itemStart = startOfDay(parseISO(event.startDate));
    const itemEnd = endOfDay(parseISO(event.endDate));

    if (cellDate < itemStart || cellDate > itemEnd) return null;

    let position: "first" | "middle" | "last" | "none";
    if (propPos) {
        position = propPos;
    } else if (eventCurrentDay && eventTotalDays) {
        position = "none";
    } else if (isSameDay(itemStart, itemEnd)) {
        position = "none";
    } else if (isSameDay(cellDate, itemStart)) {
        position = "first";
    } else if (isSameDay(cellDate, itemEnd)) {
        position = "last";
    } else {
        position = "middle";
    }

    const showText = position === "first" || position === "none";

    return (
        <DraggableEvent event={event}>
            <div
                role="button"
                tabIndex={0}
                className={`bitable-cal-event ${EVENT_COLOR_CLASSES[event.color]} bitable-cal-event--${position}`}
                onClick={(e) => { e.stopPropagation(); onRecordClick?.(event.recordId); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}
            >
                {showText && (
                    <>
                        <span className="bitable-cal-event__time">{format(parseISO(event.startDate), "h:mm a")}</span>
                        <span className="bitable-cal-event__title">
                            {eventCurrentDay && (
                                <span className="bitable-cal-event__day-info">Day {eventCurrentDay} of {eventTotalDays} - </span>
                            )}
                            {event.title}
                        </span>
                    </>
                )}
            </div>
        </DraggableEvent>
    );
}

/* ================ DayCell ================ */

interface DayCellProps {
    cell: { day: number; currentMonth: boolean; date: Date };
    events: CalendarEvent[];
    eventPositions: Record<string, number>;
    onCreate: (date: Date) => void;
    onZoomToDay: (date: Date) => void;
}

function DayCell({ cell, events, eventPositions, onCreate, onZoomToDay }: DayCellProps) {
    const { day, currentMonth, date } = cell;
    const cellEvents = useMemo(() => getMonthCellEvents(date, events, eventPositions), [date, events, eventPositions]);
    const isSunday = date.getDay() === 0;

    return (
        <DroppableDayCell cell={cell}>
            <div
                className={`bitable-cal-day-cell${!currentMonth ? " bitable-cal-day-cell--other" : ""}${isSunday ? " bitable-cal-day-cell--sunday" : ""}`}
            >
                <span
                    className={`bitable-cal-day-cell__num${isToday(date) ? " bitable-cal-day-cell__num--today" : ""}`}
                    onClick={() => onZoomToDay(date)}
                >
                    {day}
                </span>
                <div className="bitable-cal-day-cell__events" onClick={(e) => e.stopPropagation()}>
                    {[0, 1, 2].map(pos => {
                        const ev = cellEvents.find(e => e.position === pos);
                        if (!ev) return <div key={`empty-${pos}`} className="bitable-cal-day-cell__slot" />;
                        return (
                            <div key={`event-${ev.id}-${pos}`} className="bitable-cal-day-cell__slot">
                                <EventBullet color={ev.color} />
                                <MonthEventBadge event={ev} cellDate={startOfDay(date)} />
                            </div>
                        );
                    })}
                </div>
                {cellEvents.length > MAX_VISIBLE && (
                    <button className="bitable-cal-day-cell__more" onClick={() => onCreate(date)}>
                        +{cellEvents.length - MAX_VISIBLE} more
                    </button>
                )}
            </div>
        </DroppableDayCell>
    );
}

/* ================ CalendarMonthView ================ */

interface CalendarMonthViewProps {
    singleDayEvents: CalendarEvent[];
    multiDayEvents: CalendarEvent[];
}

export function CalendarMonthView({ singleDayEvents, multiDayEvents }: CalendarMonthViewProps) {
    const { selectedDate, onCreateAtSlot, setView, setSelectedDate, editable } = useCalendar();

    const allEvents = [...multiDayEvents, ...singleDayEvents];
    const cells = useMemo(() => getCalendarCells(selectedDate), [selectedDate]);
    const eventPositions = useMemo(
        () => calculateMonthEventPositions(multiDayEvents, singleDayEvents, selectedDate),
        [multiDayEvents, singleDayEvents, selectedDate]
    );

    const handleCreate = (date: Date) => {
        if (editable) onCreateAtSlot?.(date);
    };

    const handleZoomToDay = (date: Date) => {
        setSelectedDate(date);
        setView("day");
    };

    return (
        <div className="bitable-cal-month">
            <div className="bitable-cal-month__weekdays">
                {WEEK_DAYS.map(d => (
                    <span key={d} className="bitable-cal-month__weekday">{d}</span>
                ))}
            </div>
            <div className="bitable-cal-month__grid">
                {cells.map(cell => (
                    <DayCell
                        key={cell.date.toISOString()}
                        cell={cell}
                        events={allEvents}
                        eventPositions={eventPositions}
                        onCreate={handleCreate}
                        onZoomToDay={handleZoomToDay}
                    />
                ))}
            </div>
        </div>
    );
}
