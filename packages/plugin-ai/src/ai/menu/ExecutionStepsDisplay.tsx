import React from 'react'
import { Terminal, ChevronDown, CheckCircle2, Loader2, XCircle } from '@kn/icon'
import { Badge, Collapsible, CollapsibleContent, CollapsibleTrigger } from '@kn/ui'
import { ExecutionStep, formatToolName } from './chat-types'

interface CompletedStepsProps {
    steps: ExecutionStep[]
}

export const CompletedSteps = React.memo(function CompletedSteps({ steps }: CompletedStepsProps) {
    if (steps.length === 0) return null

    return (
        <Collapsible className="mt-1">
            <CollapsibleTrigger className="flex items-center gap-1.5 text-[10px] text-indigo-600 dark:text-indigo-300 hover:text-indigo-700 transition-colors group px-1.5 py-1 -ml-0.5 rounded hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30">
                <Terminal className="h-3 w-3" />
                <span className="font-medium">{steps.length} tool {steps.length === 1 ? 'call' : 'calls'}</span>
                <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 space-y-1 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                {steps.map((step) => (
                    <StepItem key={step.id} step={step} />
                ))}
            </CollapsibleContent>
        </Collapsible>
    )
})

interface LiveStepsProps {
    steps: ExecutionStep[]
}

export const LiveSteps = React.memo(function LiveSteps({ steps }: LiveStepsProps) {
    if (steps.length === 0) return null

    return (
        <div className="mx-2 my-2 p-2 rounded-lg bg-gradient-to-br from-indigo-50/60 to-purple-50/60 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-200/50 dark:border-indigo-800/50 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-1.5 text-[10px] text-indigo-600 dark:text-indigo-300 mb-1.5">
                <div className="flex items-center gap-1 text-indigo-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="font-medium">Running tools...</span>
                </div>
            </div>
            <div className="space-y-1">
                {steps.map((step) => (
                    <div
                        key={step.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-card/80 backdrop-blur-sm border border-border/50 text-[10px]"
                    >
                        {step.status === 'running' ? (
                            <Loader2 className="h-3 w-3 animate-spin text-indigo-500 shrink-0" />
                        ) : step.status === 'success' ? (
                            <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                        ) : (
                            <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                        )}
                        <div className="flex-1 flex items-center gap-1.5 min-w-0">
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0.5 font-mono shrink-0 border-indigo-200/60 dark:border-indigo-800/60 bg-indigo-50/50 dark:bg-indigo-950/50">
                                {formatToolName(step.toolName)}
                            </Badge>
                            {step.status === 'running' && (
                                <span className="text-[9px] text-muted-foreground animate-pulse">executing...</span>
                            )}
                            {step.duration && (
                                <span className="text-[9px] text-green-600 font-medium">
                                    {step.duration}ms
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
})

// Shared step item for completed steps collapsible
const StepItem = React.memo(function StepItem({ step }: { step: ExecutionStep }) {
    return (
        <div className="flex items-start gap-2 px-2 py-1.5 rounded-md bg-card/60 backdrop-blur-sm border border-border/50 text-[10px]">
            <div className="mt-px flex-shrink-0">
                {step.status === 'success' ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : step.status === 'error' ? (
                    <XCircle className="h-3 w-3 text-red-500" />
                ) : (
                    <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5 font-mono bg-indigo-100/80 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
                        {formatToolName(step.toolName)}
                    </Badge>
                    {step.duration && (
                        <span className="text-[9px] text-muted-foreground">
                            {step.duration}ms
                        </span>
                    )}
                </div>
                {step.args && Object.keys(step.args).length > 0 && (
                    <div className="mt-1 text-[9px] text-muted-foreground/80 font-mono bg-muted/50 rounded px-1.5 py-1 truncate max-w-full">
                        {JSON.stringify(step.args).slice(0, 80)}{JSON.stringify(step.args).length > 80 ? '...' : ''}
                    </div>
                )}
            </div>
        </div>
    )
})
