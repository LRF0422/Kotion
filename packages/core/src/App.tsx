import React, { useEffect, useMemo, useState } from "react";

import { Layout } from "./Layout";
import { ThemeProvider, Toaster } from "@kn/ui";
import store from './store'
import { Login } from "./components/Login";
import { SignUpForm } from "./components/SignUp";
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



// Initialize scoped namespace for plugin access
window.__KN__ = {
    React,
    ui,
    common,
    core,
    icon,
    editor
};


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

    // Create initial router with basic routes - plugins will be loaded in Layout
    useEffect(() => {
        const basicRouter = createBrowserRouter(createRoutesFromElements(
            [
                <Route path='/' element={<Layout onPluginsReady={setPluginsReady} />} errorElement={<ErrorPage />}>
                    <Route path="/plugin-hub" element={<Shop />}>
                        <Route path="/plugin-hub" element={<Marketplace />} />
                        <Route path="/plugin-hub/:id" element={<PluginDetail />} />
                    </Route>
                </Route>,
                <Route path='/login' element={<Login />} />,
                <Route path='/sign-up' element={<SignUpForm />} />
            ]
        ))
        setRouter(basicRouter)
    }, [])

    // Update router when plugins are loaded
    useEffect(() => {
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
                    <Route path='/sign-up' element={<SignUpForm />} />
                ]
            ))
            setRouter(updatedRouter)
        }
    }, [pluginsReady, pluginManager])

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