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
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
            // Blur to exit edit mode
            (e.target as HTMLTextAreaElement).blur();
        }
        if (e.key === 'Escape' && onCancel) {
            onCancel();
        }
    };

    return (
        <div className="p-3 border-t border-border/50 bg-muted/20">
            <div className="relative">
                <Textarea
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="min-h-[60px] resize-none text-[13px] border-border/60 bg-background/80 backdrop-blur-sm focus:bg-background transition-colors placeholder:text-muted-foreground/50"
                    spellCheck={false}
                    autoFocus={autoFocus}
                />
            </div>
            <div className="flex items-center justify-between mt-2.5">
                <span className="text-[11px] text-muted-foreground/50 font-medium">
                    Enter to send, Esc to cancel
                </span>
                <div className="flex gap-2">
                    {onCancel && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
                            onClick={onCancel}
                        >
                            Cancel
                        </Button>
                    )}
                    <Button
                        size="sm"
                        className="h-7 px-3 text-xs font-medium gap-1.5"
                        onClick={handleSubmit}
                        disabled={!value.trim()}
                    >
                        <SendHorizontal className="h-3.5 w-3.5" />
                        Send
                    </Button>
                </div>
            </div>
        </div>
    );
};
