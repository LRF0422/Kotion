import React from "react";
import { Input } from "@kn/ui";
import { FieldRendererProps, FieldEditorProps } from "./types";

// ---------------------------------------------------------------------------
// Text field
// ---------------------------------------------------------------------------

/**
 * Extract a displayable string from any value type.
 * Handles objects that may have been stored from field-type conversions.
 */
function toText(value: any): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "✓" : "";
    if (typeof value === "object") {
        // Try common property names before giving up
        const text = value.content || value.text || value.label || value.name || value.title || value.value;
        if (typeof text === "string") return text;
        if (typeof text === "number") return String(text);
        // Last resort — don't show [object Object], just empty
        return "";
    }
    return String(value);
}

export const TextRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    const text = toText(value);
    if (!text) return <div className="bitable-field-empty" />;
    return <div className="bitable-field-text">{text}</div>;
};

export const TextEditor: React.FC<FieldEditorProps> = ({ value, onChange, onCommit }) => {
    const displayValue = toText(value);

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
            className="bitable-text-editor"
            placeholder="..."
        />
    );
};

// ---------------------------------------------------------------------------
// Long text (multi-line) field
// ---------------------------------------------------------------------------

export const LongTextRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    const text = toText(value);
    if (!text) return <div className="bitable-field-empty" />;
    return (
        <div className="bitable-field-long-text">
            {text}
        </div>
    );
};

export const LongTextEditor: React.FC<FieldEditorProps> = ({ value, onChange, onCommit }) => {
    const displayValue = toText(value);

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
            className="bitable-text-editor"
            placeholder="..."
        />
    );
};

// ---------------------------------------------------------------------------
// Number field
// ---------------------------------------------------------------------------

export const NumberRenderer: React.FC<FieldRendererProps> = ({ value, field }) => {
    if (typeof value !== "number") return <div className="bitable-field-empty" />;
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
    return <div className="bitable-field-number">{formatted}</div>;
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
            className="bitable-text-editor"
        />
    );
};

// ---------------------------------------------------------------------------
// ID / Auto-number field (read-only)
// ---------------------------------------------------------------------------

export const IDRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    if (!value && value !== 0) return <div className="bitable-field-empty" />;
    return <div className="bitable-field-id">{value}</div>;
};

export const IDEditor: React.FC<FieldEditorProps> = ({ value }) => {
    return <div className="bitable-field-id" style={{ padding: "4px 8px" }}>{value}</div>;
};
