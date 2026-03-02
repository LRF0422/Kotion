import React, { useState } from "react";
import { Button, Textarea } from "@kn/ui";
import { SendHorizontal } from "@kn/icon";

export interface CommentInputProps {
    onSubmit: (content: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
    onCancel?: () => void;
}

export const CommentInput: React.FC<CommentInputProps> = ({
    onSubmit,
    placeholder = "Comment...",
    autoFocus = false,
    onCancel,
}) => {
    const [value, setValue] = useState('');

    const handleSubmit = () => {
        if (!value.trim()) return;
        onSubmit(value.trim());
        setValue('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === 'Escape' && onCancel) {
            onCancel();
        }
    };

    return (
        <div className="p-3 border-t border-border/50">
            <Textarea
                placeholder={placeholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="min-h-[56px] resize-none text-[13px] border-0 p-0 shadow-none focus-visible:ring-0 bg-transparent placeholder:text-muted-foreground/50"
                spellCheck={false}
                autoFocus={autoFocus}
            />
            <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-muted-foreground/50">
                    Ctrl+Enter
                </span>
                <div className="flex gap-1.5">
                    {onCancel && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2.5 text-xs text-muted-foreground"
                            onClick={onCancel}
                        >
                            Cancel
                        </Button>
                    )}
                    <Button
                        size="sm"
                        className="h-7 px-3 text-xs gap-1"
                        onClick={handleSubmit}
                        disabled={!value.trim()}
                    >
                        <SendHorizontal className="h-3 w-3" />
                        Send
                    </Button>
                </div>
            </div>
        </div>
    );
};
