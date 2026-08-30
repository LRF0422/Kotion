import React, { useMemo } from "react";
import { parseISO, isSameDay, isSameMonth, isSameWeek, isSameYear, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Label } from "@kn/ui";
import { useTranslation } from "@kn/common";
import { FieldConfig, RecordData, ViewConfig } from "../../../types";
import { CalendarProvider, useCalendar } from "./CalendarContext";
import { CalendarDndProvider } from "./dnd";
import { CalendarHeader } from "./CalendarHeader";
import { CalendarMonthView } from "./CalendarMonthView";
import { CalendarWeekView } from "./CalendarWeekView";
import { CalendarDayView } from "./CalendarDayView";
import { CalendarAgendaView } from "./CalendarAgendaView";
import { CalendarYearView } from "./CalendarYearView";
import { EVENT_COLORS } from "./types";
import type { CalendarEvent } from "./types";

interface CalendarViewProps {
    view: ViewConfig;
    fields: FieldConfig[];
    data: RecordData[];
    onCreateRecord: (values: Partial<RecordData>) => RecordData;
    onUpdateRecord: (recordId: string, updates: Partial<RecordData>) => void;
    onDeleteRecord: (recordIds: string[]) => void;
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
    editable: boolean;
    onRecordClick: (record: RecordData) => void;
}

/* ================ Client Container (event filtering + view routing) ================ */

function ClientContainer() {
    const { selectedDate, events, view } = useCalendar();

    const filtered = useMemo(() => {
        return events.filter(e => {
            const start = new Date(e.startDate);
            const end = new Date(e.endDate);

            if (view === "year") {
                const yStart = startOfYear(selectedDate);
                const yEnd = endOfYear(selectedDate);
                return start <= yEnd && end >= yStart;
            }
            if (view === "month" || view === "agenda") {
                const mStart = startOfMonth(selectedDate);
                const mEnd = endOfMonth(selectedDate);
                return start <= mEnd && end >= mStart;
            }
            if (view === "week") {
                const wStart = startOfWeek(selectedDate);
                const wEnd = endOfWeek(selectedDate);
                return start <= wEnd && end >= wStart;
            }
            // day
            return isSameDay(start, selectedDate) || isSameDay(end, selectedDate) ||
                (start <= selectedDate && end >= selectedDate);
        });
    }, [selectedDate, events, view]);

    const singleDayEvents = filtered.filter(e => isSameDay(new Date(e.startDate), new Date(e.endDate)));
    const multiDayEvents = filtered.filter(e => !isSameDay(new Date(e.startDate), new Date(e.endDate)));

    // Year view only uses start dates
    const yearEvents = useMemo(() => filtered.map(e => ({ ...e, endDate: e.startDate })), [filtered]);

    return (
        <CalendarDndProvider>
            {view === "month" && <CalendarMonthView singleDayEvents={singleDayEvents} multiDayEvents={multiDayEvents} />}
            {view === "day" && <CalendarDayView singleDayEvents={singleDayEvents} multiDayEvents={multiDayEvents} />}
            {view === "week" && <CalendarWeekView singleDayEvents={singleDayEvents} multiDayEvents={multiDayEvents} />}
            {view === "year" && <CalendarYearView allEvents={yearEvents} />}
            {view === "agenda" && <CalendarAgendaView singleDayEvents={singleDayEvents} multiDayEvents={multiDayEvents} />}
        </CalendarDndProvider>
    );
}

/* ================ Main CalendarView ================ */

export const CalendarView: React.FC<CalendarViewProps> = (props) => {
    const { view, fields, data, onCreateRecord, onUpdateRecord, onUpdateView, editable, onRecordClick } = props;
    const { t } = useTranslation();

    const config = view.calendarConfig || { dateField: "" };
    const dateFields = useMemo(() => fields.filter(f => f.type === "date"), [fields]);
    const textFields = useMemo(() => fields.filter(f => f.type === "text"), [fields]);
    const dateField = fields.find(f => f.id === config.dateField);
    const endDateField = config.endDateField ? fields.find(f => f.id === config.endDateField) : null;
    const titleField = config.titleField ? fields.find(f => f.id === config.titleField) : textFields[0];

    // Convert RecordData -> CalendarEvent[]
    const events: CalendarEvent[] = useMemo(() => {
        if (!dateField) return [];
        return data
            .filter(r => r[dateField.id])
            .map((r, idx) => {
                let startDate: string;
                let endDate: string;
                try {
                    const sv = r[dateField.id];
                    if (typeof sv === "string") startDate = parseISO(sv).toISOString();
                    else if (sv instanceof Date) startDate = sv.toISOString();
                    else return null;

                    if (endDateField && r[endDateField.id]) {
                        const ev = r[endDateField.id];
                        if (typeof ev === "string") endDate = parseISO(ev).toISOString();
                        else if (ev instanceof Date) endDate = ev.toISOString();
                        else endDate = startDate;
                    } else {
                        endDate = startDate;
                    }
                } catch { return null; }

                const title = titleField && r[titleField.id] ? String(r[titleField.id]) : `Record ${idx + 1}`;
                const recordId = String(r.id);
                const hash = recordId.split("").reduce(
                    (acc, character) => ((acc << 5) - acc + character.charCodeAt(0)) | 0,
                    0
                );
                const color = EVENT_COLORS[Math.abs(hash) % EVENT_COLORS.length];

                return { id: recordId, recordId, startDate, endDate, title, color };
            })
            .filter((e): e is CalendarEvent => e !== null);
    }, [data, dateField, endDateField, titleField]);

    const handleEventMove = (recordId: string, start: Date, end: Date) => {
        if (!dateField) return;
        const updates: Partial<RecordData> = { [dateField.id]: start.toISOString() };
        if (endDateField) updates[endDateField.id] = end.toISOString();
        onUpdateRecord(recordId, updates);
    };

    const handleCreateAtSlot = (date: Date) => {
        if (!dateField) return;
        const values: Partial<RecordData> = { [dateField.id]: date.toISOString() };
        if (endDateField) values[endDateField.id] = date.toISOString();
        const record = onCreateRecord(values);
        onRecordClick(record);
    };

    const handleConfigChange = (
        key: "dateField" | "endDateField" | "titleField",
        value: string | undefined
    ) => {
        const newConfig = { ...config, [key]: value };
        onUpdateView(view.id, { calendarConfig: newConfig });
    };

    // No date fields available
    if (dateFields.length === 0) {
        return (
            <div className="bitable-cal-empty">
                <p className="bitable-cal-empty__title">{t("bitable.calendarView.noDateFields")}</p>
                <p className="bitable-cal-empty__desc">{t("bitable.calendarView.noDateFieldsDesc")}</p>
            </div>
        );
    }

    // Date field not configured yet
    if (!config.dateField) {
        return (
            <div className="bitable-cal-empty">
                <p className="bitable-cal-empty__title">{t("bitable.calendarView.configure")}</p>
                <p className="bitable-cal-empty__desc">{t("bitable.calendarView.configureDesc")}</p>
                <div className="bitable-cal-empty__config">
                    <Label>{t("bitable.calendarView.dateField")}</Label>
                    <Select value={config.dateField} onValueChange={(v) => handleConfigChange("dateField", v)}>
                        <SelectTrigger><SelectValue placeholder={t("bitable.calendarView.selectDateField")} /></SelectTrigger>
                        <SelectContent>
                            {dateFields.map(f => <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>
        );
    }

    return (
        <CalendarProvider
            events={events}
            onEventMove={handleEventMove}
            onRecordClick={(recordId) => {
                const record = data.find((candidate) => String(candidate.id) === String(recordId));
                if (record) onRecordClick(record);
            }}
            onCreateAtSlot={handleCreateAtSlot}
            editable={editable}
        >
            <CalendarHeader
                events={events}
                dateFields={dateFields}
                textFields={textFields}
                config={config}
                onConfigChange={handleConfigChange}
            />
            <ClientContainer />
        </CalendarProvider>
    );
};
