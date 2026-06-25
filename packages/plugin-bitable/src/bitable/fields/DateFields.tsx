import React from "react";
import { DateTimePicker } from "@kn/ui";
import { format } from "date-fns";
import { useDateLocale } from "./shared";
import { FieldRendererProps, FieldEditorProps } from "./types";

export const DateRenderer: React.FC<FieldRendererProps> = ({ value, field }) => {
    const locale = useDateLocale();
    if (!value) return <div></div>;
    try {
        const dateFormat = field.format || "yyyy-MM-dd";
        const formatStr = dateFormat.includes("HH")
            ? "MMMM d, yyyy h:mm a"
            : "MMMM d, yyyy";
        return (
            <div className="text-sm text-gray-600 dark:text-gray-400">
                {format(new Date(value), formatStr, { locale })}
            </div>
        );
    } catch {
        return <div></div>;
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
