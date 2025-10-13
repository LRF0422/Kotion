import { ThemeProvider } from "@kn/ui"
import React from "react"
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider } from "@kn/common";
import { Layout } from "./pages/Layout";
import Home from "./pages/Home";


export const App: React.FC = () => {

    const router = createBrowserRouter(
        createRoutesFromElements(
            <Route path="/" element={<Layout />}>
                <Route path="/" element={<Home />} />
            </Route>
        )
    )

    return <ThemeProvider>
        <RouterProvider router={router} />
    </ThemeProvider>
}