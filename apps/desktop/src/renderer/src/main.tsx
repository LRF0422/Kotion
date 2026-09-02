import ReactDOM from 'react-dom/client'
import { App } from "@kn/core"
import { DefaultPluginInstance } from '@kn/plugin-main'
import "@kn/ui/globals.css"
import { fileManager } from '@kn/file-manager'
import { blockReference } from "@kn/plugin-block-reference"
import { ai } from "@kn/plugin-ai"
import { bitable } from "@kn/plugin-bitable"
import { weaverOA } from "@kn/plugin-weaver-oa"
import { theme } from "@kn/plugin-theme"
import { speechToText } from "@kn/plugin-speech-to-text"
import './index.css'
import React from 'react'

console.log('Desktop app starting...')

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
    constructor(props: { children: React.ReactNode }) {
        super(props)
        this.state = { hasError: false, error: null }
    }
    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error }
    }
    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('React Error:', error, info)
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-8">
                    <div className="max-w-2xl w-full space-y-6">
                        <div className="text-center space-y-2">
                            <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                                <svg className="w-8 h-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h1 className="text-2xl font-bold">Something went wrong</h1>
                            <p className="text-muted-foreground">An unexpected error occurred</p>
                        </div>
                        <div className="bg-card border rounded-lg p-4 space-y-2">
                            <p className="text-sm font-medium text-destructive">{this.state.error?.message}</p>
                            <pre className="text-xs text-muted-foreground overflow-auto max-h-48 p-2 bg-muted rounded">
                                {this.state.error?.stack}
                            </pre>
                        </div>
                        <div className="flex justify-center gap-3">
                            <button
                                onClick={() => window.location.href = '/'}
                                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                            >
                                Back to Home
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
                            >
                                Reload Page
                            </button>
                        </div>
                    </div>
                </div>
            )
        }
        return this.props.children
    }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
        <App plugins={[DefaultPluginInstance, fileManager, bitable, blockReference, ai, weaverOA, theme, speechToText]} />
    </ErrorBoundary>
)
