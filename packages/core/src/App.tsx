import React from "react";
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

window.React = React
// @ts-ignore
window.ui = ui
// @ts-ignore
window.common = common


export interface AppProps {
}


export const App: React.FC = () => {
    const router = createBrowserRouter(createRoutesFromElements(
        [
          <Route path='/' element={<Layout />}>
          </Route>,
          <Route path='/login' element={<Login />} />,
          <Route path='/sign-up' element={<SignUpForm />} />
        ]
      ))
    
      return <ThemeProvider>
        <Provider store={store}>
          <RouterProvider router={router} />
          <Toaster />
        </Provider>
      </ThemeProvider>
}