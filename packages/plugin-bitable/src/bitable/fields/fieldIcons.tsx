/**
 * Consolidated field type icon mapping.
 * Replaces the scattered getFieldTypeIcon functions in TableView.tsx and
 * RecordDetailFields.tsx.
 */
import React from "react";
import {
    Type,
    Hash,
    Calendar,
    CheckSquare,
    Link,
    Mail,
    Phone,
    Star,
    BarChart2,
    Circle,
    Clock,
    ImageIcon,
    Paperclip,
    FileText,
} from "@kn/icon";
import { FieldType } from "../../types";
import {
    Table2,
    Calendar as CalendarIcon,
    KanbanSquare,
    Image as GalleryIcon,
    GanttChartSquare,
    BarChart3,
    FileText as FormIcon,
} from "@kn/icon";
import { ViewType } from "../../types";

const ICON_CLASS = "h-4 w-4 shrink-0";

/** Get icon for a field type. */
export function getFieldTypeIcon(type: FieldType, className?: string): React.ReactNode {
    const cls = className || ICON_CLASS;
    switch (type) {
        case FieldType.TEXT:
            return <Type className={cls} />;
        case FieldType.NUMBER:
            return <Hash className={cls} />;
        case FieldType.DATE:
            return <Calendar className={cls} />;
        case FieldType.CHECKBOX:
            return <CheckSquare className={cls} />;
        case FieldType.URL:
            return <Link className={cls} />;
        case FieldType.EMAIL:
            return <Mail className={cls} />;
        case FieldType.PHONE:
            return <Phone className={cls} />;
        case FieldType.RATING:
            return <Star className={cls} />;
        case FieldType.PROGRESS:
            return <BarChart2 className={cls} />;
        case FieldType.SELECT:
        case FieldType.MULTI_SELECT:
            return <Circle className={cls} />;
        case FieldType.IMAGE:
            return <ImageIcon className={cls} />;
        case FieldType.ATTACHMENT:
            return <Paperclip className={cls} />;
        case FieldType.CREATED_TIME:
        case FieldType.UPDATED_TIME:
            return <Clock className={cls} />;
        case FieldType.CREATED_BY:
        case FieldType.UPDATED_BY:
            return <FileText className={cls} />;
        case FieldType.ID:
        case FieldType.AUTO_NUMBER:
            return <Hash className={cls} />;
        case FieldType.PERSON:
            return <FileText className={cls} />;
        case FieldType.FORMULA:
            return <BarChart2 className={cls} />;
        case FieldType.RELATION:
            return <Link className={cls} />;
        default:
            return <Type className={cls} />;
    }
}

/** Get icon for a view type. */
export function getViewIcon(type: ViewType, className?: string): React.ReactNode {
    const cls = className || ICON_CLASS;
    switch (type) {
        case ViewType.TABLE:
            return <Table2 className={cls} />;
        case ViewType.KANBAN:
            return <KanbanSquare className={cls} />;
        case ViewType.GALLERY:
            return <GalleryIcon className={cls} />;
        case ViewType.CALENDAR:
            return <CalendarIcon className={cls} />;
        case ViewType.TIMELINE:
            return <GanttChartSquare className={cls} />;
        case ViewType.CHART:
            return <BarChart3 className={cls} />;
        case ViewType.FORM:
            return <FormIcon className={cls} />;
        default:
            return <Table2 className={cls} />;
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
