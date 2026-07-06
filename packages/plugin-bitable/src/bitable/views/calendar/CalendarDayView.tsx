import React, { useMemo } from "react";
import { parseISO, isSameDay, areIntervalsOverlapping, format, differenceInDays, startOfDay, endOfDay } from "date-fns";
import { ScrollArea } from "@kn/ui";
import { useCalendar } from "./CalendarContext";
import { groupEvents, getEventBlockStyle, getVisibleHours, getMultiDayInDay } from "./helpers";
import { DraggableEvent, DroppableTimeBlock } from "./dnd";
import { EVENT_COLOR_CLASSES } from "./types";
import { EventBlock, CalendarTimeline } from "./CalendarWeekView";
import type { CalendarEvent } from "./types";

const HOUR_HEIGHT = 96;
const DEFAULT_VISIBLE = { from: 7, to: 18 };

/* ================ DayMultiDayRow ================ */

function DayMultiDayRow({ selectedDate, multiDayEvents }: { selectedDate: Date; multiDayEvents: CalendarEvent[] }) {
    const { onRecordClick } = useCalendar();
    const dayStart = startOfDay(selectedDate);
    const dayEnd = endOfDay(selectedDate);
    const events = useMemo(() => getMultiDayInDay(multiDayEvents, dayStart, dayEnd), [multiDayEvents, dayStart, dayEnd]);

    if (events.length === 0) return null;

    return (
        <div className="bitable-cal-day-multiday">
            <div className="bitable-cal-day-multiday__spacer" />
            <div className="bitable-cal-day-multiday__list">
                {events.map(ev => {
                    const eStart = startOfDay(parseISO(ev.startDate));
                    const eEnd = startOfDay(parseISO(ev.endDate));
                    const total = differenceInDays(eEnd, eStart) + 1;
                    const current = differenceInDays(dayStart, eStart) + 1;
                    return (
                        <DraggableEvent key={ev.id} event={ev}>
                            <div
                                className={`bitable-cal-event ${EVENT_COLOR_CLASSES[ev.color]} bitable-cal-event--none`}
                                onClick={(e) => { e.stopPropagation(); onRecordClick?.(ev.recordId); }}
                            >
                                <span className="bitable-cal-event__day-info">Day {current} of {total} - </span>
                                <span className="bitable-cal-event__title">{ev.title}</span>
                            </div>
                        </DraggableEvent>
                    );
                })}
            </div>
        </div>
    );
}

/* ================ CalendarDayView ================ */

interface CalendarDayViewProps {
    singleDayEvents: CalendarEvent[];
    multiDayEvents: CalendarEvent[];
}

export function CalendarDayView({ singleDayEvents, multiDayEvents }: CalendarDayViewProps) {
    const { selectedDate, onCreateAtSlot, editable } = useCalendar();
    const { hours, earliestHour, latestHour } = getVisibleHours(DEFAULT_VISIBLE, singleDayEvents);

    const dayEvents = useMemo(() => singleDayEvents.filter(e => {
        const d = parseISO(e.startDate);
        return isSameDay(d, selectedDate) || isSameDay(parseISO(e.endDate), selectedDate);
    }), [singleDayEvents, selectedDate]);

    const grouped = useMemo(() => groupEvents(dayEvents), [dayEvents]);

    return (
        <div className="bitable-cal-day">
            <DayMultiDayRow selectedDate={selectedDate} multiDayEvents={multiDayEvents} />
            <div className="bitable-cal-day__header">
                <div className="bitable-cal-day__time-col" />
                <span className="bitable-cal-day__header-label">
                    {format(selectedDate, "EE")} <span className="bitable-cal-day__header-num">{format(selectedDate, "d")}</span>
                </span>
            </div>
            <ScrollArea className="bitable-cal-scroll" style={{ height: "800px" }}>
                <div className="bitable-cal-day__body">
                    {/* Hours column */}
                    <div className="bitable-cal-day__time-col">
                        {hours.map((h, i) => (
                            <div key={h} className="bitable-cal-day__hour" style={{ height: `${HOUR_HEIGHT}px` }}>
                                {i !== 0 && <span className="bitable-cal-day__hour-label">{format(new Date().setHours(h, 0, 0, 0), "hh a")}</span>}
                            </div>
                        ))}
                    </div>
                    {/* Day grid */}
                    <div className="bitable-cal-day__grid">
                        {hours.map((h, hIdx) => (
                            <div key={h} className="bitable-cal-day__hour-cell" style={{ height: `${HOUR_HEIGHT}px` }}>
                                {hIdx !== 0 && <div className="bitable-cal-day__hour-line" />}
                                {[
                                    { min: 0, top: 0 },
                                    { min: 15, top: 24 },
                                    { min: 30, top: 48 },
                                    { min: 45, top: 72 },
                                ].map(({ min, top }) => (
                                    <DroppableTimeBlock key={min} date={selectedDate} hour={h} minute={min}>
                                        <div
                                            className="bitable-cal-day__slot"
                                            style={{ top: `${top}px` }}
                                            onClick={() => { if (editable) { const d = new Date(selectedDate); d.setHours(h, min, 0, 0); onCreateAtSlot?.(d); } }}
                                        />
                                    </DroppableTimeBlock>
                                ))}
                            </div>
                        ))}
                        {grouped.map((group, gIdx) =>
                            group.map(ev => {
                                let style = getEventBlockStyle(ev, new Date(selectedDate), gIdx, grouped.length, { from: earliestHour, to: latestHour });
                                const overlap = grouped.some((og, oi) => oi !== gIdx && og.some(oe => areIntervalsOverlapping(
                                    { start: parseISO(ev.startDate), end: parseISO(ev.endDate) },
                                    { start: parseISO(oe.startDate), end: parseISO(oe.endDate) }
                                )));
                                if (!overlap) style = { ...style, width: "100%", left: "0%" };
                                return (
                                    <div key={ev.id} className="bitable-cal-day__event-wrapper" style={style}>
                                        <EventBlock event={ev} />
                                    </div>
                                );
                            })
                        )}
                        <CalendarTimeline firstHour={earliestHour} lastHour={latestHour} />
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
}
