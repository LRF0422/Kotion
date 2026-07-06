import React, { useMemo } from "react";
import { CalendarX2 } from "@kn/icon";
import { parseISO, format, endOfDay, startOfDay, isSameMonth, differenceInDays } from "date-fns";
import { ScrollArea } from "@kn/ui";
import { useCalendar } from "./CalendarContext";
import { DraggableEvent } from "./dnd";
import { EVENT_COLOR_CLASSES } from "./types";
import type { CalendarEvent } from "./types";

/* ================ AgendaEventCard ================ */

function AgendaEventCard({
    event,
    eventCurrentDay,
    eventTotalDays,
}: {
    event: CalendarEvent;
    eventCurrentDay?: number;
    eventTotalDays?: number;
}) {
    const { onRecordClick } = useCalendar();
    const start = parseISO(event.startDate);
    const end = parseISO(event.endDate);

    return (
        <DraggableEvent event={event}>
            <div
                role="button"
                tabIndex={0}
                className={`bitable-cal-agenda-card ${EVENT_COLOR_CLASSES[event.color]}`}
                onClick={() => onRecordClick?.(event.recordId)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } }}
            >
                <div className="bitable-cal-agenda-card__body">
                    <span className="bitable-cal-agenda-card__title">
                        {eventCurrentDay && eventTotalDays && (
                            <span className="bitable-cal-agenda-card__day-info">Day {eventCurrentDay} of {eventTotalDays} - </span>
                        )}
                        {event.title}
                    </span>
                    <span className="bitable-cal-agenda-card__time">
                        {format(start, "h:mm a")} - {format(end, "h:mm a")}
                    </span>
                </div>
            </div>
        </DraggableEvent>
    );
}

/* ================ AgendaDayGroup ================ */

function AgendaDayGroup({ date, events, multiDayEvents }: { date: Date; events: CalendarEvent[]; multiDayEvents: CalendarEvent[] }) {
    const sorted = [...events].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    return (
        <div className="bitable-cal-agenda-group">
            <div className="bitable-cal-agenda-group__header">
                <span className="bitable-cal-agenda-group__date">{format(date, "EEEE, MMMM d, yyyy")}</span>
            </div>
            <div className="bitable-cal-agenda-group__events">
                {multiDayEvents.map(ev => {
                    const eStart = startOfDay(parseISO(ev.startDate));
                    const eEnd = startOfDay(parseISO(ev.endDate));
                    const total = differenceInDays(eEnd, eStart) + 1;
                    const current = differenceInDays(startOfDay(date), eStart) + 1;
                    return <AgendaEventCard key={ev.id} event={ev} eventCurrentDay={current} eventTotalDays={total} />;
                })}
                {sorted.map(ev => <AgendaEventCard key={ev.id} event={ev} />)}
            </div>
        </div>
    );
}

/* ================ CalendarAgendaView ================ */

interface CalendarAgendaViewProps {
    singleDayEvents: CalendarEvent[];
    multiDayEvents: CalendarEvent[];
}

export function CalendarAgendaView({ singleDayEvents, multiDayEvents }: CalendarAgendaViewProps) {
    const { selectedDate } = useCalendar();

    const byDay = useMemo(() => {
        const map = new Map<string, { date: Date; events: CalendarEvent[]; multiDayEvents: CalendarEvent[] }>();

        singleDayEvents.forEach(ev => {
            const d = parseISO(ev.startDate);
            if (!isSameMonth(d, selectedDate)) return;
            const key = format(d, "yyyy-MM-dd");
            if (!map.has(key)) map.set(key, { date: startOfDay(d), events: [], multiDayEvents: [] });
            map.get(key)!.events.push(ev);
        });

        multiDayEvents.forEach(ev => {
            const eStart = parseISO(ev.startDate);
            const eEnd = parseISO(ev.endDate);
            let cur = startOfDay(eStart);
            const last = endOfDay(eEnd);
            while (cur <= last) {
                if (isSameMonth(cur, selectedDate)) {
                    const key = format(cur, "yyyy-MM-dd");
                    if (!map.has(key)) map.set(key, { date: new Date(cur), events: [], multiDayEvents: [] });
                    map.get(key)!.multiDayEvents.push(ev);
                }
                cur = new Date(cur.setDate(cur.getDate() + 1));
            }
        });

        return Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
    }, [singleDayEvents, multiDayEvents, selectedDate]);

    const hasAny = singleDayEvents.length > 0 || multiDayEvents.length > 0;

    return (
        <div className="bitable-cal-agenda" style={{ height: "800px" }}>
            <ScrollArea className="h-full" type="always">
                <div className="bitable-cal-agenda__list">
                    {byDay.map(g => (
                        <AgendaDayGroup key={format(g.date, "yyyy-MM-dd")} date={g.date} events={g.events} multiDayEvents={g.multiDayEvents} />
                    ))}
                    {!hasAny && (
                        <div className="bitable-cal-agenda__empty">
                            <CalendarX2 className="bitable-cal-agenda__empty-icon" />
                            <span className="bitable-cal-agenda__empty-text">No events scheduled for the selected month</span>
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
