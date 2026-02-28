import React, { useState } from "react";
import { IconButton, Textarea } from "@kn/ui";
import { CheckIcon, XIcon } from "@kn/icon";

export interface CommentInputProps {
    onSubmit: (content: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
    onCancel?: () => void;
}

export const CommentInput: React.FC<CommentInputProps> = ({
    onSubmit,
    placeholder = "Write a comment...",
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
    };

    return (
        <div className="p-3 border-t space-y-2">
            <Textarea
                placeholder={placeholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="min-h-[60px] resize-none text-sm"
                spellCheck={false}
                autoFocus={autoFocus}
            />
            <div className="flex justify-end gap-1">
                {onCancel && (
                    <IconButton
                        icon={<XIcon className="h-4 w-4" />}
                        onClick={onCancel}
                    />
                )}
                <IconButton
                    icon={<CheckIcon className="h-4 w-4" />}
                    onClick={handleSubmit}
                    disabled={!value.trim()}
                />
            </div>
        </div>
    );
};
