import React from 'react'
import { WifiOff, ShieldAlert, Timer, AlertTriangle, XCircle, RefreshCw, X } from '@kn/icon'
import { Button } from '@kn/ui'
import { useTranslation } from '@kn/common'
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
    const { t } = useTranslation()
    const Icon = ERROR_ICONS[error.type]
    const message = t(`ai.chat.errors.${error.type}`, { defaultValue: error.message })

    return (
        <div className="mx-2 my-1.5 max-w-full animate-in rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs fade-in-0 slide-in-from-bottom-2">
            <div className="flex items-start gap-1.5">
                <Icon className="h-3 w-3 text-destructive mt-px shrink-0" />
                <div className="flex-1 min-w-0">
                    <p className="break-words font-medium text-destructive">{message}</p>
                </div>
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 ml-4.5">
                {error.retryable && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onRetry}
                        className="h-11 gap-1.5 border-destructive/30 px-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive lg:h-7 lg:px-2 lg:text-[10px]"
                    >
                        <RefreshCw className="h-3.5 w-3.5 lg:h-2.5 lg:w-2.5" />
                        {t('ai.chat.retry')}
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDismiss}
                    className="h-11 gap-1.5 px-3 text-xs text-muted-foreground hover:text-foreground lg:h-7 lg:px-2 lg:text-[10px]"
                >
                    <X className="h-3.5 w-3.5 lg:h-2.5 lg:w-2.5" />
                    {t('ai.chat.dismiss')}
                </Button>
            </div>
        </div>
    )
})
