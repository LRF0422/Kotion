import React from "react";
import { Input } from "@kn/ui";
import { Link as LinkIcon, Mail, Phone } from "@kn/icon";
import { FieldRendererProps, FieldEditorProps } from "./types";

const INPUT_CLASS =
    "h-full border-0 bg-white dark:bg-card text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500";

// ---------------------------------------------------------------------------
// URL field
// ---------------------------------------------------------------------------

export const URLRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    if (!value) return <div></div>;
    return (
        <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline flex items-center gap-1 text-sm"
        >
            <LinkIcon className="h-3 w-3" />
            <span className="truncate max-w-[200px]">{value}</span>
        </a>
    );
};

export const URLEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return (
        <Input
            autoFocus
            type="url"
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://"
            className={INPUT_CLASS}
        />
    );
};

// ---------------------------------------------------------------------------
// Email field
// ---------------------------------------------------------------------------

export const EmailRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    if (!value) return <div></div>;
    return (
        <a
            href={`mailto:${value}`}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline flex items-center gap-1 text-sm"
        >
            <Mail className="h-3 w-3" />
            {value}
        </a>
    );
};

export const EmailEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return (
        <Input autoFocus type="email" value={value || ""} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS} />
    );
};

// ---------------------------------------------------------------------------
// Phone field
// ---------------------------------------------------------------------------

export const PhoneRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    if (!value) return <div></div>;
    return (
        <a
            href={`tel:${value}`}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline flex items-center gap-1 text-sm"
        >
            <Phone className="h-3 w-3" />
            {value}
        </a>
    );
};

export const PhoneEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return (
        <Input autoFocus type="tel" value={value || ""} onChange={(e) => onChange(e.target.value)} className={INPUT_CLASS} />
    );
};
