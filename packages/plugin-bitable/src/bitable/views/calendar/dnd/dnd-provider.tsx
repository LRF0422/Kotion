import React from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

interface CalendarDndProviderProps {
    children: React.ReactNode;
}

/** Wraps calendar views with react-dnd HTML5Backend. */
export function CalendarDndProvider({ children }: CalendarDndProviderProps) {
    return <DndProvider backend={HTML5Backend}>{children}</DndProvider>;
}
