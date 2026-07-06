import {
    addDays,
    addMonths,
    addWeeks,
    subDays,
    subMonths,
    subWeeks,
    isSameWeek,
    isSameDay,
    isSameMonth,
    startOfWeek,
    startOfMonth,
    endOfMonth,
    endOfWeek,
    format,
    parseISO,
    differenceInMinutes,
    eachDayOfInterval,
    startOfDay,
    differenceInDays,
    endOfYear,
    startOfYear,
    subYears,
    addYears,
    isSameYear,
    isWithinInterval,
    isBefore,
    isAfter,
} from "date-fns";

import type { CalendarCell, CalendarEvent } from "./types";
import type { CalendarViewMode } from "./types";

/* ================ Header helpers ================ */

export function rangeText(view: CalendarViewMode, date: Date): string {
    const fmt = "yyyy-MM-dd";
    let start: Date;
    let end: Date;

    switch (view) {
        case "agenda":
        case "month":
            start = startOfMonth(date);
            end = endOfMonth(date);
            break;
        case "year":
            start = startOfYear(date);
            end = endOfYear(date);
            break;
        case "week":
            start = startOfWeek(date);
            end = endOfWeek(date);
            break;
        case "day":
            return format(date, fmt);
        default:
            return "";
    }
    return `${format(start, fmt)} - ${format(end, fmt)}`;
}

export function navigateDate(date: Date, view: CalendarViewMode, direction: "previous" | "next"): Date {
    const ops = {
        agenda: direction === "next" ? addMonths : subMonths,
        year: direction === "next" ? addYears : subYears,
        month: direction === "next" ? addMonths : subMonths,
        week: direction === "next" ? addWeeks : subWeeks,
        day: direction === "next" ? addDays : subDays,
    };
    return ops[view](date, 1);
}

export function getEventsCount(events: CalendarEvent[], date: Date, view: CalendarViewMode): number {
    const compareFns = {
        agenda: isSameMonth,
        year: isSameYear,
        day: isSameDay,
        week: isSameWeek,
        month: isSameMonth,
    };
    return events.filter(e => compareFns[view](new Date(e.startDate), date)).length;
}

/* ================ Week / Day view helpers ================ */

export function getCurrentEvents(events: CalendarEvent[]): CalendarEvent[] {
    const now = new Date();
    return events.filter(e => isWithinInterval(now, { start: parseISO(e.startDate), end: parseISO(e.endDate) }));
}

export function groupEvents(dayEvents: CalendarEvent[]): CalendarEvent[][] {
    const sorted = [...dayEvents].sort((a, b) => parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime());
    const groups: CalendarEvent[][] = [];

    for (const event of sorted) {
        const eventStart = parseISO(event.startDate);
        let placed = false;
        for (const group of groups) {
            const lastEnd = parseISO(group[group.length - 1].endDate);
            if (eventStart >= lastEnd) {
                group.push(event);
                placed = true;
                break;
            }
        }
        if (!placed) groups.push([event]);
    }
    return groups;
}

export function getEventBlockStyle(
    event: CalendarEvent,
    day: Date,
    groupIndex: number,
    groupSize: number,
    visibleHoursRange?: { from: number; to: number }
): { top: string; width: string; left: string } {
    const startDate = parseISO(event.startDate);
    const dayStart = new Date(day.setHours(0, 0, 0, 0));
    const eventStart = startDate < dayStart ? dayStart : startDate;
    const startMinutes = differenceInMinutes(eventStart, dayStart);

    let top: number;
    if (visibleHoursRange) {
        const visStart = visibleHoursRange.from * 60;
        const visEnd = visibleHoursRange.to * 60;
        const visRange = visEnd - visStart;
        top = ((startMinutes - visStart) / visRange) * 100;
    } else {
        top = (startMinutes / 1440) * 100;
    }

    const width = 100 / groupSize;
    const left = groupIndex * width;
    return { top: `${top}%`, width: `${width}%`, left: `${left}%` };
}

/** Compute visible hour range from default (7-18) extended to include all event hours. */
export function getVisibleHours(
    defaultRange: { from: number; to: number },
    singleDayEvents: CalendarEvent[]
): { hours: number[]; earliestHour: number; latestHour: number } {
    let earliest = defaultRange.from;
    let latest = defaultRange.to;

    singleDayEvents.forEach(e => {
        const startHour = parseISO(e.startDate).getHours();
        const endTime = parseISO(e.endDate);
        const endHour = endTime.getHours() + (endTime.getMinutes() > 0 ? 1 : 0);
        if (startHour < earliest) earliest = startHour;
        if (endHour > latest) latest = endHour;
    });

    latest = Math.min(latest, 24);
    const hours = Array.from({ length: latest - earliest }, (_, i) => i + earliest);
    return { hours, earliestHour: earliest, latestHour: latest };
}

/* ================ Month view helpers ================ */

export function getCalendarCells(selectedDate: Date): CalendarCell[] {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInPrev = new Date(year, month, 0).getDate();
    const total = firstDay + daysInMonth;

    const prev = Array.from({ length: firstDay }, (_, i) => ({
        day: daysInPrev - firstDay + i + 1,
        currentMonth: false,
        date: new Date(year, month - 1, daysInPrev - firstDay + i + 1),
    }));

    const current = Array.from({ length: daysInMonth }, (_, i) => ({
        day: i + 1,
        currentMonth: true,
        date: new Date(year, month, i + 1),
    }));

    const next = Array.from({ length: (7 - (total % 7)) % 7 }, (_, i) => ({
        day: i + 1,
        currentMonth: false,
        date: new Date(year, month + 1, i + 1),
    }));

    return [...prev, ...current, ...next];
}

export function calculateMonthEventPositions(
    multiDayEvents: CalendarEvent[],
    singleDayEvents: CalendarEvent[],
    selectedDate: Date
): Record<string, number> {
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);
    const positions: Record<string, number> = {};
    const occupied: Record<string, boolean[]> = {};

    eachDayOfInterval({ start: monthStart, end: monthEnd }).forEach(d => {
        occupied[startOfDay(d).toISOString()] = [false, false, false];
    });

    const sorted = [
        ...multiDayEvents.sort((a, b) => {
            const da = differenceInDays(parseISO(a.endDate), parseISO(a.startDate));
            const db = differenceInDays(parseISO(b.endDate), parseISO(b.startDate));
            return db - da || parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime();
        }),
        ...singleDayEvents.sort((a, b) => parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime()),
    ];

    sorted.forEach(event => {
        const eStart = parseISO(event.startDate);
        const eEnd = parseISO(event.endDate);
        const days = eachDayOfInterval({
            start: eStart < monthStart ? monthStart : eStart,
            end: eEnd > monthEnd ? monthEnd : eEnd,
        });

        let pos = -1;
        for (let i = 0; i < 3; i++) {
            if (days.every(d => { const o = occupied[startOfDay(d).toISOString()]; return o && !o[i]; })) {
                pos = i;
                break;
            }
        }
        if (pos !== -1) {
            days.forEach(d => { occupied[startOfDay(d).toISOString()][pos] = true; });
            positions[event.id] = pos;
        }
    });

    return positions;
}

export function getMonthCellEvents(
    date: Date,
    events: CalendarEvent[],
    positions: Record<string, number>
): (CalendarEvent & { position: number; isMultiDay: boolean })[] {
    return events
        .filter(e => {
            const s = parseISO(e.startDate);
            const en = parseISO(e.endDate);
            return (date >= s && date <= en) || isSameDay(date, s) || isSameDay(date, en);
        })
        .map(e => ({
            ...e,
            position: positions[e.id] ?? -1,
            isMultiDay: e.startDate !== e.endDate,
        }))
        .sort((a, b) => {
            if (a.isMultiDay && !b.isMultiDay) return -1;
            if (!a.isMultiDay && b.isMultiDay) return 1;
            return a.position - b.position;
        });
}

/* ================ Multi-day row helpers (week/day) ================ */

export function processMultiDayForWeek(
    multiDayEvents: CalendarEvent[],
    weekStart: Date,
    weekEnd: Date
): (CalendarEvent & { adjustedStart: Date; adjustedEnd: Date; startIndex: number; endIndex: number })[] {
    return multiDayEvents
        .map(e => {
            const s = parseISO(e.startDate);
            const en = parseISO(e.endDate);
            const adjStart = isBefore(s, weekStart) ? weekStart : s;
            const adjEnd = isAfter(en, weekEnd) ? weekEnd : en;
            return {
                ...e,
                adjustedStart: adjStart,
                adjustedEnd: adjEnd,
                startIndex: differenceInDays(adjStart, weekStart),
                endIndex: differenceInDays(adjEnd, weekStart),
            };
        })
        .sort((a, b) => {
            const d = a.adjustedStart.getTime() - b.adjustedStart.getTime();
            return d !== 0 ? d : b.endIndex - b.startIndex - (a.endIndex - a.startIndex);
        });
}

export function layoutMultiDayRows<T extends { startIndex: number; endIndex: number }>(events: T[]): T[][] {
    const rows: T[][] = [];
    events.forEach(e => {
        let idx = rows.findIndex(r => r.every(x => x.endIndex < e.startIndex || x.startIndex > e.endIndex));
        if (idx === -1) { idx = rows.length; rows.push([]); }
        rows[idx].push(e);
    });
    return rows;
}

export function hasMultiDayInWeek(multiDayEvents: CalendarEvent[], weekStart: Date, weekEnd: Date): boolean {
    return multiDayEvents.some(e => {
        const s = parseISO(e.startDate);
        const en = parseISO(e.endDate);
        return (s >= weekStart && s <= weekEnd) || (en >= weekStart && en <= weekEnd) || (s <= weekStart && en >= weekEnd);
    });
}

export function getMultiDayInDay(multiDayEvents: CalendarEvent[], dayStart: Date, dayEnd: Date): CalendarEvent[] {
    return multiDayEvents
        .filter(e => {
            const s = parseISO(e.startDate);
            const en = parseISO(e.endDate);
            return (
                isWithinInterval(dayStart, { start: s, end: en }) ||
                isWithinInterval(dayEnd, { start: s, end: en }) ||
                (s <= dayStart && en >= dayEnd)
            );
        })
        .sort((a, b) => {
            const da = differenceInDays(parseISO(a.endDate), parseISO(a.startDate));
            const db = differenceInDays(parseISO(b.endDate), parseISO(b.startDate));
            return db - da;
        });
}
