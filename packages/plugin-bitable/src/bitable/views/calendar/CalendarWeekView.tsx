import React, { useMemo, useEffect, useState } from "react";
import { startOfWeek, addDays, format, parseISO, isSameDay, areIntervalsOverlapping, differenceInMinutes, differenceInDays, startOfDay, endOfDay } from "date-fns";
import { ScrollArea } from "@kn/ui";
import { useCalendar } from "./CalendarContext";
import { groupEvents, getEventBlockStyle, getVisibleHours, processMultiDayForWeek, layoutMultiDayRows, hasMultiDayInWeek } from "./helpers";
import { DraggableEvent, DroppableTimeBlock } from "./dnd";
import { EVENT_COLOR_CLASSES } from "./types";
import type { CalendarEvent } from "./types";

const HOUR_HEIGHT = 96; // pixels per hour
const DEFAULT_VISIBLE = { from: 7, to: 18 };

/* ================ CalendarTimeline (shared) ================ */

export function CalendarTimeline({ firstHour, lastHour }: { firstHour: number; lastHour: number }) {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(t);
    }, []);

    const pos = ((now.getHours() * 60 + now.getMinutes() - firstHour * 60) / ((lastHour - firstHour) * 60)) * 100;
    if (now.getHours() < firstHour || now.getHours() >= lastHour) return null;

    return (
        <div className="bitable-cal-timeline" style={{ top: `${pos}%` }}>
            <span className="bitable-cal-timeline__dot" />
            <span className="bitable-cal-timeline__label">{format(now, "h:mm a")}</span>
        </div>
    );
}

/* ================ EventBlock (shared) ================ */

export function EventBlock({ event }: { event: CalendarEvent }) {
    const { onRecordClick } = useCalendar();
    const start = parseISO(event.startDate);
    const end = parseISO(event.endDate);
    const durationMin = differenceInMinutes(end, start);
    const heightPx = (durationMin / 60) * HOUR_HEIGHT - 8;

    return (
        <DraggableEvent event={event}>
            <div
                role="button"
                tabIndex={0}
                className={`bitable-cal-time-event ${EVENT_COLOR_CLASSES[event.color]}`}
                style={{ height: `${heightPx}px` }}
                onClick={(e) => { e.stopPropagation(); onRecordClick?.(event.recordId); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}
            >
                <span className="bitable-cal-time-event__title">{event.title || "Untitled"}</span>
                {durationMin > 25 && (
                    <span className="bitable-cal-time-event__time">{format(start, "h:mm a")} - {format(end, "h:mm a")}</span>
                )}
            </div>
        </DraggableEvent>
    );
}

/* ================ WeekMultiDayRow ================ */

function WeekMultiDayRow({ selectedDate, multiDayEvents }: { selectedDate: Date; multiDayEvents: CalendarEvent[] }) {
    const { onRecordClick } = useCalendar();
    const weekStart = startOfWeek(selectedDate);
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    const processed = useMemo(() => processMultiDayForWeek(multiDayEvents, weekStart, addDays(weekStart, 6)), [multiDayEvents, weekStart]);
    const rows = useMemo(() => layoutMultiDayRows(processed), [processed]);
    const hasEvents = useMemo(() => hasMultiDayInWeek(multiDayEvents, weekStart, addDays(weekStart, 6)), [multiDayEvents, weekStart]);

    if (!hasEvents) return null;

    return (
        <div className="bitable-cal-week-multiday">
            <div className="bitable-cal-week-multiday__spacer" />
            <div className="bitable-cal-week-multiday__grid">
                {weekDays.map((day, dayIdx) => (
                    <div key={dayIdx} className="bitable-cal-week-multiday__col">
                        {rows.map((row, rowIdx) => {
                            const ev = row.find(e => e.startIndex <= dayIdx && e.endIndex >= dayIdx);
                            if (!ev) return <div key={`${rowIdx}-${dayIdx}`} className="bitable-cal-week-multiday__empty" />;
                            let pos: "first" | "middle" | "last" | "none" = "none";
                            if (dayIdx === ev.startIndex && dayIdx === ev.endIndex) pos = "none";
                            else if (dayIdx === ev.startIndex) pos = "first";
                            else if (dayIdx === ev.endIndex) pos = "last";
                            else pos = "middle";
                            return (
                                <DraggableEvent key={`${ev.id}-${dayIdx}`} event={ev}>
                                    <div
                                        className={`bitable-cal-event ${EVENT_COLOR_CLASSES[ev.color]} bitable-cal-event--${pos}`}
                                        onClick={(e) => { e.stopPropagation(); onRecordClick?.(ev.recordId); }}
                                    >
                                        {(pos === "first" || pos === "none") && <span className="bitable-cal-event__title">{ev.title}</span>}
                                    </div>
                                </DraggableEvent>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ================ CalendarWeekView ================ */

interface CalendarWeekViewProps {
    singleDayEvents: CalendarEvent[];
    multiDayEvents: CalendarEvent[];
}

export function CalendarWeekView({ singleDayEvents, multiDayEvents }: CalendarWeekViewProps) {
    const { selectedDate, onCreateAtSlot, editable } = useCalendar();
    const { hours, earliestHour, latestHour } = getVisibleHours(DEFAULT_VISIBLE, singleDayEvents);
    const weekStart = startOfWeek(selectedDate);
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    return (
        <div className="bitable-cal-week">
            <WeekMultiDayRow selectedDate={selectedDate} multiDayEvents={multiDayEvents} />
            <div className="bitable-cal-week__header">
                <div className="bitable-cal-week__time-col" />
                <div className="bitable-cal-week__days-header">
                    {weekDays.map((day, i) => (
                        <span key={i} className="bitable-cal-week__day-header">
                            {format(day, "EE")} <span className="bitable-cal-week__day-num">{format(day, "d")}</span>
                        </span>
                    ))}
                </div>
            </div>
            <ScrollArea className="bitable-cal-scroll" style={{ height: "800px" }}>
                <div className="bitable-cal-week__body">
                    {/* Hours column */}
                    <div className="bitable-cal-week__time-col">
                        {hours.map((h, i) => (
                            <div key={h} className="bitable-cal-week__hour" style={{ height: `${HOUR_HEIGHT}px` }}>
                                {i !== 0 && <span className="bitable-cal-week__hour-label">{format(new Date().setHours(h, 0, 0, 0), "hh a")}</span>}
                            </div>
                        ))}
                    </div>
                    {/* Day columns */}
                    <div className="bitable-cal-week__grid">
                        {weekDays.map((day, dayIdx) => {
                            const dayEvents = singleDayEvents.filter(e => isSameDay(parseISO(e.startDate), day) || isSameDay(parseISO(e.endDate), day));
                            const grouped = groupEvents(dayEvents);
                            return (
                                <div key={dayIdx} className="bitable-cal-week__day-col">
                                    {hours.map((h, hIdx) => (
                                        <div key={h} className="bitable-cal-week__hour-cell" style={{ height: `${HOUR_HEIGHT}px` }}>
                                            {hIdx !== 0 && <div className="bitable-cal-week__hour-line" />}
                                            {[
                                                { min: 0, top: 0 },
                                                { min: 15, top: 24 },
                                                { min: 30, top: 48 },
                                                { min: 45, top: 72 },
                                            ].map(({ min, top }) => (
                                                <DroppableTimeBlock key={min} date={day} hour={h} minute={min}>
                                                    <div
                                                        className="bitable-cal-week__slot"
                                                        style={{ top: `${top}px` }}
                                                        onClick={() => { if (editable) { const d = new Date(day); d.setHours(h, min, 0, 0); onCreateAtSlot?.(d); } }}
                                                    />
                                                </DroppableTimeBlock>
                                            ))}
                                        </div>
                                    ))}
                                    {grouped.map((group, gIdx) =>
                                        group.map(ev => {
                                            let style = getEventBlockStyle(ev, new Date(day), gIdx, grouped.length, { from: earliestHour, to: latestHour });
                                            const overlap = grouped.some((og, oi) => oi !== gIdx && og.some(oe => areIntervalsOverlapping(
                                                { start: parseISO(ev.startDate), end: parseISO(ev.endDate) },
                                                { start: parseISO(oe.startDate), end: parseISO(oe.endDate) }
                                            )));
                                            if (!overlap) style = { ...style, width: "100%", left: "0%" };
                                            return (
                                                <div key={ev.id} className="bitable-cal-week__event-wrapper" style={style}>
                                                    <EventBlock event={ev} />
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            );
                        })}
                        <CalendarTimeline firstHour={earliestHour} lastHour={latestHour} />
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
}
