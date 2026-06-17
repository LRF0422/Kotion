import React, { useState } from "react";
import { Button, Textarea } from "@kn/ui";
import { SendHorizontal, X } from "@kn/icon";

export interface CommentInputProps {
    onSubmit: (content: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
    onCancel?: () => void;
    /** Pre-fill the textarea (used for edit mode). */
    initialValue?: string;
    /** Label for the submit button. Defaults to "Send". */
    submitLabel?: string;
    /** Optional context shown above the input, e.g. "Replying to Alice". */
    contextLabel?: React.ReactNode;
    /** Compact paddings/sizes for tight margin cards. */
    compact?: boolean;
}

export const CommentInput: React.FC<CommentInputProps> = ({
    onSubmit,
    placeholder = "Comment...",
    autoFocus = false,
    onCancel,
    initialValue = "",
    submitLabel = "Send",
    contextLabel,
    compact = false,
}) => {
    const [value, setValue] = useState(initialValue);

    const handleSubmit = () => {
        const trimmed = value.trim();
        if (!trimmed) return;
        onSubmit(trimmed);
        setValue("");
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === "Escape" && onCancel) {
            e.preventDefault();
            onCancel();
        }
    };

    return (
        <div>
            {contextLabel && (
                <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate">{contextLabel}</span>
                    {onCancel && (
                        <button
                            type="button"
                            className="flex-shrink-0 rounded-sm p-0.5 hover:bg-accent hover:text-accent-foreground transition-colors"
                            onClick={onCancel}
                            aria-label="Cancel"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            )}
            <Textarea
                placeholder={placeholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className={`resize-none text-sm ${compact ? "min-h-[38px]" : "min-h-[60px]"}`}
                spellCheck={false}
                autoFocus={autoFocus}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Enter to send · Esc to cancel</span>
                <div className="flex items-center gap-1.5">
                    {onCancel && !contextLabel && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2.5 text-xs"
                            onClick={onCancel}
                        >
                            Cancel
                        </Button>
                    )}
                    <Button
                        size="sm"
                        className="h-7 gap-1.5 px-2.5 text-xs"
                        onClick={handleSubmit}
                        disabled={!value.trim()}
                    >
                        {!compact && <SendHorizontal className="h-3.5 w-3.5" />}
                        {submitLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
};
