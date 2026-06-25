import React from "react";
import {
    Table2,
    Calendar,
    KanbanSquare,
    ImageIcon,
    GanttChartSquare,
    BarChart3,
    FileText,
} from "@kn/icon";
import { ViewType } from "../../types";

/** Icon for each view type, used in the toolbar and the add-view dropdown. */
export function getViewIcon(type: ViewType): React.ReactNode {
    switch (type) {
        case ViewType.TABLE:
            return <Table2 className="h-4 w-4" />;
        case ViewType.KANBAN:
            return <KanbanSquare className="h-4 w-4" />;
        case ViewType.GALLERY:
            return <ImageIcon className="h-4 w-4" />;
        case ViewType.CALENDAR:
            return <Calendar className="h-4 w-4" />;
        case ViewType.TIMELINE:
            return <GanttChartSquare className="h-4 w-4" />;
        case ViewType.CHART:
            return <BarChart3 className="h-4 w-4" />;
        case ViewType.FORM:
            return <FileText className="h-4 w-4" />;
        default:
            return <Table2 className="h-4 w-4" />;
    }
}

/** Localised default name for a view type. */
export function getViewTypeName(
    type: ViewType,
    t: (...args: any[]) => any
): string {
    switch (type) {
        case ViewType.TABLE:
            return t("bitable.views.table") as string;
        case ViewType.KANBAN:
            return t("bitable.views.kanban") as string;
        case ViewType.GALLERY:
            return t("bitable.views.gallery") as string;
        case ViewType.CALENDAR:
            return t("bitable.views.calendar") as string;
        case ViewType.TIMELINE:
            return t("bitable.views.timeline") as string;
        case ViewType.CHART:
            return t("bitable.views.chart") as string;
        case ViewType.FORM:
            return (t("bitable.views.form") as string) || "Form";
        default:
            return t("bitable.views.default") as string;
    }
}
