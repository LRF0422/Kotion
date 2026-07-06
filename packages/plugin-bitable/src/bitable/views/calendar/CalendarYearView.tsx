import React, { useMemo } from "react";
import { addMonths, startOfYear, format, isSameDay, parseISO, getDaysInMonth, startOfMonth, isToday } from "date-fns";
import { ScrollArea } from "@kn/ui";
import { useCalendar } from "./CalendarContext";
import { EVENT_DOT_CLASSES } from "./types";
import type { CalendarEvent, EventColor } from "./types";

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ================ YearDayCell ================ */

function YearDayCell({ day, date, events }: { day: number; date: Date; events: CalendarEvent[] }) {
    const { setSelectedDate, setView } = useCalendar();
    const maxDots = 3;
    const count = events.length;

    return (
        <button
            className="bitable-cal-year-day"
            onClick={() => { setSelectedDate(date); setView("day"); }}
        >
            <span className={`bitable-cal-year-day__num${isToday(date) ? " bitable-cal-year-day__num--today" : ""}`}>
                {day}
            </span>
            {count > 0 && (
                <div className="bitable-cal-year-day__dots">
                    {count <= maxDots ? (
                        events.map(ev => <span key={ev.id} className={`bitable-cal-dot ${EVENT_DOT_CLASSES[ev.color]}`} />)
                    ) : (
                        <>
                            <span className={`bitable-cal-dot ${EVENT_DOT_CLASSES[events[0].color]}`} />
                            <span className="bitable-cal-year-day__more">+{count - 1}</span>
                        </>
                    )}
                </div>
            )}
        </button>
    );
}

/* ================ YearMonth ================ */

function YearMonth({ month, events }: { month: Date; events: CalendarEvent[] }) {
    const { setSelectedDate } = useCalendar();
    const monthName = format(month, "MMMM");

    const days = useMemo(() => {
        const total = getDaysInMonth(month);
        const first = startOfMonth(month).getDay();
        const blanks = Array(first).fill(null);
        const daysArr = Array.from({ length: total }, (_, i) => i + 1);
        return [...blanks, ...daysArr];
    }, [month]);

    return (
        <div className="bitable-cal-year-month">
            <button
                className="bitable-cal-year-month__name"
                onClick={() => setSelectedDate(new Date(month.getFullYear(), month.getMonth(), 1))}
            >
                {monthName}
            </button>
            <div className="bitable-cal-year-month__body">
                <div className="bitable-cal-year-month__weekdays">
                    {WEEK_DAYS.map((d, i) => <span key={i} className="bitable-cal-year-month__weekday">{d}</span>)}
                </div>
                <div className="bitable-cal-year-month__days">
                    {days.map((day, i) => {
                        if (day === null) return <div key={`blank-${i}`} className="bitable-cal-year-month__blank" />;
                        const date = new Date(month.getFullYear(), month.getMonth(), day);
                        const dayEvents = events.filter(e => isSameDay(parseISO(e.startDate), date) || isSameDay(parseISO(e.endDate), date));
                        return <YearDayCell key={`day-${day}`} day={day} date={date} events={dayEvents} />;
                    })}
                </div>
            </div>
        </div>
    );
}

/* ================ CalendarYearView ================ */

interface CalendarYearViewProps {
    allEvents: CalendarEvent[];
}

export function CalendarYearView({ allEvents }: CalendarYearViewProps) {
    const { selectedDate } = useCalendar();

    const months = useMemo(() => {
        const yearStart = startOfYear(selectedDate);
        return Array.from({ length: 12 }, (_, i) => addMonths(yearStart, i));
    }, [selectedDate]);

    return (
        <ScrollArea className="bitable-cal-year">
            <div className="bitable-cal-year__grid">
                {months.map(m => (
                    <YearMonth key={m.toString()} month={m} events={allEvents} />
                ))}
            </div>
        </ScrollArea>
    );
}
