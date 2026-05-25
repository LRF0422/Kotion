import React from "react"
import { NodeViewWrapper } from "@tiptap/react"

interface NodeViewErrorBoundaryProps {
    children: React.ReactNode
    pluginName?: string
}

interface NodeViewErrorBoundaryState {
    hasError: boolean
    error: Error | null
}

/**
 * Error boundary specifically designed for ProseMirror node views.
 * When a plugin's node view component throws, this boundary catches the error
 * and renders a graceful fallback within the document flow, preventing the
 * entire editor from crashing.
 */
export class NodeViewErrorBoundary extends React.Component<NodeViewErrorBoundaryProps, NodeViewErrorBoundaryState> {
    constructor(props: NodeViewErrorBoundaryProps) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): NodeViewErrorBoundaryState {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error(`[NodeViewErrorBoundary] Node view "${this.props.pluginName || 'unknown'}" crashed:`, error, info)
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null })
    }

    render() {
        if (this.state.hasError) {
            return (
                <NodeViewWrapper className="plugin-node-error">
                    <div className="my-1 p-2 rounded border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 select-none">
                        <div className="flex items-center gap-2 text-xs">
                            <svg className="h-3.5 w-3.5 text-red-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                            <span className="text-red-600 dark:text-red-400 font-medium">
                                {this.props.pluginName ? `${this.props.pluginName} error` : 'Plugin error'}
                            </span>
                            <button
                                onClick={this.handleRetry}
                                className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                            >
                                Retry
                            </button>
                        </div>
                        {this.state.error?.message && (
                            <p className="mt-1 text-[10px] text-red-500/70 dark:text-red-400/60 truncate" title={this.state.error.message}>
                                {this.state.error.message}
                            </p>
                        )}
                    </div>
                </NodeViewWrapper>
            )
        }
        return this.props.children
    }
}

/**
 * Higher-order component that wraps a node view component with NodeViewErrorBoundary.
 * Use this to wrap your plugin's node view components before passing to ReactNodeViewRenderer.
 *
 * @example
 * ```ts
 * import { withNodeViewErrorBoundary, ReactNodeViewRenderer } from "@kn/editor"
 * 
 * addNodeView() {
 *     return ReactNodeViewRenderer(withNodeViewErrorBoundary(MyNodeView, "my-plugin"))
 * }
 * ```
 */
export function withNodeViewErrorBoundary<P extends object>(
    Component: React.ComponentType<P>,
    pluginName?: string
): React.FC<P> {
    const WrappedComponent: React.FC<P> = (props) => (
        <NodeViewErrorBoundary pluginName={pluginName}>
            <Component {...props} />
        </NodeViewErrorBoundary>
    )
    WrappedComponent.displayName = `WithNodeViewErrorBoundary(${Component.displayName || Component.name || 'Component'})`
    return WrappedComponent
}
