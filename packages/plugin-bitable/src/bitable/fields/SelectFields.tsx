import React from "react";
import { Checkbox } from "@kn/ui";
import { SelectOption } from "../../types";
import { getTagStyle } from "../../utils/colors";
import { resolveOptionId, resolveOptionIds } from "../../utils/selectValues";
import { FieldRendererProps, FieldEditorProps } from "./types";

// ---------------------------------------------------------------------------
// Single-select field
// ---------------------------------------------------------------------------

export const SelectRenderer: React.FC<FieldRendererProps> = ({ value, field }) => {
    if (!value) return <div className="bitable-field-empty" />;
    // Option ids are the storage format, but legacy cells may still hold the
    // option label; accept both so those cells are not rendered as empty.
    const resolvedId = resolveOptionId(field.options, value);
    const option = resolvedId
        ? field.options?.find((opt: SelectOption) => opt.id === resolvedId)
        : undefined;
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
    const currentId = resolveOptionId(options, value);

    React.useEffect(() => {
        const currentIndex = options.findIndex((opt: SelectOption) => opt.id === currentId);
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
                const isSelected = opt.id === currentId;
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
    if (value === null || value === undefined || value === "") {
        return <div className="bitable-field-empty" />;
    }

    const resolvedIds = resolveOptionIds(field.options, value);
    if (resolvedIds.length === 0) return <div className="bitable-field-empty" />;

    return (
        <div className="bitable-tag-group">
            {resolvedIds.map((id) => {
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
    const options = field.options || [];
    // Toggling must start from resolved ids: with a legacy label value the
    // clicked option would otherwise be appended as a duplicate. Tokens that
    // resolve to no option are carried through untouched, so an unrelated
    // toggle never silently deletes stored data.
    const selectedValues = resolveOptionIds(options, value);
    const rawValues = Array.isArray(value)
        ? value
        : value === null || value === undefined || value === ""
          ? []
          : [value];
    const danglingValues = rawValues.filter(
        (token) => token !== null && token !== undefined && token !== "" && resolveOptionId(options, token) === null
    );
    const [focusedIndex, setFocusedIndex] = React.useState(0);
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        containerRef.current?.focus();
    }, []);

    const toggleOption = (optId: string) => {
        const next = selectedValues.includes(optId)
            ? selectedValues.filter((id) => id !== optId)
            : [...selectedValues, optId];
        onChange([...next, ...danglingValues]);
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
