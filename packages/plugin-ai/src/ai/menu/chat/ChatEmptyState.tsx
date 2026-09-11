import React from 'react'
import { useTranslation } from '@kn/common'
import { Sparkles, BarChart3, Search, ListFilter, Bot, FileText, PenLine, Lightbulb } from '@kn/icon'
import type { ChatMode } from '@kn/common'

interface ChatEmptyStateProps {
    mode: ChatMode
    onSubmit: (prompt: string) => void
}

/** Starter prompts as i18n key pairs: the card label and the text sent to the model. */
const ASK_PROMPTS = [
    { icon: FileText, labelKey: 'ai.chat.promptSummarize', promptKey: 'ai.chat.promptSummarizeText' },
    { icon: Search, labelKey: 'ai.chat.promptFind', promptKey: 'ai.chat.promptFindText' },
    { icon: Lightbulb, labelKey: 'ai.chat.promptExplain', promptKey: 'ai.chat.promptExplainText' },
    { icon: ListFilter, labelKey: 'ai.chat.promptCompare', promptKey: 'ai.chat.promptCompareText' },
] as const

const AGENT_PROMPTS = [
    { icon: PenLine, labelKey: 'ai.chat.promptDraft', promptKey: 'ai.chat.promptDraftText' },
    { icon: BarChart3, labelKey: 'ai.chat.promptChart', promptKey: 'ai.chat.promptChartText' },
    { icon: Bot, labelKey: 'ai.chat.promptAutomate', promptKey: 'ai.chat.promptAutomateText' },
    { icon: ListFilter, labelKey: 'ai.chat.promptReorganize', promptKey: 'ai.chat.promptReorganizeText' },
] as const

/**
 * Empty-state landing shown when a session has no messages.  Focused hero
 * with mode-aware copy and a compact 2×2 grid of starter prompts.
 */
export const ChatEmptyState: React.FC<ChatEmptyStateProps> = ({ mode, onSubmit }) => {
    const { t } = useTranslation()
    const prompts = mode === 'ask' ? ASK_PROMPTS : AGENT_PROMPTS
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
            <div className="grid grid-cols-2 gap-1.5 w-full max-w-[340px]">
                {prompts.map(({ icon: Icon, labelKey, promptKey }) => (
                    <button
                        key={labelKey}
                        type="button"
                        onClick={() => onSubmit(t(promptKey))}
                        className="group flex flex-col items-start gap-1 p-2 rounded-lg border border-border/60 bg-card/50 hover:bg-muted/50 hover:border-border transition-all text-left"
                    >
                        <div className="p-1 rounded bg-muted/60 group-hover:bg-muted transition-colors">
                            <Icon className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                        </div>
                        <span className="text-[11px] font-medium leading-snug text-foreground/85 line-clamp-2">
                            {t(labelKey)}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    )
}
