import { ThemeProvider, Toaster } from "@kn/ui"
import React, { useEffect } from "react"
import { createBrowserRouter, createRoutesFromElements, i18n, initReactI18next, LanguageDetector, Route, RouterProvider, supportedLngs } from "@kn/common";
import { Layout } from "./pages/Layout";
import { Home } from "./pages/Home";
import "@kn/ui/globals.css"
import "./index.css"
import { resources } from "./locales/resources";
import { Templates } from "./pages/Templates";
import { Plugins } from "./pages/Plugins";
import { Docs } from "./pages/Docs";

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
            [
                <Route path="/" element={<Layout />}>
                    <Route path="/" element={<Home />} />
                    <Route path="/templates" element={<Templates />} />
                    <Route path="/plugins" element={<Plugins />} />
                </Route>,
                <Route path="/doc" element={<Docs />} />
            ]
        )
    )

    useEffect(() => {
        // Add smooth scrolling for anchor links
        const handleSmoothScroll = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'A' && target.getAttribute('href')?.startsWith('#')) {
                e.preventDefault();
                const id = target.getAttribute('href')?.substring(1);
                const element = document.getElementById(id!);
                if (element) {
                    element.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                    });
                }
            }
        };

        document.addEventListener('click', handleSmoothScroll);

        return () => {
            document.removeEventListener('click', handleSmoothScroll);
        };
    }, []);

    return <ThemeProvider>
        <RouterProvider router={router} />
        <Toaster />
    </ThemeProvider>
}