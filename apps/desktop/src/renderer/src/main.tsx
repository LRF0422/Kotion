import ReactDOM from 'react-dom/client'
import { App } from "@kn/core"
import { DefaultPluginInstance } from '@kn/plugin-main'
import "@kn/ui/globals.css"
import './index.css'
import React from 'react'

console.log('Desktop app starting...')

// Expose the host platform so the shell can reserve a macOS title band for the
// native traffic lights (html[data-platform="darwin"] in @kn/ui/globals.css).
document.documentElement.dataset.platform =
    (window as any).knDesktop?.platform
    ?? (/Mac/i.test(navigator.platform) ? 'darwin' : 'other')

// Native fullscreen hides the traffic lights; drop the reserved title band.
;(window as any).knDesktop?.on?.('fullscreen', (isFullscreen: boolean) => {
    document.documentElement.dataset.fullscreen = isFullscreen ? 'true' : 'false'
})

// Keep the native traffic lights aligned with the shell band's controls and the
// left rail. The buttons are native window controls, so only the main process
// can move them. Measured on device, the band controls are 28px tall and centred
// in the 38px band (centre y≈19), while y=13 rendered the lights ~2px lower; x
// centres the first light over the rail's icon column (centre x≈24). Hence the
// shared x=18, y=11 for both styles.
const TRAFFIC_LIGHT_POSITION = {
    classic: { x: 18, y: 11 },
    modern: { x: 18, y: 11 },
} as const

const syncTrafficLights = () => {
    const style = document.documentElement.dataset.uiStyle === 'modern' ? 'modern' : 'classic'
    ;(window as any).knDesktop?.invoke?.('window.setTrafficLights', TRAFFIC_LIGHT_POSITION[style])
}

new MutationObserver(syncTrafficLights).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-ui-style'],
})
syncTrafficLights()

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

/**
 * Production packages only bundle the host-owned system plugins; optional
 * plugins (GitHub, AI, bitable, …) are loaded at runtime by PluginManager from
 * the user's installed plugins. Development still bundles them for convenience.
 */
const loadInitialPlugins = async () => {
    if (import.meta.env.DEV) {
        try {
            const { bundledPlugins } = await import('./bundled-plugins')
            return bundledPlugins
        } catch (error) {
            console.error('Failed to load bundled plugins:', error)
            return [DefaultPluginInstance]
        }
    }
    try {
        const { systemPlugins } = await import('./system-plugins')
        return systemPlugins
    } catch (error) {
        console.error('Failed to load system plugins:', error)
        return [DefaultPluginInstance]
    }
}

void (async () => {
    const plugins = await loadInitialPlugins()
    ReactDOM.createRoot(document.getElementById('root')!).render(
        <ErrorBoundary>
            <App plugins={plugins} />
        </ErrorBoundary>
    )
})()
