/**
 * Tool Approval Card — the host's generic "may I run this tool?" prompt.
 *
 * A tool that asks for confirmation (see the `ToolApprovalRequest` contract in
 * @kn/common) may ship a custom approval card via `request.kind`; when it does
 * not, the surface falls back to this card. The card is purely presentational:
 * the caller owns the decision channel (`onDecide`), so the same component
 * works for the editor agent, the workspace kernel and any future surface.
 *
 * The ui package must not depend on @kn/common, so request/decision are
 * declared here structurally — they mirror the shared contract field-for-field.
 */

import React, { useState } from 'react'
import { CheckCircle2, ShieldAlert, XCircle } from '@kn/icon'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

/** Structural mirror of the host's `ToolApprovalRequest` (ui has no @kn/common dep). */
export interface ToolApprovalCardRequest {
    /** Card title, e.g. "执行 shell 命令". */
    title: string
    /** Body: the command / the risk explanation — the thing being approved. */
    message: string
    /** Short risk reasons rendered as a list, e.g. ["会修改 3 个文件"]. */
    reasons?: string[]
    /** `block` requests are not approvable; the host normally denies them first. */
    level?: 'confirm' | 'block'
    /** Structured, already-sanitized payload for custom renderers (opaque here). */
    meta?: Record<string, unknown>
    /** Renderer key for a plugin-defined card (opaque here). */
    kind?: string
    /** Auto-deny window, when the host enforces one (displayed nowhere yet). */
    timeoutMs?: number
}

/** Structural mirror of the host's `ToolApprovalDecision`. */
export type ToolApprovalCardDecision =
    | { allowed: true; note?: string }
    | { allowed: false; reason?: string }

/** Overridable copy; defaults are the Chinese product copy used across the app. */
export interface ToolApprovalCardLabels {
    /** Approve button, e.g. "允许执行". */
    allow?: string
    /** Deny button, e.g. "取消". */
    deny?: string
    /** Heading above the reasons list, e.g. "风险提示". */
    reasons?: string
    /** Hint shown on the buttons while the decision is being applied. */
    deciding?: string
}

export interface ToolApprovalCardProps {
    request: ToolApprovalCardRequest
    /**
     * Resolve the approval. The host settles the tool's promise; the card only
     * disables itself until the callback returns (async callbacks are awaited).
     */
    onDecide: (decision: ToolApprovalCardDecision) => Promise<void> | void
    className?: string
    labels?: ToolApprovalCardLabels
}

/**
 * Generic confirmation card: title, body, risk reasons and the two actions.
 */
export const ToolApprovalCard: React.FC<ToolApprovalCardProps> = ({
    request,
    onDecide,
    className,
    labels,
}) => {
    const [inFlight, setInFlight] = useState(false)

    const decide = async (decision: ToolApprovalCardDecision) => {
        if (inFlight) return
        setInFlight(true)
        try {
            await onDecide(decision)
        } catch {
            // The surface reports transport errors; keep the card retryable
            // instead of leaving it disabled forever.
        } finally {
            setInFlight(false)
        }
    }

    const reasons = request.reasons?.filter(reason => reason.trim().length > 0) ?? []

    return (
        <div
            className={cn(
                'mt-2 rounded-lg border border-amber-200/70 bg-amber-50/60 p-3 dark:border-amber-800/40 dark:bg-amber-950/20',
                className,
            )}
            role="group"
            aria-label={request.title}
        >
            <div className="mb-2 flex items-center gap-2">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span className="min-w-0 truncate text-xs font-semibold text-amber-700 dark:text-amber-300">
                    {request.title}
                </span>
            </div>

            <div className="mb-2 max-h-48 overflow-y-auto text-xs whitespace-pre-wrap text-foreground/80">
                {request.message}
            </div>

            {reasons.length > 0 && (
                <div className="mb-2 rounded-md bg-background/50 px-2.5 py-1.5">
                    <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                        {labels?.reasons ?? '风险提示'}
                    </div>
                    <ul className="space-y-0.5">
                        {reasons.map((reason, index) => (
                            <li key={index} className="flex items-start gap-1.5 text-[11px] text-foreground/75">
                                <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                                <span className="min-w-0 break-words">{reason}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="flex items-center gap-2">
                <Button
                    size="sm"
                    disabled={inFlight}
                    className="h-7 bg-amber-600 text-xs text-white hover:bg-amber-700"
                    onClick={() => void decide({ allowed: true })}
                >
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    {labels?.allow ?? '允许执行'}
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    disabled={inFlight}
                    className="h-7 text-xs"
                    onClick={() => void decide({ allowed: false })}
                >
                    <XCircle className="mr-1 h-3.5 w-3.5" />
                    {labels?.deny ?? '取消'}
                </Button>
                {inFlight && (
                    <span className="text-[11px] text-muted-foreground">
                        {labels?.deciding ?? '处理中…'}
                    </span>
                )}
            </div>
        </div>
    )
}
