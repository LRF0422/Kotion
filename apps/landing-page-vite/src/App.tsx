import { ThemeProvider, Toaster } from "@kn/ui"
import React, { useEffect } from "react"
import { createBrowserRouter, createRoutesFromElements, i18n, initReactI18next, LanguageDetector, Route, RouterProvider, supportedLngs } from "@kn/common";
import { Layout } from "./pages/Layout";
import { Home } from "./pages/Home";
import { NotFound } from "./pages/NotFound";
import { captureReferral } from "./ops/referral";
import "@kn/ui/globals.css"
import "./index.css"
import { resources } from "./locales/resources";

// 次级路由全部按需加载，Home 保持同步引入以保护 LCP
const LazyTemplates = React.lazy(() => import("./pages/Templates").then((m) => ({ default: m.Templates })));
const LazyPlugins = React.lazy(() => import("./pages/Plugins").then((m) => ({ default: m.Plugins })));
const LazyDocs = React.lazy(() => import("./pages/Docs").then((m) => ({ default: m.Docs })));
const LazyChangelog = React.lazy(() => import("./pages/Changelog").then((m) => ({ default: m.Changelog })));
const LazyCampaign = React.lazy(() => import("./pages/Campaign").then((m) => ({ default: m.Campaign })));
const LazySubscribeResult = React.lazy(() => import("./pages/Subscribe/Result").then((m) => ({ default: m.SubscribeResult })));

/** 路由级兜底：纯 Tailwind 的居中转圈，不引入新依赖。 */
const RouteFallback: React.FC = () => (
    <div className="flex items-center justify-center min-h-[60vh]" role="status" aria-live="polite">
        <span
            className="w-8 h-8 rounded-full border-2 animate-spin"
            style={{ borderColor: "var(--kn-line)", borderTopColor: "transparent" }}
        />
        <span className="sr-only">Loading…</span>
    </div>
)

const lazyElement = (node: React.ReactNode) => (
    <React.Suspense fallback={<RouteFallback />}>{node}</React.Suspense>
)

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
            <Route path="templates" element={lazyElement(<LazyTemplates />)} />
            <Route path="plugins" element={lazyElement(<LazyPlugins />)} />
            <Route path="doc" element={lazyElement(<LazyDocs />)} />
            <Route path="doc/:section" element={lazyElement(<LazyDocs />)} />
            <Route path="changelog" element={lazyElement(<LazyChangelog />)} />
            <Route path="c/:slug" element={lazyElement(<LazyCampaign />)} />
            <Route path="unsubscribe" element={lazyElement(<LazySubscribeResult mode="unsubscribe" />)} />
            <Route path="confirm" element={lazyElement(<LazySubscribeResult mode="confirm" />)} />
            <Route path="*" element={<NotFound />} />
        </Route>
    )

    const router = createBrowserRouter(
        createRoutesFromElements([buildRoutes(""), buildRoutes(":lang")])
    )

    useEffect(() => {
        // 首次挂载捕获 ?ref= 邀请码并持久化（首触优先，每会话只上报一次）
        captureReferral();

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
