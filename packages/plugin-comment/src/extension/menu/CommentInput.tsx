import React, { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage, Button, Textarea } from "@kn/ui";
import { ArrowUp, AtSign, Paperclip, X } from "@kn/icon";
import { getCurrentUser } from "../comment";
import { getAvatarColor, getInitial } from "./utils";

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
    /**
     * Visual style. "composer" is the Notion-like reply box (rounded surface,
     * leading avatar, attach/mention icons, circular send). "edit" is the plain
     * textarea + Save/Cancel pair used for inline editing.
     */
    variant?: "composer" | "edit";
    /** Show the attach / mention affordances on the composer's action row. */
    showAttachments?: boolean;
    /** Show the current user's avatar at the start of the composer. */
    showAvatar?: boolean;
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
    variant = "composer",
    showAttachments = false,
    showAvatar = false,
}) => {
    const [value, setValue] = useState(initialValue);
    const canSubmit = !!value.trim();

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

    // Plain editor used for inline edits — a textarea with a Save/Cancel pair.
    if (variant === "edit") {
        return (
            <div>
                <Textarea
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className={`resize-none text-sm ${compact ? "min-h-[38px]" : "min-h-[60px]"}`}
                    spellCheck={false}
                    autoFocus={autoFocus}
                />
                <div className="mt-2 flex items-center justify-end gap-1.5">
                    {onCancel && (
                        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs" onClick={onCancel}>
                            Cancel
                        </Button>
                    )}
                    <Button
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                    >
                        {submitLabel}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <CommentComposer
            value={value}
            setValue={setValue}
            placeholder={placeholder}
            autoFocus={autoFocus}
            canSubmit={canSubmit}
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
            onCancel={onCancel}
            contextLabel={contextLabel}
            showAttachments={showAttachments}
            showAvatar={showAvatar}
        />
    );
};

interface ComposerProps {
    value: string;
    setValue: (v: string) => void;
    placeholder: string;
    autoFocus: boolean;
    canSubmit: boolean;
    onSubmit: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onCancel?: () => void;
    contextLabel?: React.ReactNode;
    showAttachments: boolean;
    showAvatar: boolean;
}

const iconBtn =
    "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground";

/** Notion-style comment composer: rounded surface, leading avatar, attach/mention, circular send. */
const CommentComposer: React.FC<ComposerProps> = ({
    value,
    setValue,
    placeholder,
    autoFocus,
    canSubmit,
    onSubmit,
    onKeyDown,
    onCancel,
    contextLabel,
    showAttachments,
    showAvatar,
}) => {
    const user = useMemo(() => (showAvatar ? getCurrentUser() : null), [showAvatar]);

    return (
        <div>
            {contextLabel && (
                <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate">{contextLabel}</span>
                    {onCancel && (
                        <button
                            type="button"
                            className="flex-shrink-0 rounded-sm p-0.5 transition-colors hover:bg-accent hover:text-accent-foreground"
                            onClick={onCancel}
                            aria-label="Cancel"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            )}

            <div className="rounded-xl border bg-background px-2 py-1.5 transition-colors focus-within:border-ring/50 focus-within:ring-1 focus-within:ring-ring/30">
                <div className="flex items-start gap-2">
                    {user && (
                        <Avatar className="mt-0.5 h-6 w-6 flex-shrink-0">
                            <AvatarImage src={user.avatar} alt={user.name} />
                            <AvatarFallback className={`text-[10px] font-medium ${getAvatarColor(user.name)}`}>
                                {getInitial(user.name)}
                            </AvatarFallback>
                        </Avatar>
                    )}
                    <Textarea
                        placeholder={placeholder}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={onKeyDown}
                        className="min-h-[28px] flex-1 resize-none border-0 bg-transparent px-1 py-1 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                        spellCheck={false}
                        autoFocus={autoFocus}
                    />
                </div>

                <div className="mt-1 flex items-center justify-between">
                    <div className="flex items-center gap-0.5">
                        {showAttachments && (
                            <>
                                <button type="button" className={iconBtn} aria-label="Attach file" tabIndex={-1}>
                                    <Paperclip className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" className={iconBtn} aria-label="Mention" tabIndex={-1}>
                                    <AtSign className="h-3.5 w-3.5" />
                                </button>
                            </>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onSubmit}
                        disabled={!canSubmit}
                        aria-label="Send"
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-60"
                    >
                        <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
};
