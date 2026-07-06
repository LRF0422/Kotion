import React, { createContext, useContext, useState, useCallback } from "react";
import type { CalendarEvent, CalendarViewMode } from "./types";

interface CalendarContextValue {
    selectedDate: Date;
    setSelectedDate: (date: Date) => void;
    view: CalendarViewMode;
    setView: (view: CalendarViewMode) => void;
    events: CalendarEvent[];
    /** Update a record by recordId with new start/end dates. */
    onEventMove?: (recordId: string, startDate: Date, endDate: Date) => void;
    /** Called when user clicks an event to open the record drawer. */
    onRecordClick?: (recordId: string) => void;
    /** Called when user clicks an empty time slot to create a record. */
    onCreateAtSlot?: (date: Date) => void;
    /** Whether the calendar is editable. */
    editable: boolean;
}

const CalendarContext = createContext<CalendarContextValue | null>(null);

interface CalendarProviderProps {
    children: React.ReactNode;
    events: CalendarEvent[];
    onEventMove?: (recordId: string, startDate: Date, endDate: Date) => void;
    onRecordClick?: (recordId: string) => void;
    onCreateAtSlot?: (date: Date) => void;
    editable: boolean;
}

export function CalendarProvider({
    children,
    events,
    onEventMove,
    onRecordClick,
    onCreateAtSlot,
    editable,
}: CalendarProviderProps) {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [view, setView] = useState<CalendarViewMode>("month");

    const handleSetSelectedDate = useCallback((date: Date) => {
        setSelectedDate(date);
    }, []);

    return (
        <CalendarContext.Provider
            value={{
                selectedDate,
                setSelectedDate: handleSetSelectedDate,
                view,
                setView,
                events,
                onEventMove,
                onRecordClick,
                onCreateAtSlot,
                editable,
            }}
        >
            {children}
        </CalendarContext.Provider>
    );
}

export function useCalendar(): CalendarContextValue {
    const ctx = useContext(CalendarContext);
    if (!ctx) throw new Error("useCalendar must be used within CalendarProvider");
    return ctx;
}
