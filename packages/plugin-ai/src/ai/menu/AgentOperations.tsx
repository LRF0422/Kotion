import React, { useCallback, useMemo, useState } from 'react'
import { History, ChevronDown, Undo2, Loader2 } from '@kn/icon'
import { Badge, Checkbox, Collapsible, CollapsibleContent, CollapsibleTrigger, cn } from '@kn/ui'
import { useTranslation } from '@kn/common'
import { getRecordedOperation } from '@kn/editor'
import type { AgentDocOperationMeta } from './chat-types'
import { formatToolName } from './chat-types'

interface AgentOperationsProps {
    operations: AgentDocOperationMeta[]
    /** Roll back the given op ids (already ordered & filtered by the caller). */
    onRollback?: (opIds: string[]) => void
}

/**
 * Document-operation log rendered under a completed assistant message. Each
 * row is one agent tool call that changed the document (recorded by the
 * editor's OperationRecorder); the user checks rows and rolls them back
 * independently. Rows whose snapshot payload expired (editor closed, app
 * reloaded) render muted and can't be selected.
 */
export const AgentOperations = React.memo(function AgentOperations({
    operations,
    onRollback,
}: AgentOperationsProps) {
    const { t } = useTranslation()
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
    const [rolling, setRolling] = useState(false)

    // Payload availability is derived lazily from the editor-side registry;
    // metas themselves come from the (persisted) message.
    const rows = useMemo(
        () => operations.map(op => ({
            op,
            expired: getRecordedOperation(op.id) == null,
        })),
        [operations],
    )
    const actionableIds = useMemo(
        () => rows.filter(r => !r.op.reverted && !r.expired).map(r => r.op.id),
        [rows],
    )

    const toggle = useCallback((opId: string, checked: boolean) => {
        setSelected(prev => {
            const next = new Set(prev)
            if (checked) next.add(opId)
            else next.delete(opId)
            return next
        })
    }, [])

    const allSelected = actionableIds.length > 0 && actionableIds.every(id => selected.has(id))
    const toggleAll = useCallback((checked: boolean) => {
        setSelected(checked ? new Set(actionableIds) : new Set())
    }, [actionableIds])

    const doRollback = useCallback((opIds: string[]) => {
        if (opIds.length === 0 || rolling) return
        setRolling(true)
        try {
            onRollback?.(opIds)
        } finally {
            setRolling(false)
            setSelected(prev => {
                const next = new Set(prev)
                for (const id of opIds) next.delete(id)
                return next
            })
        }
    }, [onRollback, rolling])

    if (operations.length === 0) return null

    const selectedActionable = actionableIds.filter(id => selected.has(id))

    return (
        <Collapsible className="mt-2 pt-2 border-t border-border/50">
            <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors group select-none">
                <History className="h-3 w-3" />
                <span>{t('ai.chat.docOps', { defaultValue: '文档操作' })}</span>
                <span className="text-muted-foreground/60">{operations.length}</span>
                <ChevronDown className="h-3 w-3 ml-auto transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1.5 space-y-1 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                {rows.map(({ op, expired }) => {
                    const disabled = rolling || expired || !!op.reverted
                    return (
                        <div
                            key={op.id}
                            className={cn(
                                'flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-1.5 py-1',
                                (expired || op.reverted) && 'opacity-60',
                            )}
                        >
                            <Checkbox
                                className="h-3 w-3 shrink-0"
                                disabled={disabled}
                                checked={selected.has(op.id)}
                                onCheckedChange={(checked) => toggle(op.id, checked === true)}
                            />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1">
                                    <Badge
                                        variant="outline"
                                        className="text-[9px] px-1 py-0 font-mono shrink-0 border-border/60 bg-muted/50"
                                    >
                                        {formatToolName(op.toolName)}
                                    </Badge>
                                    <span className="text-[9px] text-muted-foreground shrink-0">
                                        {t('ai.chat.docOpsBlocks', {
                                            count: op.changeCount,
                                            defaultValue: '{{count}} 个块',
                                        })}
                                    </span>
                                    {op.reverted && (
                                        <span className="text-[9px] text-green-600 dark:text-green-500 shrink-0">
                                            {t('ai.chat.docOpReverted', { defaultValue: '已回滚' })}
                                        </span>
                                    )}
                                    {expired && !op.reverted && (
                                        <span className="text-[9px] text-muted-foreground/70 shrink-0">
                                            {t('ai.chat.docOpExpired', { defaultValue: '已失效' })}
                                        </span>
                                    )}
                                </div>
                                {op.previews.length > 0 && (
                                    <div className="text-[9px] text-muted-foreground/80 truncate mt-0.5">
                                        {op.previews.join(' · ')}
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                disabled={disabled}
                                onClick={() => doRollback([op.id])}
                                title={t('ai.chat.docOpRollback', { defaultValue: '回滚此操作' })}
                                className="shrink-0 rounded p-0.5 text-muted-foreground/70 hover:text-foreground hover:bg-muted/70 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground/70"
                            >
                                {rolling
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <Undo2 className="h-3 w-3" />}
                            </button>
                        </div>
                    )
                })}

                {actionableIds.length > 1 && (
                    <div className="flex items-center gap-2 pt-0.5">
                        <label className="flex items-center gap-1 text-[9px] text-muted-foreground cursor-pointer select-none">
                            <Checkbox
                                className="h-3 w-3"
                                checked={allSelected}
                                onCheckedChange={(checked) => toggleAll(checked === true)}
                            />
                            {t('ai.chat.docOpsSelectAll', { defaultValue: '全选' })}
                        </label>
                        <button
                            type="button"
                            disabled={rolling || selectedActionable.length === 0}
                            onClick={() => doRollback(selectedActionable)}
                            className="ml-auto flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
                        >
                            {rolling
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Undo2 className="h-3 w-3" />}
                            {t('ai.chat.docOpsRollbackSelected', {
                                count: selectedActionable.length,
                                defaultValue: '回滚所选 ({{count}})',
                            })}
                        </button>
                    </div>
                )}
                <div className="text-[9px] text-muted-foreground/60 pt-0.5">
                    {t('ai.chat.docOpsHint', {
                        defaultValue: '回滚只恢复该操作改动的块；同一块上的后续修改会被一并覆盖',
                    })}
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
})
