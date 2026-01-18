import React from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { KanbanDragLayer } from "./kanban-drag-layer";

interface KanbanDndProviderProps {
    children: React.ReactNode;
}

export function KanbanDndProvider({ children }: KanbanDndProviderProps) {
    return (
        <DndProvider backend={HTML5Backend}>
            {children}
            <KanbanDragLayer />
        </DndProvider>
    );
}
