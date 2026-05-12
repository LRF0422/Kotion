import React from 'react'
import { CheckCircle2, Loader2, XCircle } from '@kn/icon'
import { Badge } from '@kn/ui'
import { ExecutionStep, formatToolName } from './chat-types'

interface CompletedStepsProps {
    steps: ExecutionStep[]
}

export const CompletedSteps = React.memo(function CompletedSteps({ steps }: CompletedStepsProps) {
    if (steps.length === 0) return null

    return (
        <div className="space-y-1">
            {steps.map((step) => (
                <div
                    key={step.id}
                    className={`flex items-center gap-1.5 text-[10px] ${step.status === 'error' ? 'text-red-500' : 'text-muted-foreground/80'}`}
                >
                    {step.status === 'success' ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                    ) : step.status === 'error' ? (
                        <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                    ) : (
                        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                    )}
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0.5 font-mono shrink-0 border-border/60 bg-muted/50">
                        {formatToolName(step.toolName)}
                    </Badge>
                    {step.duration && (
                        <span className={`text-[9px] font-medium ${step.status === 'error' ? 'text-red-500' : 'text-green-600'}`}>
                            {step.duration}ms
                        </span>
                    )}
                    {step.status === 'error' && step.error && (
                        <span className="text-[9px] break-words">{step.error}</span>
                    )}
                </div>
            ))}
        </div>
    )
})

interface LiveStepsProps {
    steps: ExecutionStep[]
}

export const LiveSteps = React.memo(function LiveSteps({ steps }: LiveStepsProps) {
    if (steps.length === 0) return null

    return (
        <div className="space-y-1 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
            {steps.map((step) => (
                <div
                    key={step.id}
                    className={`flex items-center gap-1.5 text-[10px] text-muted-foreground/80 ${step.status === 'error' ? 'text-red-500' : ''}`}
                >
                    {step.status === 'running' ? (
                        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                    ) : step.status === 'success' ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                    ) : (
                        <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                    )}
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0.5 font-mono shrink-0 border-border/60 bg-muted/50">
                        {formatToolName(step.toolName)}
                    </Badge>
                    {step.status === 'running' && (
                        <span className="text-[9px] animate-pulse">executing...</span>
                    )}
                    {step.duration && (
                        <span className={`text-[9px] font-medium ${step.status === 'error' ? 'text-red-500' : 'text-green-600'}`}>
                            {step.duration}ms
                        </span>
                    )}
                    {step.status === 'error' && step.error && (
                        <span className="text-[9px] break-words">{step.error}</span>
                    )}
                </div>
            ))}
        </div>
    )
})
