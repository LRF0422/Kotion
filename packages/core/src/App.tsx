import React, { createContext, useMemo } from "react";
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from "react-router-dom";
import { Layout } from "./Layout";
import { ThemeProvider, Toaster } from "@repo/ui";
import { Provider } from "react-redux";
import store from './store'
import { Login } from "./components/Login";
import { SignUpForm } from "./components/SignUp";

import '@repo/ui/src/globals.css'
import '@repo/editor/src/styles/editor.css'

import * as ui from "@repo/ui"
import * as common from "@repo/common"
import * as core from "./index"
import * as icon from "@repo/icon"
import * as editor from "@repo/editor"
import { useAsyncEffect, useSafeState } from "ahooks";
import { AppContext, PluginManager } from "@repo/common";

window.React = React
// @ts-ignore
window.ui = ui
// @ts-ignore
window.common = common
// @ts-ignore
window.core = core
// @ts-ignore
window.icon = icon
// @ts-ignore
window.editor = editor


export type Plugins = common.KPlugin<any>[]

export interface AppProps {
    plugins?: Plugins
}

const reslove = (config: common.RouteConfig) => {
    if (config.children) {
        return <Route path={config.path} element={config.element} >
            {
                config.children.map(it => reslove(it))
            }
        </Route>
    } else {
        return <Route path={config.path} element={config.element} />
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
        const routeConfigs = pluginManager.resloveRoutes()
        const routes = routeConfigs.map(it => reslove(it))
        setRouter(createBrowserRouter(createRoutesFromElements(
            [
                <Route path='/' element={<Layout />}>
                    {routes}
                </Route>,
                <Route path='/login' element={<Login />} />,
                <Route path='/sign-up' element={<SignUpForm />} />
            ]
        )))
    }, [])
    return router && <AppContext.Provider value={{
        pluginManager: pluginManager
    }}>
        <ThemeProvider>
            <Provider store={store}>
                <RouterProvider router={router} />
                <Toaster />
            </Provider>
        </ThemeProvider>
    </AppContext.Provider>
}