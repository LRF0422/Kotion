import React, { useEffect, useMemo, useState } from "react";

import { Layout } from "./Layout";
import { ThemeProvider, Toaster, ResponsiveProvider } from "@kn/ui";
import { store } from '@kn/common'
import { Login } from "./components/Login";
import { SignUpForm } from "./components/SignUp";
import { Welcome } from "./components/Welcome";
import * as ui from "@kn/ui"
import * as common from "@kn/common"
import * as core from "./index"
import * as icon from "@kn/icon"
import * as editor from "@kn/editor"
import { useAsyncEffect, useSafeState } from "ahooks";
import { Shop } from "./components/Shop";
import { PluginDetail } from "./components/Shop/PluginDetail";
import { Marketplace } from "./components/Shop/Marketplace";

import { resources } from "./locales/resources"
import { merge } from "lodash";
import { setRequestToast, setSessionExpiredHandler } from "@kn/common"
import { registerCoreToolFactories } from "./ai/tools/register"
import { toast, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@kn/ui"
import { ErrorPage } from "./components/ErrorPage";
import { PluginErrorBoundary } from "./components/PluginErrorBoundary";
import ReactDOM from "react-dom";

const { createBrowserRouter,
    createRoutesFromElements, Route, RouterProvider, Provider,
    AppContext, i18n, initReactI18next, LanguageDetector, event, PLUGIN_CHANGED, PLUGIN_INIT_SUCCESS, createRoot } = common;

const reslove = (config: common.RouteConfig) => {
    // Wrap each plugin route element with PluginErrorBoundary to isolate plugin errors
    // so a single plugin crash doesn't take down the entire application.
    const wrappedElement = config.element
        ? <PluginErrorBoundary pluginName={config.name} variant="page">{config.element}</PluginErrorBoundary>
        : undefined

    if (config.children) {
        return <Route path={config.path} element={wrappedElement} key={config.path} >
            {
                config.children.map(it => reslove(it))
            }
        </Route>
    } else {
        return <Route path={config.path} element={wrappedElement} key={config.path} />
    }
}



window.ui = ui
window.common = common
window.core = core
window.icon = icon
window.editor = editor
window.React = React
window.ReactDOM = ReactDOM

// ---------------------------------------------------------------------------
// Session-expired dialog (rendered imperatively when token expires)
// ---------------------------------------------------------------------------

const SessionExpiredDialog: React.FC<{ onLoginAgain: () => void; onStay: () => void }> = ({ onLoginAgain, onStay }) => {
    const [open, setOpen] = React.useState(true)
    const handled = React.useRef(false)

    const handleAction = () => {
        if (handled.current) return
        handled.current = true
        onLoginAgain()
    }

    const handleCancel = () => {
        if (handled.current) return
        handled.current = true
        onStay()
    }

    return (
        <AlertDialog open={open} onOpenChange={(v) => {
            if (!v) handleCancel()
            setOpen(v)
        }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>登录已过期</AlertDialogTitle>
                    <AlertDialogDescription>
                        您的登录状态已过期，请重新登录。您也可以继续留在当前页面查看内容。
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogAction onClick={handleAction}>
                        重新登录
                    </AlertDialogAction>
                    <AlertDialogCancel onClick={handleCancel}>
                        留在当前页面
                    </AlertDialogCancel>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

function showSessionExpiredDialog() {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    const unmount = () => {
        setTimeout(() => {
            root.unmount()
            container.remove()
        }, 300)
    }

    root.render(
        <SessionExpiredDialog
            onLoginAgain={() => {
                window.location.href = '/login'
            }}
            onStay={unmount}
        />
    )
}

export type Plugins = common.KPlugin<any>[]

export interface AppProps {
    plugins?: Plugins,
}


export const App: React.FC<AppProps> = (props) => {
    const { plugins = [] } = props
    const [router, setRouter] = useSafeState<any>()
    const { usePath } = core.useUploadFile()
    const pluginManager = useMemo(() => new common.PluginManager(usePath, plugins), [])
    const [pluginsReady, setPluginsReady] = useState(false)
    const [refreshFlag, setRefreshFlag] = useState(0)

    // Wire up toast for the request module
    setRequestToast((msg, opts) => toast.error(msg))

    // Wire up session-expired dialog — shows a prompt instead of silently
    // redirecting to /login when the token expires
    setSessionExpiredHandler(showSessionExpiredDialog)

    // Register core AI tool factories so plugins can use them via @kn/common
    registerCoreToolFactories()

    // Listen for plugin events to update routes
    useEffect(() => {
        const handlePluginChange = () => {
            console.log('Received plugin change event, updating router');
            setRefreshFlag(prev => prev + 1);
        };

        // PLUGIN_CHANGED: emitted when user installs/uninstalls/updates/refreshes
        event.on(PLUGIN_CHANGED, handlePluginChange);
        // PLUGIN_INIT_SUCCESS: emitted after Layout initializes plugins from server
        event.on(PLUGIN_INIT_SUCCESS, handlePluginChange);

        return () => {
            event.off(PLUGIN_CHANGED, handlePluginChange);
            event.off(PLUGIN_INIT_SUCCESS, handlePluginChange);
        };
    }, []);

    // Initialize i18n immediately without plugin locales
    useEffect(() => {
        if (!i18n.isInitialized) {
            i18n.use(initReactI18next)
                .use(LanguageDetector)
                .init({
                    detection: {
                        lookupLocalStorage: 'language',
                    },
                    resources: resources,
                    fallbackLng: "en",
                    debug: false,
                    supportedLngs: common.supportedLngs,
                    interpolation: {
                        escapeValue: false,
                    }
                })
        }
    }, [])

    // DON'T create initial router - wait for plugins to load first
    // This prevents route matching failures when refreshing on plugin routes

    // Create/Update router when plugins are loaded
    useEffect(() => {
        console.log('Router useEffect triggered. pluginsReady:', pluginsReady, 'refreshFlag:', refreshFlag);

        if (pluginsReady && pluginManager) {
            const pluginLocales = pluginManager.resolveLocales()
            const res = merge(resources, pluginLocales)
            if (i18n.isInitialized) {
                Object.keys(res).forEach(it => {
                    i18n.addResourceBundle(it, "translation", res[it], true, true)
                })
            }

            const routeConfigs = pluginManager.resolveRoutes()
            const routes = routeConfigs.map(it => reslove(it))
            console.log('Creating router with', routes.length, 'plugin routes')
            const updatedRouter = createBrowserRouter(createRoutesFromElements(
                [
                    <Route path='/' element={<Layout onPluginsReady={setPluginsReady} />} errorElement={<ErrorPage />}>
                        {routes}
                        <Route path="/plugin-hub" element={<Shop />}>
                            <Route path="/plugin-hub" element={<Marketplace />} />
                            <Route path="/plugin-hub/:id" element={<PluginDetail />} />
                        </Route>
                    </Route>,
                    <Route path='/login' element={<Login />} />,
                    <Route path='/sign-up' element={<SignUpForm />} />,
                    <Route path='/welcome' element={<Welcome />} />
                ]
            ))
            setRouter(updatedRouter)
        } else {
            // Create minimal router while waiting for plugins
            // The Layout component will show loading screen until plugins are ready
            console.log('Creating minimal router (plugins not ready yet)')
            const minimalRouter = createBrowserRouter(createRoutesFromElements(
                [
                    <Route path='/' element={<Layout onPluginsReady={setPluginsReady} />} errorElement={<ErrorPage />}>
                        <Route path="*" element={<div className="flex items-center justify-center h-screen">Loading...</div>} />
                    </Route>,
                    <Route path='/login' element={<Login />} />,
                    <Route path='/sign-up' element={<SignUpForm />} />,
                    <Route path='/welcome' element={<Welcome />} />
                ]
            ))
            setRouter(minimalRouter)
        }
    }, [pluginsReady, pluginManager, refreshFlag])

    return <AppContext.Provider value={{
        pluginManager: pluginManager,
        serviceRegistry: pluginManager?.serviceRegistry
    }}>
        <ThemeProvider>
            <ResponsiveProvider>
            <Provider store={store}>
                {router
                    ? <RouterProvider router={router} />
                    : <div className="fixed inset-0 flex items-center justify-center bg-background">
                        <div className="flex flex-col items-center gap-4">
                            <div className="text-[60px] font-bold text-primary">KN</div>
                            <div className="flex items-center gap-2 text-lg text-muted-foreground">
                                <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                                <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                                <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        </div>
                    </div>
                }
                <Toaster />
            </Provider>
            </ResponsiveProvider>
        </ThemeProvider>
    </AppContext.Provider>
}