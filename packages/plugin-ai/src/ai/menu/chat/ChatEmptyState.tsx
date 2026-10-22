import React from 'react'
import { useTranslation } from '@kn/common'
import {
    Sparkles,
    BarChart3,
    Search,
    ListFilter,
    Bot,
    FileText,
    PenLine,
    Lightbulb,
    Brain,
} from '@kn/icon'
import type { ChatMode } from '@kn/common'
import type { StarterIconKey } from './starter-suggestions'
import { useStarterSuggestions } from './use-starter-suggestions'

interface ChatEmptyStateProps {
    mode: ChatMode
    onSubmit: (prompt: string) => void
    /**
     * The document this conversation acts on. Its title ranks page-relevant
     * memories and its id prefers page-scoped ones; without it the grid still
     * personalizes from user-level memory.
     */
    page?: { pageId?: string; title?: string; spaceId?: string }
}

/** Icon per suggestion kind; the recommender only names a semantic kind. */
const ICONS: Record<StarterIconKey, React.ComponentType<{ className?: string }>> = {
    draft: PenLine,
    chart: BarChart3,
    automate: Bot,
    reorganize: ListFilter,
    summarize: FileText,
    find: Search,
    explain: Lightbulb,
    compare: ListFilter,
    memory: Brain,
    topic: Sparkles,
}

/**
 * Empty-state landing shown when a session has no messages.  Focused hero
 * with mode-aware copy and a compact 2×2 grid of starter prompts.
 *
 * Agent mode personalizes the grid from long-term memory / profile traits and
 * always keeps one static action; ask mode keeps its fixed read-only prompts.
 */
export const ChatEmptyState: React.FC<ChatEmptyStateProps> = ({ mode, onSubmit, page }) => {
    const { t } = useTranslation()
    const { suggestions, personalized } = useStarterSuggestions({
        mode,
        pageTitle: page?.title,
        pageId: page?.pageId,
        spaceId: page?.spaceId,
    })
    const heading = mode === 'ask' ? t('ai.chat.emptyAskTitle') : t('ai.chat.emptyAgentTitle')
    const sub = mode === 'ask' ? t('ai.chat.emptyAskSub') : t('ai.chat.emptyAgentSub')

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
            {personalized && (
                <div className="mb-2 flex items-center gap-1 text-[10px] text-muted-foreground/80">
                    <Sparkles className="h-3 w-3 text-primary/70" aria-hidden />
                    <span>{t('ai.chat.personalizedHint')}</span>
                </div>
            )}
            <div className="grid grid-cols-2 gap-1.5 w-full max-w-[340px]">
                {suggestions.map(suggestion => {
                    const Icon = ICONS[suggestion.icon] ?? Sparkles
                    const reason = suggestion.source === 'default'
                        ? undefined
                        : suggestion.params?.topic ?? suggestion.params?.format
                    return (
                        <button
                            key={suggestion.id}
                            type="button"
                            onClick={() => onSubmit(t(suggestion.promptKey, suggestion.params))}
                            className="group flex flex-col items-start gap-1 p-2 rounded-lg border border-border/60 bg-card/50 hover:bg-muted/50 hover:border-border transition-all text-left"
                        >
                            <div className="p-1 rounded bg-muted/60 group-hover:bg-muted transition-colors">
                                <Icon className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                            </div>
                            <span className="text-[11px] font-medium leading-snug text-foreground/85 line-clamp-2">
                                {t(suggestion.labelKey, suggestion.params)}
                            </span>
                            {reason && (
                                <span className="w-full text-[10px] leading-tight text-muted-foreground/70 line-clamp-1">
                                    {t(
                                        suggestion.source === 'profile'
                                            ? 'ai.chat.starterProfileReason'
                                            : 'ai.chat.starterMemoryReason',
                                        { topic: reason },
                                    )}
                                </span>
                            )}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
