import React from "react";
import { Checkbox, Slider, Rate } from "@kn/ui";
import { FieldRendererProps, FieldEditorProps } from "./types";

// ---------------------------------------------------------------------------
// Checkbox field
// ---------------------------------------------------------------------------

export const CheckboxRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    return (
        <div className="bitable-checkbox">
            <Checkbox checked={Boolean(value)} disabled />
        </div>
    );
};

export const CheckboxEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return (
        <div className="bitable-checkbox">
            <Checkbox checked={Boolean(value)} onCheckedChange={onChange} />
        </div>
    );
};

// ---------------------------------------------------------------------------
// Progress field
// ---------------------------------------------------------------------------

export const ProgressRenderer: React.FC<FieldRendererProps> = ({ value, field }) => {
    const progress = typeof value === "number" ? value : 0;

    if (field.format === "ring") {
        const radius = 12;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (progress / 100) * circumference;
        return (
            <div className="bitable-progress-ring">
                <svg width="30" height="30" viewBox="0 0 30 30">
                    <circle cx="15" cy="15" r={radius} fill="none" stroke="var(--bt-border)" strokeWidth="3" />
                    <circle
                        cx="15"
                        cy="15"
                        r={radius}
                        fill="none"
                        stroke="var(--bt-accent)"
                        strokeWidth="3"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        transform="rotate(-90 15 15)"
                    />
                </svg>
                <span className="bitable-progress-ring__text">{progress}%</span>
            </div>
        );
    }

    if (field.format === "number") {
        return <div className="bitable-progress-number">{progress}%</div>;
    }

    return (
        <div className="bitable-progress">
            <div className="bitable-progress__track">
                <div className="bitable-progress__fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="bitable-progress__text">{progress}%</span>
        </div>
    );
};

export const ProgressEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    const progress = typeof value === "number" ? value : 0;

    return (
        <div className="bitable-progress" style={{ padding: "4px 8px" }}>
            <Slider
                value={[progress]}
                onValueChange={(values) => onChange(values[0])}
                min={0}
                max={100}
                step={1}
                className="flex-1"
            />
            <span className="bitable-progress__text" style={{ minWidth: 36 }}>{progress}%</span>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Rating field
// ---------------------------------------------------------------------------

export const RatingRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    return (
        <div className="bitable-rating">
            <Rate rating={typeof value === "number" ? value : 0} totalStars={5} variant="yellow" size={16} disabled />
        </div>
    );
};

export const RatingEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return (
        <div className="bitable-rating">
            <Rate rating={typeof value === "number" ? value : 0} totalStars={5} variant="yellow" onRatingChange={onChange} size={20} />
        </div>
    );
};
