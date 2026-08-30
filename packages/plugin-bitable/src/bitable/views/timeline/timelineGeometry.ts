import {
    addDays,
    addMonths,
    addWeeks,
    differenceInCalendarDays,
    differenceInCalendarMonths,
    getDaysInMonth,
    startOfDay,
    startOfMonth,
    startOfWeek,
} from "date-fns";
import type { TimelineScale } from "./types";

export type TimelineRoundingMode = "floor" | "round" | "ceil";

export interface TimelineGeometry {
    scale: TimelineScale;
    columnWidth: number;
    ticks: Date[];
    rangeStart: Date;
    rangeEndExclusive: Date;
    totalWidth: number;
    dateToX: (date: Date) => number;
    xToDate: (x: number, rounding?: TimelineRoundingMode) => Date;
    snapXToDay: (x: number) => number;
    positionForInclusiveRange: (start: Date, end: Date) => { left: number; width: number };
    containsDate: (date: Date) => boolean;
}

function roundValue(value: number, mode: TimelineRoundingMode): number {
    if (mode === "floor") return Math.floor(value);
    if (mode === "ceil") return Math.ceil(value);
    return Math.round(value);
}

export function alignTimelineTicks(
    ticks: Date[],
    scale: TimelineScale
): Date[] {
    if (ticks.length === 0) return [];
    if (scale === "week") {
        return ticks.map((tick) => startOfWeek(tick, { weekStartsOn: 1 }));
    }
    if (scale === "month") {
        return ticks.map((tick) => startOfMonth(tick));
    }
    return ticks.map((tick) => startOfDay(tick));
}

export function createTimelineGeometry(
    ticks: Date[],
    scale: TimelineScale,
    columnWidth: number
): TimelineGeometry {
    const alignedTicks = alignTimelineTicks(ticks, scale);
    if (alignedTicks.length === 0) {
        throw new Error("Timeline geometry requires at least one tick");
    }

    const rangeStart = alignedTicks[0];
    const lastTick = alignedTicks[alignedTicks.length - 1];
    const rangeEndExclusive =
        scale === "week"
            ? addWeeks(lastTick, 1)
            : scale === "month"
              ? addMonths(lastTick, 1)
              : addDays(lastTick, 1);

    const dateToX = (date: Date): number => {
        const day = startOfDay(date);
        if (scale === "day") {
            return differenceInCalendarDays(day, rangeStart) * columnWidth;
        }
        if (scale === "week") {
            return differenceInCalendarDays(day, rangeStart) * (columnWidth / 7);
        }

        const monthStart = startOfMonth(day);
        const monthIndex = differenceInCalendarMonths(monthStart, rangeStart);
        const dayOffset = differenceInCalendarDays(day, monthStart);
        return monthIndex * columnWidth + (dayOffset / getDaysInMonth(monthStart)) * columnWidth;
    };

    const xToDate = (x: number, rounding: TimelineRoundingMode = "round"): Date => {
        if (scale === "day") {
            return addDays(rangeStart, roundValue(x / columnWidth, rounding));
        }
        if (scale === "week") {
            return addDays(rangeStart, roundValue(x / (columnWidth / 7), rounding));
        }

        const monthIndex = Math.floor(x / columnWidth);
        const monthStart = addMonths(rangeStart, monthIndex);
        const innerX = x - monthIndex * columnWidth;
        const dayOffset = roundValue(
            (innerX / columnWidth) * getDaysInMonth(monthStart),
            rounding
        );
        return addDays(monthStart, dayOffset);
    };

    const snapXToDay = (x: number) => dateToX(xToDate(x, "round"));
    const positionForInclusiveRange = (start: Date, end: Date) => {
        const normalizedStart = startOfDay(start);
        const normalizedEnd = startOfDay(end) < normalizedStart ? normalizedStart : startOfDay(end);
        const left = dateToX(normalizedStart);
        const right = dateToX(addDays(normalizedEnd, 1));
        return { left, width: Math.max(right - left, 1) };
    };

    return {
        scale,
        columnWidth,
        ticks: alignedTicks,
        rangeStart,
        rangeEndExclusive,
        totalWidth: alignedTicks.length * columnWidth,
        dateToX,
        xToDate,
        snapXToDay,
        positionForInclusiveRange,
        containsDate: (date) => date >= rangeStart && date < rangeEndExclusive,
    };
}
