import React from 'react'
import { Zap } from '@kn/icon'
import { cacheHitRate } from '@kn/common'
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
    if (!usage || usage.promptTokens <= 0) return null
    const rate = cacheHitRate(usage)
    const total = usage.promptTokens + usage.completionTokens
    const title = [
        '输入 ' + usage.promptTokens.toLocaleString() + ' tokens',
        rate === null
            ? '模型未上报缓存命中'
            : '其中缓存命中 ' + usage.cachedPromptTokens.toLocaleString() + ' tokens',
        '输出 ' + usage.completionTokens.toLocaleString() + ' tokens',
    ].join(' · ')

    return (
        <div
            className="flex items-center gap-1 ml-0.5 text-[9px] text-muted-foreground/60"
            title={title}
        >
            {rate !== null && (
                <>
                    <Zap className="h-2.5 w-2.5 shrink-0" />
                    <span>缓存命中 {Math.round(rate * 100)}%</span>
                    <span className="text-muted-foreground/40">·</span>
                </>
            )}
            <span>{formatTokens(total)} tokens</span>
        </div>
    )
}
