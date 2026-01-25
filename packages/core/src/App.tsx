import React, { useEffect, useMemo, useState } from "react";

import { Layout } from "./Layout";
import { ThemeProvider, Toaster } from "@kn/ui";
import store from './store'
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
import { ErrorPage } from "./components/ErrorPage";

const { createBrowserRouter,
    createRoutesFromElements, Route, RouterProvider, Provider,
    AppContext, i18n, initReactI18next, LanguageDetector, event } = common;

const reslove = (config: common.RouteConfig) => {
    if (config.children) {
        return <Route path={config.path} element={config.element} key={config.path} >
            {
                config.children.map(it => reslove(it))
            }
        </Route>
    } else {
        return <Route path={config.path} element={config.element} key={config.path} />
    }
}



window.ui = ui
window.common = common
window.core = core
window.icon = icon
window.editor = editor
window.React = React


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

    // Listen for plugin refresh events to update routes
    useEffect(() => {
        const handleRefresh = () => {
            console.log('Received REFRESH_PLUSINS event, updating router');
            setRefreshFlag(prev => prev + 1);
        };

        event.on("REFRESH_PLUSINS", handleRefresh);

        return () => {
            event.off("REFRESH_PLUSINS", handleRefresh);
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
            const pluginLocales = pluginManager.resloveLocales()
            const res = merge(resources, pluginLocales)
            if (i18n.isInitialized) {
                Object.keys(res).forEach(it => {
                    i18n.addResourceBundle(it, "translation", res[it], true, true)
                })
            }

            const routeConfigs = pluginManager.resloveRoutes()
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

    return router ? <AppContext.Provider value={{
        pluginManager: pluginManager
    }}>
        <core.ModalProvider>
            <ThemeProvider>
                <Provider store={store}>
                    <RouterProvider router={router} />
                    <Toaster />
                </Provider>
            </ThemeProvider>
        </core.ModalProvider>
    </AppContext.Provider> : null
}