import React from 'react'
import { WifiOff, ShieldAlert, Timer, AlertTriangle, XCircle, RefreshCw, X } from '@kn/icon'
import { Button } from '@kn/ui'
import { ChatError } from './chat-types'

const ERROR_ICONS: Record<ChatError['type'], React.ElementType> = {
    network: WifiOff,
    auth: ShieldAlert,
    rate_limit: Timer,
    timeout: Timer,
    server: AlertTriangle,
    unknown: XCircle,
}

interface ErrorDisplayProps {
    error: ChatError
    onRetry: () => void
    onDismiss: () => void
}

export const ErrorDisplay = React.memo(function ErrorDisplay({ error, onRetry, onDismiss }: ErrorDisplayProps) {
    const Icon = ERROR_ICONS[error.type]

    return (
        <div className="mx-2 my-1.5 p-2 rounded-md bg-destructive/10 border border-destructive/20 text-[10px] animate-in fade-in-0 slide-in-from-bottom-2 max-w-full overflow-x-auto">
            <div className="flex items-start gap-1.5">
                <Icon className="h-3 w-3 text-destructive mt-px shrink-0" />
                <div className="flex-1 min-w-0">
                    <p className="font-medium text-destructive">{error.message}</p>
                </div>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 ml-4.5">
                {error.retryable && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onRetry}
                        className="h-6 px-2 text-[10px] border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive gap-0.5"
                    >
                        <RefreshCw className="h-2.5 w-2.5" />
                        Retry
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDismiss}
                    className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground gap-0.5"
                >
                    <X className="h-2.5 w-2.5" />
                    Dismiss
                </Button>
            </div>
        </div>
    )
})
