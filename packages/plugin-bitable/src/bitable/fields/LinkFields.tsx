import React from "react";
import { Input } from "@kn/ui";
import { Link as LinkIcon, Mail, Phone } from "@kn/icon";
import { FieldRendererProps, FieldEditorProps } from "./types";

const EDITOR_CLASS = "bitable-text-editor";

// ---------------------------------------------------------------------------
// URL field
// ---------------------------------------------------------------------------

export const URLRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    if (!value) return <div className="bitable-field-empty" />;
    return (
        <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="bitable-field-link"
        >
            <LinkIcon />
            <span>{value}</span>
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
            className={EDITOR_CLASS}
        />
    );
};

// ---------------------------------------------------------------------------
// Email field
// ---------------------------------------------------------------------------

export const EmailRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    if (!value) return <div className="bitable-field-empty" />;
    return (
        <a
            href={`mailto:${value}`}
            className="bitable-field-link"
        >
            <Mail />
            <span>{value}</span>
        </a>
    );
};

export const EmailEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return (
        <Input autoFocus type="email" value={value || ""} onChange={(e) => onChange(e.target.value)} className={EDITOR_CLASS} />
    );
};

// ---------------------------------------------------------------------------
// Phone field
// ---------------------------------------------------------------------------

export const PhoneRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    if (!value) return <div className="bitable-field-empty" />;
    return (
        <a
            href={`tel:${value}`}
            className="bitable-field-link"
        >
            <Phone />
            <span>{value}</span>
        </a>
    );
};

export const PhoneEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return (
        <Input autoFocus type="tel" value={value || ""} onChange={(e) => onChange(e.target.value)} className={EDITOR_CLASS} />
    );
};
