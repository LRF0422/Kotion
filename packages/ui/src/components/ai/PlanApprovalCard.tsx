/**
 * Plan Approval Card — AgentCore 版。
 *
 * 展示 agent 在计划模式下提交的计划文本，用户批准（继续执行、开放全部
 * 工具）或拒绝（附带反馈，agent 重新规划）。
 */

import React, { useState } from 'react'
import { Sparkles, CheckCircle2, XCircle } from '@kn/icon'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

export interface PlanApprovalCardProps {
    /** 计划文本（present_plan 的参数内容，可能为 JSON 或纯文本）。 */
    planText: string
    /** 用户决策回调（批准/拒绝 + 可选反馈）。 */
    onDecision: (approved: boolean, feedback?: string) => Promise<void> | void
    className?: string
}

/**
 * 计划审批卡片。
 */
export const PlanApprovalCard: React.FC<PlanApprovalCardProps> = ({
    planText,
    onDecision,
    className,
}) => {
    const [feedback, setFeedback] = useState('')
    const [inFlight, setInFlight] = useState(false)

    const decide = async (approved: boolean) => {
        if (inFlight) return
        setInFlight(true)
        try {
            await onDecision(approved, feedback.trim() || undefined)
        } catch {
            // The Agent UI surfaces transport errors and keeps the decision retryable.
        } finally {
            setInFlight(false)
        }
    }

    let display = planText
    try {
        const parsed = JSON.parse(planText)
        if (parsed && typeof parsed === 'object') {
            display = parsed.summary || parsed.plan || JSON.stringify(parsed, null, 2)
        }
    } catch {
        // 纯文本计划，直接展示
    }

    return (
        <div
            className={cn(
                'mt-2 border border-blue-200/60 dark:border-blue-800/40 rounded-lg p-3 bg-blue-50/50 dark:bg-blue-950/20',
                className
            )}
        >
            <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                    规划模式 · 等待你的批准
                </span>
            </div>

            <div className="text-xs whitespace-pre-wrap text-foreground/80 max-h-48 overflow-y-auto mb-2">
                {display}
            </div>

            <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="补充意见（可选），拒绝时会反馈给 agent…"
                rows={2}
                className="w-full resize-none text-xs bg-background/60 border border-border/50 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-blue-400/40 mb-2"
            />

            <div className="flex items-center gap-2">
                <Button
                    size="sm"
                    disabled={inFlight}
                    className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => decide(true)}
                >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    批准并执行
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    disabled={inFlight}
                    className="h-7 text-xs"
                    onClick={() => decide(false)}
                >
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    拒绝，重新规划
                </Button>
            </div>
        </div>
    )
}
