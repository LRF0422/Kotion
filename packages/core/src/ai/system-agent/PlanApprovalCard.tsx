/**
 * Plan Approval Card (P7)
 *
 * Renders a plan the agent proposed via `present_plan` (surfaced as
 * `useSystemAgent().state.pendingPlan`) and lets the user approve or reject it.
 * Approving resumes execution of the plan; rejecting re-plans.
 *
 * Prop types are local/structural on purpose — no coupling to `@kn/common`'s
 * internal type barrel.
 */

import React from 'react'
import { Sparkles, CheckCircle2, XCircle, AlertTriangle } from '@kn/icon'
import { Button, Badge, cn } from '@kn/ui'

interface PlanStepView {
    id?: number
    action: string
    tools?: string[]
    risk?: 'low' | 'medium' | 'high'
}

interface PlanView {
    title?: string
    summary: string
    steps: PlanStepView[]
    openQuestions?: string[]
    estimatedMutations?: number
}

export interface PlanApprovalCardProps {
    plan: PlanView
    onApprove: () => void
    onReject: () => void
    /** Disable buttons while a resume request is in flight. */
    disabled?: boolean
    className?: string
}

const RISK_STYLES: Record<string, string> = {
    low: 'text-green-600 dark:text-green-400 border-green-300/60',
    medium: 'text-amber-600 dark:text-amber-400 border-amber-300/60',
    high: 'text-red-600 dark:text-red-400 border-red-300/60',
}

export const PlanApprovalCard: React.FC<PlanApprovalCardProps> = ({
    plan,
    onApprove,
    onReject,
    disabled,
    className,
}) => {
    return (
        <div
            className={cn(
                'border border-blue-200/60 dark:border-blue-800/40 rounded-lg p-3 bg-blue-50/50 dark:bg-blue-950/20',
                className
            )}
        >
            <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                    规划模式 · 等待你的批准
                </span>
            </div>

            {plan.title && (
                <p className="text-sm font-medium mb-0.5">{plan.title}</p>
            )}
            {plan.summary && (
                <p className="text-xs text-muted-foreground mb-2 whitespace-pre-wrap">{plan.summary}</p>
            )}

            <ol className="space-y-1 mb-2">
                {(plan.steps || []).map((step, i) => (
                    <li key={step.id ?? i} className="flex items-start gap-1.5 text-xs">
                        <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                        <span className="flex-1">
                            {step.action}
                            {step.tools && step.tools.length > 0 && (
                                <span className="ml-1 text-[10px] text-muted-foreground">
                                    🔧 {step.tools.join(', ')}
                                </span>
                            )}
                        </span>
                        {step.risk && (
                            <Badge
                                variant="outline"
                                className={cn('text-[9px] px-1 py-0 shrink-0', RISK_STYLES[step.risk])}
                            >
                                {step.risk}
                            </Badge>
                        )}
                    </li>
                ))}
            </ol>

            {plan.openQuestions && plan.openQuestions.length > 0 && (
                <div className="mb-2 space-y-0.5">
                    {plan.openQuestions.map((q, i) => (
                        <div key={i} className="flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3 shrink-0 mt-px" />
                            <span>{q}</span>
                        </div>
                    ))}
                </div>
            )}

            {plan.estimatedMutations != null && (
                <p className="text-[10px] text-muted-foreground mb-2">
                    预计修改 {plan.estimatedMutations} 处
                </p>
            )}

            <div className="flex items-center gap-2 pt-1">
                <Button size="sm" className="h-7 text-xs gap-1" disabled={disabled} onClick={onApprove}>
                    <CheckCircle2 className="h-3 w-3" />
                    批准并执行
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    disabled={disabled}
                    onClick={onReject}
                >
                    <XCircle className="h-3 w-3" />
                    拒绝
                </Button>
            </div>
        </div>
    )
}
