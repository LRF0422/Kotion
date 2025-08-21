import React, { useEffect, useMemo, useState } from "react";
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from "react-router-dom";
import { Layout } from "./Layout";
import { ThemeProvider, Toaster } from "@kn/ui";
import { Provider } from "react-redux";
import store from './store'
import { Login } from "./components/Login";
import { SignUpForm } from "./components/SignUp";

import * as ui from "@kn/ui"
import * as common from "@kn/common"
import * as core from "./index"
import * as icon from "@kn/icon"
import * as editor from "@kn/editor"
import { useAsyncEffect, useSafeState } from "ahooks";
import { AppContext, PluginManager } from "@kn/common";
import { Shop } from "./components/Shop";
import { PluginDetail } from "./components/Shop/PluginDetail";
import { importScript } from "./utils/utils";
import { Marketplace } from "./components/Shop/Marketplace";
import { APIS } from "./api";
import { event } from "@kn/common";
import { i18n, initReactI18next, LanguageDetector } from "@kn/common";
import { resources } from "./locales/resources"


declare global {
    interface Window {
        ui: any,
        common: any,
        core: any,
        icon: any,
        editor: any
    }
}

window.React = React
window.ui = ui
window.common = common
window.core = core
window.icon = icon
window.editor = editor


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
    const { plugins } = props
    const [router, setRouter] = useSafeState<any>()
    const [allPlugins, setAllPlugins] = useSafeState<any[]>([])
    const [loadFinished, setLoadFinished] = useSafeState<boolean>(false)
    const { usePath } = core.useUploadFile()
    const pluginManager = useMemo<PluginManager>(() => new PluginManager(), [])
    const [flag, setFlag] = useState(0)

    useEffect(() => {
        event.on("REFRESH_PLUSINS", () => {
            setFlag(f => f + 1)
        })
    }, [])

    useEffect(() => {
        if (loadFinished) {
            const pluginLocales = pluginManager.resloveLocales()
            const res = { ...resources, ...pluginLocales }
            console.log('locales resources', res);
            i18n.use(initReactI18next)
                .use(LanguageDetector)
                .init({
                    detection: {
                        lookupLocalStorage: 'language',
                    },
                    resources: res,
                    fallbackLng: "en",
                    debug: true,
                    supportedLngs: common.supportedLngs,
                    interpolation: {
                        escapeValue: false, // not needed for react as it escapes by default
                    }
                })
        }
    }, [loadFinished, allPlugins])

    useAsyncEffect(async () => {
        try {
            if (!!localStorage.getItem("knowledge-token")) {
                const installedPlugins: any[] = (await core.useApi(APIS.GET_INSTALLED_PLUGINS)).data
                if (!installedPlugins || installedPlugins.length === 0) {
                    setAllPlugins([...(plugins || [])])
                    setLoadFinished(true)
                    return
                }
                Promise.all(installedPlugins.map((plugin) => {
                    const path = usePath(plugin.resourcePath)
                    return importScript(path, plugin.pluginKey)
                })).then(res => {
                    setAllPlugins([...(plugins || []), ...res.map(it => Object.values(it)[0])])
                    setLoadFinished(true)
                })
            } else {
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
                if (window.location.href.includes("red")) {
                    return
                }
                window.location.href = '/login?red'
            }
        } catch (error) {
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
            if (window.location.href.includes("red")) {
                return
            }
            window.location.href = '/login?red'
        }

    }, [flag])

    useEffect(() => {
        if (loadFinished) {
            pluginManager.setPlugins(allPlugins.filter(it => !!it))
            console.debug("load plugins finished, loaded plugins: ", allPlugins)
            const routeConfigs = pluginManager.resloveRoutes()
            const routes = routeConfigs.map(it => reslove(it))
            setRouter(createBrowserRouter(createRoutesFromElements(
                [
                    <Route path='/' element={<Layout />} errorElement={<Login />}>
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
        }
    }, [loadFinished, allPlugins])
    return router && <AppContext.Provider value={{
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
    </AppContext.Provider>
}