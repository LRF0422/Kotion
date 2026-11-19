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
import { ConversationEmptyState, Suggestion } from '@kn/ui'
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
 * Empty-state landing shown when a session has no messages.
 *
 * Built on AI Elements: `ConversationEmptyState` for the hero and `Suggestion`
 * for each starter prompt. The recommender still personalizes the copy from
 * long-term memory / profile traits; only the presentation moved.
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
        <div className="flex flex-col items-center px-4 pb-3 pt-6">
            <ConversationEmptyState
                className="size-auto max-w-[320px] gap-2 p-0"
                icon={(
                    <div className="relative">
                        <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl" aria-hidden />
                        <div className="relative flex h-11 w-11 items-center justify-center rounded-full border border-primary/20 bg-gradient-to-br from-primary/20 to-primary/5">
                            <Sparkles className="h-5 w-5 text-primary" />
                        </div>
                    </div>
                )}
                title={heading}
                description={sub}
            />
            {personalized && (
                <div className="mb-2 mt-2 flex items-center gap-1 text-[10px] text-muted-foreground/80">
                    <Sparkles className="h-3 w-3 text-primary/70" aria-hidden />
                    <span>{t('ai.chat.personalizedHint')}</span>
                </div>
            )}
            <div className="mt-3 grid w-full max-w-[340px] grid-cols-2 gap-1.5">
                {suggestions.map(suggestion => {
                    const Icon = ICONS[suggestion.icon] ?? Sparkles
                    const reason = suggestion.source === 'default'
                        ? undefined
                        : suggestion.params?.topic ?? suggestion.params?.format
                    const prompt = t(suggestion.promptKey, suggestion.params)
                    return (
                        <Suggestion
                            key={suggestion.id}
                            suggestion={prompt}
                            onClick={onSubmit}
                            variant="outline"
                            className="group flex h-auto w-full flex-col items-start gap-1 whitespace-normal rounded-xl border-border/60 bg-card/50 p-2 text-left font-normal hover:border-border hover:bg-muted/50"
                        >
                            <span className="rounded bg-muted/60 p-1 transition-colors group-hover:bg-muted">
                                <Icon className="h-3 w-3 text-muted-foreground transition-colors group-hover:text-foreground" />
                            </span>
                            <span className="line-clamp-2 text-[11px] font-medium leading-snug text-foreground/85">
                                {t(suggestion.labelKey, suggestion.params)}
                            </span>
                            {reason && (
                                <span className="w-full truncate text-[10px] leading-tight text-muted-foreground/70">
                                    {t(
                                        suggestion.source === 'profile'
                                            ? 'ai.chat.starterProfileReason'
                                            : 'ai.chat.starterMemoryReason',
                                        { topic: reason },
                                    )}
                                </span>
                            )}
                        </Suggestion>
                    )
                })}
            </div>
        </div>
    )
}
