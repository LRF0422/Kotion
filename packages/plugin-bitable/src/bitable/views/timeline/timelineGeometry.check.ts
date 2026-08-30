import { strict as assert } from "node:assert";
import { addDays } from "date-fns";
import { createTimelineGeometry } from "./timelineGeometry.js";

function date(year: number, month: number, day: number): Date {
    return new Date(year, month - 1, day);
}

function assertClose(actual: number, expected: number, message: string): void {
    assert.ok(Math.abs(actual - expected) < 0.0001, `${message}: ${actual} !== ${expected}`);
}

function assertSameDay(actual: Date, expected: Date, message: string): void {
    assert.equal(actual.getFullYear(), expected.getFullYear(), message);
    assert.equal(actual.getMonth(), expected.getMonth(), message);
    assert.equal(actual.getDate(), expected.getDate(), message);
}

const dayGeometry = createTimelineGeometry(
    [date(2024, 1, 1), date(2024, 1, 2), date(2024, 1, 3)],
    "day",
    40
);
assertClose(dayGeometry.dateToX(date(2024, 1, 2)), 40, "day boundary");
assertClose(
    dayGeometry.positionForInclusiveRange(date(2024, 1, 2), date(2024, 1, 2)).width,
    40,
    "one-day width"
);

const weekGeometry = createTimelineGeometry(
    [date(2024, 1, 3), date(2024, 1, 10), date(2024, 1, 17)],
    "week",
    98
);
assertSameDay(weekGeometry.rangeStart, date(2024, 1, 1), "week origin is Monday");
assertClose(weekGeometry.dateToX(date(2024, 1, 8)), 98, "next Monday boundary");
assertClose(weekGeometry.dateToX(date(2024, 1, 4)), 42, "intra-week day fraction");
assertSameDay(
    weekGeometry.xToDate(weekGeometry.dateToX(date(2024, 1, 13))),
    date(2024, 1, 13),
    "weekly date round trip"
);

const monthGeometry = createTimelineGeometry(
    [date(2024, 1, 1), date(2024, 2, 1), date(2024, 3, 1)],
    "month",
    120
);
assertClose(monthGeometry.dateToX(date(2024, 2, 1)), 120, "February boundary");
assertClose(monthGeometry.dateToX(date(2024, 3, 1)), 240, "March boundary");
assertClose(
    monthGeometry.positionForInclusiveRange(date(2024, 1, 31), date(2024, 1, 31)).width,
    120 / 31,
    "January one-day width"
);
assertClose(
    monthGeometry.positionForInclusiveRange(date(2024, 2, 29), date(2024, 2, 29)).width,
    120 / 29,
    "leap-day width"
);
assertSameDay(
    monthGeometry.xToDate(monthGeometry.dateToX(date(2024, 2, 29))),
    date(2024, 2, 29),
    "monthly date round trip"
);

const span = monthGeometry.positionForInclusiveRange(date(2024, 1, 31), date(2024, 2, 2));
assertClose(
    span.width,
    monthGeometry.dateToX(date(2024, 2, 3)) - monthGeometry.dateToX(date(2024, 1, 31)),
    "inclusive cross-month width"
);
assertSameDay(
    monthGeometry.xToDate(monthGeometry.snapXToDay(monthGeometry.dateToX(addDays(date(2024, 2, 1), 10)))),
    date(2024, 2, 11),
    "month snapping remains on the selected day"
);

console.log("timeline geometry checks passed");
