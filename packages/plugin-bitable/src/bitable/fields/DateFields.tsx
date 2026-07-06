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
        const formatStr = dateFormat.includes("HH")
            ? "MMM d, yyyy h:mm a"
            : "MMM d, yyyy";
        return (
            <div className="bitable-field-date">
                {format(new Date(value), formatStr, { locale })}
            </div>
        );
    } catch {
        return <div className="bitable-field-empty" />;
    }
};

export const DateEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    const locale = useDateLocale();
    return (
        <DateTimePicker
            value={value ? new Date(value) : undefined}
            onChange={(date) => onChange(date?.toISOString())}
            locale={locale}
            weekStartsOn={1}
            showWeekNumber={true}
            showOutsideDays={true}
            className="h-full"
        />
    );
};
