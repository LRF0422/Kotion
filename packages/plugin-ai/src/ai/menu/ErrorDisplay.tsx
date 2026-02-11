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
        <div className="mx-4 my-3 p-3 rounded-lg bg-red-50/80 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-sm animate-in fade-in-0 slide-in-from-bottom-2 max-w-full overflow-x-auto">
            <div className="flex items-start gap-2">
                <Icon className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                    <p className="font-medium text-red-600 dark:text-red-400">{error.message}</p>
                </div>
            </div>
            <div className="flex items-center gap-2 mt-2 ml-6">
                {error.retryable && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onRetry}
                        className="h-7 px-2.5 text-xs border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 gap-1"
                    >
                        <RefreshCw className="h-3 w-3" />
                        重试
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDismiss}
                    className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1"
                >
                    <X className="h-3 w-3" />
                    关闭
                </Button>
            </div>
        </div>
    )
})
