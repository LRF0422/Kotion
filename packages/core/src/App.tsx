import React, { useEffect, useMemo } from "react";
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
import { set } from "lodash";


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
    plugins?: Plugins
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
    useAsyncEffect(async () => {
        if (plugins) {
            setAllPlugins(all => [...all, ...plugins])
        }

        const installedPlugins: any[] = (await core.useApi(APIS.GET_INSTALLED_PLUGINS)).data
        installedPlugins && installedPlugins.forEach(async (plugin, index) => {
            const path = usePath(plugin.resourcePath)
            const js = await importScript(path)
            console.log(Object.values(js)[0]);
            if (js) {
                setAllPlugins(all => [...all, Object.values(js)[0]])
                if (index === installedPlugins.length - 1) {
                    setLoadFinished(true)
                }
            }
        })
    }, [])

    useEffect(() => {
        if (loadFinished) {
            console.log("start");

            allPlugins.forEach(plugin => {
                pluginManager.register(plugin)
            })
            console.log("all plugins", allPlugins);

            const routeConfigs = pluginManager.resloveRoutes()
            const routes = routeConfigs.map(it => reslove(it))
            setRouter(createBrowserRouter(createRoutesFromElements(
                [
                    <Route path='/' element={<Layout />}>
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
    }, [loadFinished])
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