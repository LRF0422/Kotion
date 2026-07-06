/** Calendar view display modes. */
export type CalendarViewMode = "day" | "week" | "month" | "year" | "agenda";

/** Event color palette. */
export type EventColor = "blue" | "green" | "red" | "yellow" | "purple" | "orange" | "gray";

/**
 * Internal calendar event representation.
 * Maps a bitable record to calendar display data.
 */
export interface CalendarEvent {
    id: number;
    recordId: string;
    startDate: string;
    endDate: string;
    title: string;
    color: EventColor;
}

/** Calendar cell for month view grid. */
export interface CalendarCell {
    day: number;
    currentMonth: boolean;
    date: Date;
}

/** Color to CSS class mapping for event badges. */
export const EVENT_COLOR_CLASSES: Record<EventColor, string> = {
    blue: "bitable-cal-event--blue",
    green: "bitable-cal-event--green",
    red: "bitable-cal-event--red",
    yellow: "bitable-cal-event--yellow",
    purple: "bitable-cal-event--purple",
    orange: "bitable-cal-event--orange",
    gray: "bitable-cal-event--gray",
};

/** Color to CSS dot class mapping. */
export const EVENT_DOT_CLASSES: Record<EventColor, string> = {
    blue: "bitable-cal-dot--blue",
    green: "bitable-cal-dot--green",
    red: "bitable-cal-dot--red",
    yellow: "bitable-cal-dot--yellow",
    purple: "bitable-cal-dot--purple",
    orange: "bitable-cal-dot--orange",
    gray: "bitable-cal-dot--gray",
};

/** All available event colors. */
export const EVENT_COLORS: EventColor[] = ["blue", "green", "red", "yellow", "purple", "orange", "gray"];
