import React, { useCallback } from 'react'
import { ArrowUpRight, Quote } from '@kn/icon'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@kn/ui'
import { useTranslation } from '@kn/common'
import type { BlockReference } from './chat-types'

interface BlockReferencesProps {
    references: BlockReference[]
    /** Navigate to the cited block (scroll + flash in the editor). */
    onReveal?: (ref: BlockReference) => void
}

/** Shorten a preview so one citation can't stretch across the whole panel. */
const chipLabel = (ref: BlockReference, max = 24): string => {
    const text = ref.textPreview?.replace(/\s+/g, ' ').trim()
    if (text) return text.length > max ? text.slice(0, max) + '…' : text
    return ref.blockId.slice(0, 8)
}

/**
 * Citation chips rendered at the bottom of an assistant message. Each chip
 * stands for one block the agent referenced via the referenceBlocks tool;
 * clicking it reveals the block in the editor. Stale references (block gone)
 * render muted and don't navigate.
 */
export const BlockReferences = React.memo(function BlockReferences({
    references,
    onReveal,
}: BlockReferencesProps) {
    const { t } = useTranslation()

    const handleClick = useCallback(
        (ref: BlockReference) => {
            if (ref.found === false) return
            onReveal?.(ref)
        },
        [onReveal],
    )

    if (references.length === 0) return null

    return (
        <div className="mt-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Quote className="h-3 w-3 shrink-0 opacity-70" />
                <span>{t('ai.chat.blockReferences', { defaultValue: '引用的文档位置' })}</span>
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[9px] font-normal tabular-nums text-muted-foreground/80">
                    {references.length}
                </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
                <TooltipProvider delayDuration={300}>
                    {references.map((ref, index) => {
                        const stale = ref.found === false
                        const label = chipLabel(ref)
                        const fullText = ref.textPreview?.replace(/\s+/g, ' ').trim()
                        // The span wrapper keeps the tooltip working when the
                        // chip is disabled (disabled buttons swallow pointer events).
                        const chip = (
                            <span className="inline-flex min-w-0 max-w-full">
                                <button
                                    type="button"
                                    disabled={stale}
                                    onClick={() => handleClick(ref)}
                                    className={cn(
                                        'group/chip inline-flex min-w-0 max-w-[min(100%,20rem)] items-center gap-1.5 rounded-full py-0.5 pl-1 pr-2 text-left text-[11px] leading-5 transition-colors',
                                        stale
                                            ? 'cursor-not-allowed bg-muted/30 text-muted-foreground/50'
                                            : 'cursor-pointer bg-muted/50 text-foreground/80 hover:bg-primary/10 hover:text-primary',
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-medium tabular-nums',
                                            stale
                                                ? 'bg-background/60 text-muted-foreground/50'
                                                : 'bg-background/70 text-muted-foreground group-hover/chip:text-primary',
                                        )}
                                    >
                                        {index + 1}
                                    </span>
                                    <span className={cn('min-w-0 truncate', stale && 'line-through')}>
                                        {label}
                                    </span>
                                    {!stale && (
                                        <ArrowUpRight className="h-3 w-3 shrink-0 opacity-40 transition-opacity group-hover/chip:opacity-90" />
                                    )}
                                </button>
                            </span>
                        )
                        const tooltip = stale ? (
                            t('ai.chat.blockReferenceMissing', { defaultValue: '该块已被删除或移动' })
                        ) : (
                            <span className="flex flex-col gap-0.5">
                                {fullText && fullText.length > label.length && (
                                    <span className="whitespace-pre-wrap break-words">{fullText}</span>
                                )}
                                <span className="text-muted-foreground/80">
                                    {ref.note || t('ai.chat.blockReferenceJump', { defaultValue: '点击跳转到文档位置' })}
                                </span>
                            </span>
                        )
                        return (
                            <Tooltip key={ref.blockId + '-' + index}>
                                <TooltipTrigger asChild>{chip}</TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[260px] text-xs">
                                    {tooltip}
                                </TooltipContent>
                            </Tooltip>
                        )
                    })}
                </TooltipProvider>
            </div>
        </div>
    )
})
