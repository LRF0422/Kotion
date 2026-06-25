import React from "react";
import { Checkbox, Slider, Rate } from "@kn/ui";
import { FieldRendererProps, FieldEditorProps } from "./types";

// ---------------------------------------------------------------------------
// Checkbox field
// ---------------------------------------------------------------------------

export const CheckboxRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    return <Checkbox checked={Boolean(value)} disabled className="border-gray-400 dark:border-gray-500" />;
};

export const CheckboxEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return <Checkbox checked={Boolean(value)} onCheckedChange={onChange} />;
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
            <div className="flex items-center gap-1.5">
                <svg width="30" height="30" viewBox="0 0 30 30">
                    <circle cx="15" cy="15" r={radius} fill="none" stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth="3" />
                    <circle
                        cx="15"
                        cy="15"
                        r={radius}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="3"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        transform="rotate(-90 15 15)"
                    />
                </svg>
                <span className="text-xs text-gray-600 dark:text-gray-400">{progress}%</span>
            </div>
        );
    }

    if (field.format === "number") {
        return <div className="text-sm text-gray-900 dark:text-white tabular-nums">{progress}%</div>;
    }

    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs text-gray-600 dark:text-gray-400 w-10">{progress}%</span>
        </div>
    );
};

export const ProgressEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    const progress = typeof value === "number" ? value : 0;

    return (
        <div className="flex items-center gap-3 px-2 py-1">
            <Slider
                value={[progress]}
                onValueChange={(values) => onChange(values[0])}
                min={0}
                max={100}
                step={1}
                className="flex-1"
            />
            <span className="text-sm font-medium text-gray-900 dark:text-white w-12 text-right">{progress}%</span>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Rating field
// ---------------------------------------------------------------------------

export const RatingRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    return <Rate rating={typeof value === "number" ? value : 0} totalStars={5} variant="yellow" size={16} disabled />;
};

export const RatingEditor: React.FC<FieldEditorProps> = ({ value, onChange }) => {
    return <Rate rating={typeof value === "number" ? value : 0} totalStars={5} variant="yellow" onRatingChange={onChange} size={20} />;
};
