import React from 'react'
import { Bot, BarChart3, Search, ListFilter, Sparkles } from '@kn/icon'
import { Badge } from '@kn/ui'

const PROMPTS = [
    {
        icon: Bot,
        label: 'Create custom agent',
        prompt: 'Help me create a custom AI agent for a specific task',
        badge: 'New',
    },
    {
        icon: Search,
        label: 'Analyze data for insights',
        prompt: 'Analyze the current document data and provide insights',
    },
    {
        icon: BarChart3,
        label: 'Create a chart',
        prompt: 'Create a chart or visualization based on the document data',
    },
    {
        icon: ListFilter,
        label: 'Filter and sort data',
        prompt: 'Help me filter and sort the data in this document',
    },
] as const

interface QuickPromptsProps {
    onSubmit: (prompt: string) => void
}

export const QuickPrompts = React.memo(function QuickPrompts({ onSubmit }: QuickPromptsProps) {
    return (
        <div className="space-y-1 px-3 pb-3">
            {PROMPTS.map(({ icon: Icon, label, prompt }) => (
                <button
                    key={label}
                    onClick={() => onSubmit(prompt)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs text-foreground/80 hover:bg-muted/60 hover:text-foreground transition-all group"
                >
                    <div className="flex-shrink-0 p-1 rounded bg-muted/50 group-hover:bg-muted transition-colors">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                    <span className="flex-1 font-medium">{label}</span>
                </button>
            ))}
        </div>
    )
})
