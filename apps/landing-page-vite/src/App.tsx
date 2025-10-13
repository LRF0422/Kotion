import { ThemeProvider } from "@kn/ui"
import React from "react"
import { createBrowserRouter, createRoutesFromElements, i18n, initReactI18next, LanguageDetector, Route, RouterProvider, supportedLngs } from "@kn/common";
import { Layout } from "./pages/Layout";
import Home from "./pages/Home";
import "@kn/ui/globals.css"
import "./index.css"
import { resources } from "./locales/resources";

i18n.use(initReactI18next)
    .use(LanguageDetector)
    .init({
        detection: {
            lookupLocalStorage: 'language',
        },
        resources: resources,
        fallbackLng: "en",
        debug: false,
        supportedLngs: supportedLngs,
        interpolation: {
            escapeValue: false,
        }
    })


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