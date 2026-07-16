import React from 'react'
import { Sparkles, BarChart3, Search, ListFilter, Bot, FileText, PenLine, Lightbulb } from '@kn/icon'
import type { ChatMode } from '@kn/common'

interface ChatEmptyStateProps {
    mode: ChatMode
    onSubmit: (prompt: string) => void
}

const ASK_PROMPTS = [
    {
        icon: FileText,
        label: 'Summarize this document',
        prompt: 'Summarize the key points of this document.',
    },
    {
        icon: Search,
        label: 'Find information',
        prompt: 'Find the most relevant sections about ',
    },
    {
        icon: Lightbulb,
        label: 'Explain a concept',
        prompt: 'Explain the following concept in simple terms: ',
    },
    {
        icon: ListFilter,
        label: 'Compare sections',
        prompt: 'Compare the arguments in different sections of this document.',
    },
] as const

const AGENT_PROMPTS = [
    {
        icon: PenLine,
        label: 'Draft content',
        prompt: 'Draft a short introduction for this document.',
    },
    {
        icon: BarChart3,
        label: 'Create a chart',
        prompt: 'Create a chart or visualization based on the document data.',
    },
    {
        icon: Bot,
        label: 'Automate a task',
        prompt: 'Help me create an automated agent for a repetitive task.',
    },
    {
        icon: ListFilter,
        label: 'Reorganize content',
        prompt: 'Reorganize this document into a clearer structure.',
    },
] as const

/**
 * Empty-state landing shown when a session has no messages.  Focused hero
 * with mode-aware copy and a compact 2×2 grid of starter prompts.
 */
export const ChatEmptyState: React.FC<ChatEmptyStateProps> = ({ mode, onSubmit }) => {
    const prompts = mode === 'ask' ? ASK_PROMPTS : AGENT_PROMPTS
    const heading = mode === 'ask' ? 'Ask about your document' : 'What can I help you build?'
    const sub =
        mode === 'ask'
            ? "I'll answer using the content in view. I won't edit anything."
            : 'I can read, edit and reorganize your document. Try one of these:'

    return (
        <div className="flex flex-col items-center px-4 pt-6 pb-3">
            <div className="relative mb-3">
                <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl" aria-hidden />
                <div className="relative flex items-center justify-center h-11 w-11 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                    <Sparkles className="h-5 w-5 text-primary" />
                </div>
            </div>
            <h2 className="text-sm font-semibold text-foreground mb-1">{heading}</h2>
            <p className="text-[11px] leading-relaxed text-muted-foreground text-center max-w-[280px] mb-4">
                {sub}
            </p>
            <div className="grid grid-cols-2 gap-1.5 w-full max-w-[340px]">
                {prompts.map(({ icon: Icon, label, prompt }) => (
                    <button
                        key={label}
                        type="button"
                        onClick={() => onSubmit(prompt)}
                        className="group flex flex-col items-start gap-1 p-2 rounded-lg border border-border/60 bg-card/50 hover:bg-muted/50 hover:border-border transition-all text-left"
                    >
                        <div className="p-1 rounded bg-muted/60 group-hover:bg-muted transition-colors">
                            <Icon className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                        </div>
                        <span className="text-[11px] font-medium leading-snug text-foreground/85 line-clamp-2">
                            {label}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    )
}
