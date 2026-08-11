import React, { useCallback } from 'react'
import { Quote, SquareDashedBottom } from '@kn/icon'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@kn/ui'
import { useTranslation } from '@kn/common'
import type { BlockReference } from './chat-types'

interface BlockReferencesProps {
    references: BlockReference[]
    /** Navigate to the cited block (scroll + flash in the editor). */
    onReveal?: (ref: BlockReference) => void
}

/** Truncate a chip label so a long preview doesn't blow up the row. */
const chipLabel = (ref: BlockReference): string => {
    const text = ref.textPreview?.trim()
    if (text) return text.length > 32 ? text.slice(0, 32) + '…' : text
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
        <div className="mt-2 pt-2 border-t border-border/50">
            <div className="flex items-center gap-1 mb-1.5 text-[10px] font-medium text-muted-foreground">
                <Quote className="h-3 w-3" />
                <span>
                    {t('ai.chat.blockReferences', { defaultValue: '引用的文档位置' })}
                    <span className="ml-1 text-muted-foreground/60">{references.length}</span>
                </span>
            </div>
            <div className="flex flex-wrap gap-1">
                <TooltipProvider delayDuration={300}>
                    {references.map((ref) => {
                        const stale = ref.found === false
                        // The span wrapper keeps the tooltip working when the
                        // chip is disabled (disabled buttons swallow pointer events).
                        const chip = (
                            <span className="inline-flex max-w-full">
                                <button
                                    type="button"
                                    disabled={stale}
                                    onClick={() => handleClick(ref)}
                                    className={cn(
                                        'flex items-center gap-1 max-w-full rounded-md border px-1.5 py-0.5 text-[10px] leading-4 transition-colors',
                                        stale
                                            ? 'border-border/40 text-muted-foreground/50 line-through cursor-not-allowed'
                                            : 'border-border/60 bg-muted/40 text-foreground/80 hover:bg-primary/10 hover:border-primary/40 hover:text-primary cursor-pointer',
                                    )}
                                >
                                    <SquareDashedBottom className="h-3 w-3 shrink-0 opacity-70" />
                                    <span className="truncate">{chipLabel(ref)}</span>
                                </button>
                            </span>
                        )
                        const tooltip = stale
                            ? t('ai.chat.blockReferenceMissing', { defaultValue: '该块已被删除或移动' })
                            : ref.note || t('ai.chat.blockReferenceJump', { defaultValue: '点击跳转到文档位置' })
                        return (
                            <Tooltip key={ref.blockId}>
                                <TooltipTrigger asChild>{chip}</TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[240px] text-xs">
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
