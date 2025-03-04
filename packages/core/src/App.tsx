import React, { createContext, useMemo } from "react";
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from "react-router-dom";
import { Layout } from "./Layout";
import { ThemeProvider, Toaster } from "@repo/ui";
import { Provider } from "react-redux";
import store from './store'
import { Login } from "./components/Login";
import { SignUpForm } from "./components/SignUp";

import '@repo/ui/globals.css'
import '@repo/editor/src/styles/editor.css'

import * as ui from "@repo/ui"
import * as common from "@repo/common"
import * as core from "./index"
import * as icon from "@repo/icon"
import * as editor from "@repo/editor"
import { useAsyncEffect, useSafeState } from "ahooks";
import { AppContext, PluginManager } from "@repo/common";
import { Shop } from "./components/Shop";
import { PluginDetail } from "./components/Shop/PluginDetail";
import { importScript } from "./utils/utils";


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
    const pluginManager = useMemo<PluginManager>(() => new PluginManager(), [])
    useAsyncEffect(async () => {
        if (plugins) {
            plugins.forEach(it => pluginManager.register(it))
        }

        // const remotePlugin = await importScript('http://127.0.0.1:5501/packages/file-manager-plugin/dist/bundle.js')

        // console.log('remotePlugin', remotePlugin);

        // if (remotePlugin) {
        //     pluginManager.register(remotePlugin.fileManager)

        // }
        const routeConfigs = pluginManager.resloveRoutes()
        const routes = routeConfigs.map(it => reslove(it))
        setRouter(createBrowserRouter(createRoutesFromElements(
            [
                <Route path='/' element={<Layout />}>
                    {routes}
                    <Route path="/plugin-hub" element={<Shop />}>
                        <Route path="/plugin-hub/:id" element={<PluginDetail />} />
                    </Route>
                </Route>,
                <Route path='/login' element={<Login />} />,
                <Route path='/sign-up' element={<SignUpForm />} />
            ]
        )))
    }, [])
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