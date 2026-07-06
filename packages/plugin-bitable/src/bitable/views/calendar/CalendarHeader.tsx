import React, { useMemo } from "react";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, List, Columns, Grid2x2, Grid3x3, CalendarRange, Settings2 } from "@kn/icon";
import { Button, Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Label, Popover, PopoverContent, PopoverTrigger } from "@kn/ui";
import { useTranslation } from "@kn/common";
import { useCalendar } from "./CalendarContext";
import { navigateDate, rangeText, getEventsCount } from "./helpers";
import type { CalendarViewMode } from "./types";
import type { CalendarEvent } from "./types";
import type { FieldConfig } from "../../../types";

const VIEW_ICONS: Record<CalendarViewMode, React.ReactNode> = {
    day: <List strokeWidth={1.8} />,
    week: <Columns strokeWidth={1.8} />,
    month: <Grid2x2 strokeWidth={1.8} />,
    year: <Grid3x3 strokeWidth={1.8} />,
    agenda: <CalendarRange strokeWidth={1.8} />,
};

interface CalendarHeaderProps {
    events: CalendarEvent[];
    /** Field config for settings popover */
    dateFields: FieldConfig[];
    textFields: FieldConfig[];
    config: { dateField: string; endDateField?: string; titleField?: string };
    onConfigChange: (key: "dateField" | "endDateField" | "titleField", value: string) => void;
}

export function CalendarHeader({ events, dateFields, textFields, config, onConfigChange }: CalendarHeaderProps) {
    const { t } = useTranslation();
    const { selectedDate, setSelectedDate, view, setView, editable } = useCalendar();

    const month = format(selectedDate, "MMMM");
    const year = selectedDate.getFullYear();
    const eventCount = useMemo(() => getEventsCount(events, selectedDate, view), [events, selectedDate, view]);

    const handlePrev = () => setSelectedDate(navigateDate(selectedDate, view, "previous"));
    const handleNext = () => setSelectedDate(navigateDate(selectedDate, view, "next"));
    const handleToday = () => setSelectedDate(new Date());

    const views: CalendarViewMode[] = ["day", "week", "month", "year", "agenda"];
    const viewLabels: Record<CalendarViewMode, string> = {
        day: t("bitable.calendarView.day"),
        week: t("bitable.calendarView.week"),
        month: t("bitable.calendarView.month"),
        year: t("bitable.calendarView.year"),
        agenda: t("bitable.calendarView.agenda"),
    };

    return (
        <div className="bitable-cal-header">
            {/* Left: Today + Date navigation */}
            <div className="bitable-cal-header__nav">
                <button className="bitable-cal-today-btn" onClick={handleToday}>
                    <span className="bitable-cal-today-btn__month">{format(new Date(), "MMM").toUpperCase()}</span>
                    <span className="bitable-cal-today-btn__day">{new Date().getDate()}</span>
                </button>
                <div className="bitable-cal-header__date-nav">
                    <div className="bitable-cal-header__date-row">
                        <span className="bitable-cal-header__date-label">{month} {year}</span>
                        {eventCount > 0 && (
                            <Badge variant="outline" className="bitable-cal-header__count">{eventCount} events</Badge>
                        )}
                    </div>
                    <div className="bitable-cal-header__date-controls">
                        <Button variant="outline" size="icon" className="bitable-cal-header__arrow" onClick={handlePrev}>
                            <ChevronLeft />
                        </Button>
                        <span className="bitable-cal-header__range">{rangeText(view, selectedDate)}</span>
                        <Button variant="outline" size="icon" className="bitable-cal-header__arrow" onClick={handleNext}>
                            <ChevronRight />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Right: View switcher + Settings */}
            <div className="bitable-cal-header__actions">
                <div className="bitable-cal-view-switcher">
                    {views.map(v => (
                        <Button
                            key={v}
                            variant={view === v ? "default" : "outline"}
                            size="icon"
                            className="bitable-cal-view-switcher__btn"
                            onClick={() => setView(v)}
                            aria-label={viewLabels[v]}
                        >
                            {VIEW_ICONS[v]}
                        </Button>
                    ))}
                </div>
                {editable && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="icon" aria-label={t("bitable.calendarView.settings")}>
                                <Settings2 className="h-4 w-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80">
                            <div className="bitable-cal-settings">
                                <h3 className="bitable-cal-settings__title">{t("bitable.calendarView.settings")}</h3>
                                <div className="bitable-cal-settings__field">
                                    <Label>{t("bitable.calendarView.startDateField")}</Label>
                                    <Select value={config.dateField} onValueChange={(v) => onConfigChange("dateField", v)}>
                                        <SelectTrigger><SelectValue placeholder={t("bitable.calendarView.selectDateField")} /></SelectTrigger>
                                        <SelectContent>
                                            {dateFields.map(f => <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="bitable-cal-settings__field">
                                    <Label>{t("bitable.calendarView.endDateField")}</Label>
                                    <Select value={config.endDateField || ""} onValueChange={(v) => onConfigChange("endDateField", v)}>
                                        <SelectTrigger><SelectValue placeholder={t("bitable.calendarView.selectEndDateField")} /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="">{t("bitable.calendarView.noneField")}</SelectItem>
                                            {dateFields.map(f => <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="bitable-cal-settings__field">
                                    <Label>{t("bitable.calendarView.titleField")}</Label>
                                    <Select value={config.titleField || ""} onValueChange={(v) => onConfigChange("titleField", v)}>
                                        <SelectTrigger><SelectValue placeholder={t("bitable.calendarView.selectTitleField")} /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="">{t("bitable.calendarView.auto")}</SelectItem>
                                            {textFields.map(f => <SelectItem key={f.id} value={f.id}>{f.title}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                )}
            </div>
        </div>
    );
}
