import React from "react";
import { DateTimePicker } from "@kn/ui";
import { format } from "date-fns";
import { useDateLocale } from "./shared";
import { FieldRendererProps, FieldEditorProps } from "./types";

export const DateRenderer: React.FC<FieldRendererProps> = ({ value, field }) => {
    const locale = useDateLocale();
    if (!value) return <div className="bitable-field-empty" />;
    try {
        const dateFormat = field.format || "yyyy-MM-dd";
        return (
            <div className="bitable-field-date">
                {format(new Date(value), dateFormat, { locale })}
            </div>
        );
    } catch {
        return <div className="bitable-field-empty" />;
    }
};

export const DateEditor: React.FC<FieldEditorProps> = ({ value, onChange, field }) => {
    const locale = useDateLocale();
    const dateFormat = field?.format || "yyyy-MM-dd";
    const hasTime = dateFormat.includes("HH");

    const handleChange = (date: Date | undefined) => {
        if (!date) {
            onChange(undefined);
            return;
        }
        if (!hasTime) {
            // Date-only: strip time to avoid inconsistent storage
            const dateOnly = format(date, "yyyy-MM-dd");
            onChange(dateOnly);
        } else {
            onChange(date.toISOString());
        }
    };

    const parseValue = (v: any): Date | undefined => {
        if (!v) return undefined;
        try {
            return new Date(v);
        } catch {
            return undefined;
        }
    };

    return (
        <DateTimePicker
            value={parseValue(value)}
            onChange={handleChange}
            locale={locale}
            weekStartsOn={1}
            showWeekNumber={true}
            showOutsideDays={true}
            granularity={hasTime ? "second" : "day"}
            displayFormat={
                hasTime
                    ? { hour24: dateFormat, hour12: dateFormat }
                    : { hour24: dateFormat, hour12: dateFormat }
            }
            className="h-full"
        />
    );
};
