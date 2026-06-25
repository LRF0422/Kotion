import React from "react";
import { Input } from "@kn/ui";
import { FieldRendererProps, FieldEditorProps } from "./types";

// ---------------------------------------------------------------------------
// Text field
// ---------------------------------------------------------------------------

export const TextRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    // Handle object-type data (possibly converted from another field type)
    if (value && typeof value === "object") {
        if (typeof value.content === "string") {
            return <div className="text-sm text-gray-900 dark:text-white truncate">{value.content}</div>;
        }
        if (typeof value.text === "string") {
            return <div className="text-sm text-gray-900 dark:text-white truncate">{value.text}</div>;
        }
        if (typeof value.label === "string") {
            return <div className="text-sm text-gray-900 dark:text-white truncate">{value.label}</div>;
        }
        return <div className="text-sm text-gray-900 dark:text-white truncate">{JSON.stringify(value)}</div>;
    }
    return <div className="text-sm text-gray-900 dark:text-white truncate">{value || ""}</div>;
};

export const TextEditor: React.FC<FieldEditorProps> = ({ value, onChange, onCommit }) => {
    const displayValue = typeof value === "string" ? value : value?.content || value?.text || value?.label || "";

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            onCommit?.();
        } else if (e.key === "Escape") {
            e.preventDefault();
            e.currentTarget.blur();
        }
    };

    return (
        <input
            autoFocus
            value={displayValue}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full h-full px-2 bg-transparent text-sm text-gray-900 dark:text-white outline-none caret-blue-500 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            placeholder="..."
        />
    );
};

// ---------------------------------------------------------------------------
// Number field
// ---------------------------------------------------------------------------

export const NumberRenderer: React.FC<FieldRendererProps> = ({ value, field }) => {
    if (typeof value !== "number") return <div></div>;
    let formatted: string;
    switch (field.format) {
        case "currency":
            formatted = `¥${value.toLocaleString()}`;
            break;
        case "percent":
            formatted = `${value}%`;
            break;
        case "decimal":
            formatted = value.toFixed(2);
            break;
        default:
            formatted = value.toLocaleString();
    }
    return <div className="text-sm text-gray-900 dark:text-white text-right tabular-nums">{formatted}</div>;
};

export const NumberEditor: React.FC<FieldEditorProps> = ({ value, onChange, onCommit }) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            onCommit?.();
        } else if (e.key === "Escape") {
            e.preventDefault();
            e.currentTarget.blur();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            onChange((Number(value) || 0) + 1);
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            onChange((Number(value) || 0) - 1);
        }
    };

    return (
        <Input
            autoFocus
            type="number"
            value={value || 0}
            onChange={(e) => onChange(Number(e.target.value))}
            onKeyDown={handleKeyDown}
            className="h-full border-0 bg-white dark:bg-card text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
        />
    );
};

// ---------------------------------------------------------------------------
// ID / Auto-number field (read-only)
// ---------------------------------------------------------------------------

export const IDRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    return <div className="text-sm font-mono text-gray-500 dark:text-gray-400">{value}</div>;
};

export const IDEditor: React.FC<FieldEditorProps> = ({ value }) => {
    return <div className="text-sm font-mono text-gray-500 dark:text-gray-400 p-2">{value}</div>;
};
