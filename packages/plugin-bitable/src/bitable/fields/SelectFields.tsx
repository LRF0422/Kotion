import React from "react";
import { Checkbox } from "@kn/ui";
import { SelectOption } from "../../types";
import { getTagStyle } from "../../utils/colors";
import { FieldRendererProps, FieldEditorProps } from "./types";

// ---------------------------------------------------------------------------
// Single-select field
// ---------------------------------------------------------------------------

export const SelectRenderer: React.FC<FieldRendererProps> = ({ value, field }) => {
    if (!value) return <div className="bitable-field-empty" />;
    const option = field.options?.find((opt: SelectOption) => opt.id === value);
    if (!option) return <div className="bitable-field-empty" />;

    const style = getTagStyle(option.color);

    return (
        <span
            className="bitable-tag"
            style={{ backgroundColor: style.bg, color: style.text }}
        >
            {option.label}
        </span>
    );
};

export const SelectEditor: React.FC<FieldEditorProps> = ({ value, field, onChange }) => {
    const [highlightedIndex, setHighlightedIndex] = React.useState(0);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const options = field.options || [];

    React.useEffect(() => {
        const currentIndex = options.findIndex((opt: SelectOption) => opt.id === value);
        if (currentIndex >= 0) {
            setHighlightedIndex(currentIndex);
        }
    }, []);

    React.useEffect(() => {
        containerRef.current?.focus();
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setHighlightedIndex((prev) => (prev + 1) % options.length);
                break;
            case "ArrowUp":
                e.preventDefault();
                setHighlightedIndex((prev) => (prev - 1 + options.length) % options.length);
                break;
            case "Enter":
                e.preventDefault();
                if (highlightedIndex >= 0 && highlightedIndex < options.length) {
                    onChange(options[highlightedIndex].id);
                }
                break;
            case "Escape":
                e.preventDefault();
                containerRef.current?.blur();
                break;
        }
    };

    return (
        <div
            ref={containerRef}
            className="bitable-select-editor"
            onKeyDown={handleKeyDown}
            tabIndex={0}
        >
            {options.map((opt: SelectOption, index: number) => {
                const style = getTagStyle(opt.color);
                const isSelected = opt.id === value;
                return (
                    <div
                        key={opt.id}
                        className={`bitable-select-editor__option${index === highlightedIndex ? " bitable-select-editor__option--active" : ""}`}
                        onClick={() => onChange(opt.id)}
                        onMouseEnter={() => setHighlightedIndex(index)}
                    >
                        <span
                            className="bitable-tag"
                            style={{ backgroundColor: style.bg, color: style.text }}
                        >
                            {opt.label}
                        </span>
                        {isSelected && (
                            <svg
                                className="bitable-select-editor__check"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Multi-select field
// ---------------------------------------------------------------------------

export const MultiSelectRenderer: React.FC<FieldRendererProps> = ({ value, field }) => {
    if (!Array.isArray(value) || value.length === 0) return <div className="bitable-field-empty" />;

    return (
        <div className="bitable-tag-group">
            {value.map((id) => {
                const option = field.options?.find((opt: SelectOption) => opt.id === id);
                if (!option) return null;
                const style = getTagStyle(option.color);
                return (
                    <span
                        key={id}
                        className="bitable-tag"
                        style={{ backgroundColor: style.bg, color: style.text }}
                    >
                        {option.label}
                    </span>
                );
            })}
        </div>
    );
};

export const MultiSelectEditor: React.FC<FieldEditorProps> = ({ value, field, onChange }) => {
    const selectedValues = Array.isArray(value) ? value : [];
    const [focusedIndex, setFocusedIndex] = React.useState(0);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const options = field.options || [];

    React.useEffect(() => {
        containerRef.current?.focus();
    }, []);

    const toggleOption = (optId: string) => {
        if (selectedValues.includes(optId)) {
            onChange(selectedValues.filter((id) => id !== optId));
        } else {
            onChange([...selectedValues, optId]);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setFocusedIndex((prev) => Math.min(prev + 1, options.length - 1));
                break;
            case "ArrowUp":
                e.preventDefault();
                setFocusedIndex((prev) => Math.max(prev - 1, 0));
                break;
            case "Enter":
            case " ":
                e.preventDefault();
                if (focusedIndex >= 0 && focusedIndex < options.length) {
                    toggleOption(options[focusedIndex].id);
                }
                break;
            case "Escape":
                e.preventDefault();
                containerRef.current?.blur();
                break;
        }
    };

    return (
        <div
            ref={containerRef}
            className="bitable-select-editor"
            onKeyDown={handleKeyDown}
            tabIndex={0}
        >
            {options.map((opt: SelectOption, index: number) => {
                const isChecked = selectedValues.includes(opt.id);
                const style = getTagStyle(opt.color);
                return (
                    <div
                        key={opt.id}
                        className={`bitable-select-editor__option${index === focusedIndex ? " bitable-select-editor__option--active" : ""}`}
                        onClick={() => toggleOption(opt.id)}
                        onMouseEnter={() => setFocusedIndex(index)}
                    >
                        <Checkbox checked={isChecked} className="pointer-events-none" />
                        <span
                            className="bitable-tag"
                            style={{ backgroundColor: style.bg, color: style.text }}
                        >
                            {opt.label}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};
