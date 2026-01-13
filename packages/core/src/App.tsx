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
import { APIS } from "./api";
import { resources } from "./locales/resources"
import { merge } from "lodash";
import { ErrorPage } from "./components/ErrorPage";

const { createBrowserRouter,
    createRoutesFromElements, Route, RouterProvider, Provider,
    AppContext, i18n, initReactI18next, LanguageDetector, event } = common;



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


export const App: React.FC<AppProps> = (props) => {
    const { plugins = [] } = props
    const [router, setRouter] = useSafeState<any>()
    const { usePath } = core.useUploadFile()
    const pluginManager = useMemo(() => new common.PluginManager(usePath, plugins), [])
    const [inited, setInited] = useSafeState(false)
    const [refreshFlag, setRefreshFlag] = useState(0)

    useEffect(() => {
        event.on("REFRESH_PLUSINS", () => {
            setRefreshFlag(f => f + 1)
        })
        return () => {
            event.off("REFRESH_PLUSINS")
        }
    }, [])

    useAsyncEffect(async () => {
        if (!inited) {
            try {
                if (!!localStorage.getItem("knowledge-token")) {
                    const installedPlugins: any[] = (await core.useApi(APIS.GET_INSTALLED_PLUGINS)).data
                    pluginManager.init(installedPlugins).then(() => {
                        setInited(true)
                    })
                } else {
                    pluginManager.init([])
                    setRouter(createBrowserRouter(createRoutesFromElements(
                        [
                            <Route path='/' element={<Layout />} errorElement={<ErrorPage />}>
                            </Route>,
                            <Route path='/login' element={<Login />} />,
                            <Route path='/sign-up' element={<SignUpForm />} />
                        ]
                    )))
                    setInited(false)
                    if (window.location.href.includes("login")) {
                        return
                    }
                    window.location.href = '/login'
                }
            } catch (error) {
                pluginManager.init([])
                setRouter(createBrowserRouter(createRoutesFromElements(
                    [
                        <Route path='/' element={<Layout />} errorElement={<Login />}>
                            <Route path="/plugin-hub" element={<Shop />}>
                                <Route path="/plugin-hub" element={<Marketplace />} />
                                <Route path="/plugin-hub/:id" element={<PluginDetail />} />
                            </Route>
                        </Route>,
                        <Route path='/login' element={<Login />} />,
                        <Route path='/sign-up' element={<SignUpForm />} />
                    ]
                )))
                setInited(false)
                if (window.location.href.includes("login")) {
                    return
                }
                window.location.href = '/login'
            }
        }

    }, [refreshFlag])

    useEffect(() => {
        if (inited) {
            const pluginLocales = pluginManager.resloveLocales()
            const res = merge(resources, pluginLocales)
            if (i18n.isInitialized) {
                Object.keys(res).forEach(it => {
                    i18n.addResourceBundle(it, "translation", res[it], true, true)
                })
            } else {
                i18n.use(initReactI18next)
                    .use(LanguageDetector)
                    .init({
                        detection: {
                            lookupLocalStorage: 'language',
                        },
                        resources: res,
                        fallbackLng: "en",
                        debug: false,
                        supportedLngs: common.supportedLngs,
                        interpolation: {
                            escapeValue: false,
                        }
                    })
            }
            const routeConfigs = pluginManager.resloveRoutes()
            const routes = routeConfigs.map(it => reslove(it))
            setRouter(createBrowserRouter(createRoutesFromElements(
                [
                    <Route path='/' element={<Layout />} errorElement={<ErrorPage />}>
                        {routes}
                        <Route path="/plugin-hub" element={<Shop />}>
                            <Route path="/plugin-hub" element={<Marketplace />} />
                            <Route path="/plugin-hub/:id" element={<PluginDetail />} />
                        </Route>
                    </Route>,
                    <Route path='/login' element={<Login />} />,
                    <Route path='/sign-up' element={<SignUpForm />} />
                ]
            )))
            event.emit("PLUGIN_INIT_SUCCESS")
        }
    }, [pluginManager.plugins, inited, refreshFlag])
    return (router ? <AppContext.Provider value={{
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
    </AppContext.Provider> : <ThemeProvider>
        <div className="h-screen w-screen flex items-center justify-center text-lg">
            Loading <icon.Loader2 className="ml-2 animate-spin" />
        </div>
    </ThemeProvider>)
}