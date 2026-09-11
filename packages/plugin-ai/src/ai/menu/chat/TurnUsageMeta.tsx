import React from 'react'
import { Zap } from '@kn/icon'
import { cacheHitRate, useTranslation } from '@kn/common'
import type { RunUsage } from '@kn/common'

/** Compact token count: 1234 → 1.2k. */
const formatTokens = (value: number): string =>
    value >= 1000 ? (value / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(value)

/**
 * Per-turn token footer for an AI message. The headline number is the model's
 * prompt-cache hit rate (cached prompt tokens / prompt tokens) — the signal
 * that a turn reused a stable prefix instead of paying full price for it.
 * Renders nothing when the provider reported no usable accounting.
 */
export const TurnUsageMeta: React.FC<{ usage?: RunUsage | null }> = ({ usage }) => {
    const { t } = useTranslation()
    if (!usage || usage.promptTokens <= 0) return null
    const rate = cacheHitRate(usage)
    const total = usage.promptTokens + usage.completionTokens
    const title = [
        t('ai.chat.usageInput', { tokens: usage.promptTokens.toLocaleString() }),
        rate === null
            ? t('ai.chat.usageNoCache')
            : t('ai.chat.usageCached', { tokens: usage.cachedPromptTokens.toLocaleString() }),
        t('ai.chat.usageOutput', { tokens: usage.completionTokens.toLocaleString() }),
    ].join(' · ')

    return (
        <div
            className="flex items-center gap-1 ml-0.5 text-[9px] text-muted-foreground/60"
            title={title}
        >
            {rate !== null && (
                <>
                    <Zap className="h-2.5 w-2.5 shrink-0" />
                    <span>{t('ai.chat.usageCacheRate', { rate: Math.round(rate * 100) })}</span>
                    <span className="text-muted-foreground/40">·</span>
                </>
            )}
            <span>{formatTokens(total)} tokens</span>
        </div>
    )
}
