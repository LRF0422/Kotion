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
        <Collapsible className="mt-3">
            <CollapsibleTrigger className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-300 hover:text-indigo-700 transition-colors group px-2 py-1.5 -ml-1 rounded-lg hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30">
                <Terminal className="h-3.5 w-3.5" />
                <span className="font-medium">{steps.length} tool {steps.length === 1 ? 'call' : 'calls'}</span>
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2 animate-in fade-in-0 slide-in-from-top-1 duration-200">
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
        <div className="mx-4 my-4 p-4 rounded-2xl bg-gradient-to-br from-indigo-50/60 to-purple-50/60 dark:from-indigo-950/30 dark:to-purple-950/30 border border-indigo-200/50 dark:border-indigo-800/50 shadow-lg shadow-indigo-500/5 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-300 mb-3">
                <div className="flex items-center gap-1.5 text-indigo-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="font-medium">Running tools...</span>
                </div>
            </div>
            <div className="space-y-2">
                {steps.map((step) => (
                    <div
                        key={step.id}
                        className="flex items-center gap-3 p-3 rounded-xl bg-card/80 backdrop-blur-sm border border-border/50 text-xs shadow-sm"
                    >
                        {step.status === 'running' ? (
                            <Loader2 className="h-4 w-4 animate-spin text-indigo-500 shrink-0" />
                        ) : step.status === 'success' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        ) : (
                            <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                        )}
                        <div className="flex-1 flex items-center gap-2 min-w-0">
                            <Badge variant="outline" className="text-[10px] px-2.5 py-1 font-mono shrink-0 border-indigo-200/60 dark:border-indigo-800/60 bg-indigo-50/50 dark:bg-indigo-950/50">
                                {formatToolName(step.toolName)}
                            </Badge>
                            {step.status === 'running' && (
                                <span className="text-[10px] text-muted-foreground animate-pulse">executing...</span>
                            )}
                            {step.duration && (
                                <span className="text-[10px] text-green-600 font-medium">
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
        <div className="flex items-start gap-3 p-3 rounded-xl bg-card/60 backdrop-blur-sm border border-border/50 text-xs shadow-sm">
            <div className="mt-0.5 flex-shrink-0">
                {step.status === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : step.status === 'error' ? (
                    <XCircle className="h-4 w-4 text-red-500" />
                ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-[10px] px-2.5 py-1 font-mono bg-indigo-100/80 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
                        {formatToolName(step.toolName)}
                    </Badge>
                    {step.duration && (
                        <span className="text-[10px] text-muted-foreground">
                            {step.duration}ms
                        </span>
                    )}
                </div>
                {step.args && Object.keys(step.args).length > 0 && (
                    <div className="mt-2 text-[10px] text-muted-foreground/80 font-mono bg-muted/50 rounded-lg px-2.5 py-2 truncate max-w-full">
                        {JSON.stringify(step.args).slice(0, 80)}{JSON.stringify(step.args).length > 80 ? '...' : ''}
                    </div>
                )}
            </div>
        </div>
    )
})
