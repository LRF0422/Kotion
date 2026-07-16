import React from 'react'
import { HelpCircle, Send, XCircle } from '@kn/icon'
import { Button, Input } from '@kn/ui'
import type { PendingUserChoice } from '../chat-types'

interface UserChoiceCardProps {
    choice: PendingUserChoice
    customInput: string
    onCustomInputChange: (value: string) => void
    onSelect: (optionId: string) => void
    onCustomSubmit: () => void
    onCancel: () => void
}

/**
 * Inline card shown when the agent asks the user to choose between
 * options.  Kept as its own component so the surrounding Chat file stays
 * focused on orchestration.
 */
export const UserChoiceCard: React.FC<UserChoiceCardProps> = ({
    choice,
    customInput,
    onCustomInputChange,
    onSelect,
    onCustomSubmit,
    onCancel,
}) => {
    return (
        <div className="mx-2 my-1.5 p-3 rounded-lg bg-card border border-border/60 shadow-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
            <div className="flex items-start gap-2 mb-2.5">
                <div className="p-1.5 rounded-md bg-primary/10 text-primary shrink-0">
                    <HelpCircle className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground leading-snug">
                        {choice.request.question}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                        Select an option to continue
                    </p>
                </div>
            </div>

            <div className="space-y-1">
                {choice.request.options.map((option) => (
                    <button
                        key={option.id}
                        type="button"
                        onClick={() => onSelect(option.id)}
                        className="w-full p-2 rounded-md border border-border/60 bg-background hover:bg-muted/60 hover:border-border transition-all text-left group"
                    >
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 group-hover:bg-primary transition-colors" />
                            <span className="text-xs font-medium">{option.label}</span>
                        </div>
                        {option.description && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 ml-3 line-clamp-2">
                                {option.description}
                            </p>
                        )}
                    </button>
                ))}
            </div>

            {choice.request.allowCustomInput && (
                <div className="mt-2.5 pt-2.5 border-t border-border/50">
                    <p className="text-[10px] text-muted-foreground mb-1.5">
                        Or provide a custom response
                    </p>
                    <div className="flex gap-1.5">
                        <Input
                            value={customInput}
                            onChange={(e) => onCustomInputChange(e.target.value)}
                            placeholder="Type your response…"
                            className="flex-1 h-7 text-xs"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && customInput.trim()) {
                                    e.preventDefault()
                                    onCustomSubmit()
                                }
                            }}
                        />
                        <Button
                            size="sm"
                            onClick={onCustomSubmit}
                            disabled={!customInput.trim()}
                            className="h-7 px-2 bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            <Send className="h-3 w-3" />
                        </Button>
                    </div>
                </div>
            )}

            <div className="mt-2.5 flex justify-end">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onCancel}
                    className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                    <XCircle className="h-3 w-3 mr-1" />
                    Cancel
                </Button>
            </div>
        </div>
    )
}
