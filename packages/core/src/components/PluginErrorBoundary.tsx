import React from "react"
import { AlertTriangle, RefreshCw } from "@kn/icon"
import { Button } from "@kn/ui"

interface PluginErrorBoundaryProps {
    children: React.ReactNode
    /** Plugin name for display purposes */
    pluginName?: string
    /** Fallback variant: 'inline' for node views, 'page' for route pages */
    variant?: 'inline' | 'page'
}

interface PluginErrorBoundaryState {
    hasError: boolean
    error: Error | null
}

/**
 * Error boundary that isolates plugin errors from crashing the entire application.
 * 
 * Usage:
 * - Wrap plugin route elements to prevent route-level crashes from reaching the global ErrorPage
 * - Wrap plugin node views to prevent editor node crashes from killing the editor
 */
export class PluginErrorBoundary extends React.Component<PluginErrorBoundaryProps, PluginErrorBoundaryState> {
    constructor(props: PluginErrorBoundaryProps) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): PluginErrorBoundaryState {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error(`[PluginErrorBoundary] Plugin "${this.props.pluginName || 'unknown'}" crashed:`, error, info)
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null })
    }

    render() {
        if (this.state.hasError) {
            const { variant = 'page', pluginName } = this.props

            if (variant === 'inline') {
                return <InlineErrorFallback
                    error={this.state.error}
                    pluginName={pluginName}
                    onReset={this.handleReset}
                />
            }

            return <PageErrorFallback
                error={this.state.error}
                pluginName={pluginName}
                onReset={this.handleReset}
            />
        }
        return this.props.children
    }
}

/**
 * Inline fallback for node views — shows a small error card that doesn't break document flow.
 */
function InlineErrorFallback({ error, pluginName, onReset }: {
    error: Error | null
    pluginName?: string
    onReset: () => void
}) {
    return (
        <div className="my-2 mx-0 p-3 rounded-md border border-destructive/30 bg-destructive/5 dark:bg-destructive/10">
            <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-destructive">
                        {pluginName ? `Plugin "${pluginName}" encountered an error` : 'Plugin error'}
                    </p>
                    {error?.message && (
                        <p className="text-xs text-muted-foreground mt-1 truncate" title={error.message}>
                            {error.message}
                        </p>
                    )}
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onReset}
                    className="h-7 px-2 text-xs shrink-0"
                >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry
                </Button>
            </div>
        </div>
    )
}

/**
 * Page-level fallback for plugin routes — shows error within the page content area,
 * preserving the sidebar and navigation.
 */
function PageErrorFallback({ error, pluginName, onReset }: {
    error: Error | null
    pluginName?: string
    onReset: () => void
}) {
    return (
        <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md w-full text-center space-y-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-destructive" />
                </div>
                <div className="space-y-1">
                    <h2 className="text-lg font-semibold">
                        {pluginName ? `Plugin "${pluginName}" crashed` : 'Plugin encountered an error'}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        This plugin encountered an unexpected error. The rest of the application is unaffected.
                    </p>
                </div>
                {error?.message && (
                    <div className="p-3 rounded-md bg-muted text-left">
                        <p className="text-xs font-mono text-destructive break-all">{error.message}</p>
                    </div>
                )}
                <div className="flex justify-center gap-2">
                    <Button variant="default" size="sm" onClick={onReset}>
                        <RefreshCw className="h-4 w-4 mr-1.5" />
                        Retry
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => window.history.back()}>
                        Go Back
                    </Button>
                </div>
            </div>
        </div>
    )
}
