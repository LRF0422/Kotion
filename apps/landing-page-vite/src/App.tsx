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
import { Changelog } from "./pages/Changelog";

// 以 /zh、/en 路径前缀优先决定初始语言，其次才走 localStorage / navigator
const pathLang = typeof window !== 'undefined'
    ? window.location.pathname.match(/^\/(zh|en)(?=\/|$)/)?.[1]
    : undefined

i18n.use(initReactI18next)
    .use(LanguageDetector)
    .init({
        lng: pathLang,
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

    // 同一套页面同时挂载在无前缀与 /:lang 前缀下，便于分语言 SEO 与看数
    const buildRoutes = (prefix: string) => (
        <Route key={prefix || "root"} path={prefix || "/"} element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="templates" element={<Templates />} />
            <Route path="plugins" element={<Plugins />} />
            <Route path="doc" element={<Docs />} />
            <Route path="doc/:section" element={<Docs />} />
            <Route path="changelog" element={<Changelog />} />
        </Route>
    )

    const router = createBrowserRouter(
        createRoutesFromElements([buildRoutes(""), buildRoutes(":lang")])
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