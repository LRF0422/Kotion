import React, { useEffect, useMemo, useState } from "react";
/**
 * The automatic JSX runtime must be published to plugins as its own module.
 *
 * `react/jsx-runtime` is a real subpath, not a re-export of the `react` main
 * entry (React 18's `React.jsx` is `undefined`), and plugin bundles are told to
 * treat it as a host module. Publishing the module itself — instead of pointing
 * it at `React` — is what keeps "install a third-party React library" working.
 */
import * as jsxRuntime from "react/jsx-runtime";
import * as jsxDevRuntime from "react/jsx-dev-runtime";

import { Layout } from "./Layout";
import { ThemeProvider, Toaster, ResponsiveProvider, bootSplashReady } from "@kn/ui";
import { store } from '@kn/common'
import { logger } from '@kn/common'
import { createAppStorage } from './storage/app-storage'
import { importLegacyLocalStorage } from './storage/legacy-local-storage'
import { recordSignIn } from './auth/last-sign-in'
import { Login } from "./components/Login";
import { SignUpForm } from "./components/SignUp";
import { Welcome } from "./components/Welcome";
import * as ui from "@kn/ui"
import * as common from "@kn/common"
import * as legacyCoreApi from "./legacy-core-api"
import * as icon from "@kn/icon"
import * as editor from "@kn/editor"
import { Shop } from "./components/Shop";
import { PluginDetail } from "./components/Shop/PluginDetail";
import { Marketplace } from "./components/Shop/Marketplace";

import { resources } from "./locales/resources"
import { merge } from "lodash";
import { AgentPaneProvider, useRegistryVersion, useI18nInitialized, clearContextSensitiveClientState, normalizeTokenResponse, notifyContextChanged, setRequestToast, setSessionExpiredHandler, resetSessionExpiredGuard, setEntitlementRequiredHandler, setAgentContextWhitelist, subscribeToContextChanges, useAsyncEffect, useSafeState, useTranslation, useApi, useUploadFile, APIS, saveTokens } from "@kn/common"
import { registerCoreAgentTools, registerCoreToolFactories } from "./ai/tools/register"
import { registerOffscreenEditorBridge, setMaxOffscreenSessions } from "./ai/offscreen"
import { registerAgentDocumentBridge } from "./ai/agentdoc"
import { registerAgentRuntime } from "./ai/agent/runtime"
import { registerAgentPaneHost } from "./components/AgentPaneHostImpl"
import { AIAssistantPage } from "./pages/AIAssistantPage"
import { registerPageEditWindow } from "./components/PageEditWindowImpl"
import { toast, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel, Button, Input, Label } from "@kn/ui"
import { Loader2, Eye, EyeOff } from "@kn/icon"
import { ErrorPage } from "./components/ErrorPage";
import { LivePluginRoutes } from "./routing/LivePluginRoutes";
import { createRouteCacheHandle } from "./routing/route-cache";
import { PluginErrorBoundary } from "./components/PluginErrorBoundary";
import ReactDOM from "react-dom";
import { PLUGIN_API_VERSION } from "@kn/plugin-api";
import * as pluginApi from "@kn/plugin-api";
import { createDesktopBridge } from "./desktop/bridge";
import { OrganizationInvitationAccept } from "./components/settings/OrganizationInvitationAccept";
import { createSpacePageService } from "./domain/space-page";
import { uploadTaskService } from "./services/upload/upload-task-service";
import { createPluginMarketplaceService } from "./services/plugin-marketplace";
import { createPluginDevHost } from "@kn/common";
import { PluginPublisherHost } from "./components/Shop/PluginUploader/PluginPublisherHost";

const { createBrowserRouter,
    createRoutesFromElements, Route, RouterProvider, Provider, EntitlementsProvider,
    AppContext, i18n, initReactI18next, LanguageDetector, event, PLUGIN_CHANGED, PLUGIN_INIT_SUCCESS, createRoot } = common;

const spacePageService = createSpacePageService()

const reslove = (config: common.RouteConfig) => {
    // Wrap each plugin route element with PluginErrorBoundary to isolate plugin errors
    // so a single plugin crash doesn't take down the entire application.
    const wrappedElement = config.element
        ? <PluginErrorBoundary pluginName={config.name} variant="page">{config.element}</PluginErrorBoundary>
        : undefined

    // Route cache participation and the route's *pattern* travel on `handle`:
    // `useMatches()` does not expose the route object, and the shell's
    // RouteCacheOutlet keys keep-alive slots by pattern. See routing/route-cache.ts.
    const handle = createRouteCacheHandle(config.path, config.keepAlive)

    if (config.children) {
        return <Route path={config.path} element={wrappedElement} handle={handle} key={config.path} >
            {
                config.children.map(it => reslove(it))
            }
        </Route>
    } else {
        return <Route path={config.path} element={wrappedElement} handle={handle} key={config.path} />
    }
}



// ---------------------------------------------------------------------------
// Session-expired dialog (rendered imperatively when token expires)
// ---------------------------------------------------------------------------

const SessionExpiredDialog: React.FC<{ onSuccess: () => void; onStay: () => void }> = ({ onSuccess, onStay }) => {
    const [open, setOpen] = React.useState(true)
    const [mode, setMode] = React.useState<'prompt' | 'form'>('prompt')
    const [account, setAccount] = React.useState('')
    const [password, setPassword] = React.useState('')
    const [showPassword, setShowPassword] = React.useState(false)
    const [loading, setLoading] = React.useState(false)
    const [errorMsg, setErrorMsg] = React.useState('')
    const handled = React.useRef(false)
    const { t } = useTranslation()

    const handleStay = () => {
        if (handled.current) return
        handled.current = true
        onStay()
    }

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault()
        if (loading) return
        if (!account.trim() || !password) {
            setErrorMsg(t('auth.sessionExpired.emptyFields') || t('auth.login.submit'))
            return
        }
        setLoading(true)
        setErrorMsg('')
        try {
            const res: any = await useApi(APIS.LOGIN, {
                account,
                password,
                grantType: 'password',
                audience: 'kotion-client',
                type: 'account',
                scope: 'all',
            })
            const tokens = normalizeTokenResponse(res.data)
            if (!tokens.accessToken || !tokens.refreshToken) throw new Error('Missing login tokens')
            clearContextSensitiveClientState()
            saveTokens(tokens.accessToken, tokens.refreshToken)
            notifyContextChanged("")
            localStorage.setItem('isLogin', 'false')
            // Same record as the login page: the session-expired dialog is a
            // real re-login, so the account menu must not keep a stale time.
            void recordSignIn(account)
            if (handled.current) return
            handled.current = true
            onSuccess()
        } catch (err: any) {
            // request.tsx already toasts on non-200; surface a compact inline hint too
            setErrorMsg(err?.message || '')
        } finally {
            setLoading(false)
        }
    }

    return (
        <AlertDialog open={open} onOpenChange={(v) => {
            // Only allow closing via the explicit "stay" button; ignore outside clicks
            // to avoid accidentally dismissing the re-login form.
            if (!v && mode === 'prompt') handleStay()
            else setOpen(v)
        }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t('auth.sessionExpired.title')}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {t('auth.sessionExpired.message')}
                    </AlertDialogDescription>
                </AlertDialogHeader>

                {mode === 'form' && (
                    <form className="space-y-4 py-2" onSubmit={handleSubmit}>
                        <div className="space-y-1.5">
                            <Label htmlFor="session-relogin-account" className="text-sm">
                                {t('auth.common.email')}
                            </Label>
                            <Input
                                id="session-relogin-account"
                                autoFocus
                                autoComplete="username"
                                value={account}
                                onChange={(e) => setAccount(e.target.value)}
                                placeholder={t('auth.common.emailPlaceholder')}
                                disabled={loading}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="session-relogin-password" className="text-sm">
                                {t('auth.common.password')}
                            </Label>
                            <div className="relative">
                                <Input
                                    id="session-relogin-password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder={t('auth.login.passwordPlaceholder')}
                                    className="pr-10"
                                    disabled={loading}
                                />
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    onClick={() => setShowPassword((v) => !v)}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>
                        {errorMsg && (
                            <p className="text-xs text-destructive">{errorMsg}</p>
                        )}
                        {/* Hidden submit so pressing Enter within the inputs submits the form */}
                        <button type="submit" className="hidden" aria-hidden="true" />
                    </form>
                )}

                <AlertDialogFooter>
                    {mode === 'prompt' ? (
                        <>
                            <AlertDialogCancel onClick={handleStay}>
                                {t('auth.sessionExpired.stayHere')}
                            </AlertDialogCancel>
                            <AlertDialogAction onClick={(e) => { e.preventDefault(); setMode('form') }}>
                                {t('auth.sessionExpired.reLogin')}
                            </AlertDialogAction>
                        </>
                    ) : (
                        <>
                            <Button variant="ghost" type="button" onClick={handleStay} disabled={loading}>
                                {t('auth.sessionExpired.stayHere')}
                            </Button>
                            <Button type="button" onClick={() => handleSubmit()} disabled={loading}>
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t('auth.login.submit')}
                            </Button>
                        </>
                    )}
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

function showEntitlementRequiredDialog(message: string) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const close = () => {
        setTimeout(() => {
            root.unmount()
            container.remove()
        }, 200)
    }
    root.render(
        <AlertDialog open onOpenChange={(v) => { if (!v) close() }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>需要升级方案</AlertDialogTitle>
                    <AlertDialogDescription>{message}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogAction onClick={close}>知道了</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

function showSessionExpiredDialog() {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    const unmount = () => {
        setTimeout(() => {
            root.unmount()
            container.remove()
        }, 300)
    }

    root.render(
        <SessionExpiredDialog
            onSuccess={() => {
                resetSessionExpiredGuard()
                toast.success(translateSafe('auth.login.title', 'Logged in'))
                window.location.assign('/')
            }}
            onStay={() => {
                resetSessionExpiredGuard()
                unmount()
            }}
        />
    )
}

// Imperative i18n lookup for use outside of React components (e.g. after the
// dialog has already unmounted). Falls back to the provided default text when
// i18n is not initialised or the key is missing.
function translateSafe(key: string, fallback: string): string {
    try {
        const value = (i18n as any)?.t?.(key)
        return typeof value === 'string' && value !== key ? value : fallback
    } catch {
        return fallback
    }
}

export type Plugins = common.KPlugin<any>[]

export interface AppProps {
    plugins?: Plugins,
}

let coreRuntimeRegistered = false
const ensureCoreRuntimeRegistered = () => {
    if (coreRuntimeRegistered) return
    // Agent SDK runtime: gateway path + JWT-aware fetch (see ai/agent/runtime).
    registerAgentRuntime()
    registerCoreToolFactories()
    // Editor-free workspace tool IMPLEMENTATIONS (M3). A plugin must still
    // declare them via `agent.include` before the agent can call them.
    registerCoreAgentTools()
    // Kernel side-peek pane host (plugin-rendered artifact previews) — owns
    // the chrome that @kn/common cannot import.
    registerAgentPaneHost()
    // Agent CONTEXT providers run only for ids the application authorizes
    // (contract decision 3 — context reads user data). Empty on purpose: no
    // surface consumes context yet, so nothing is authorized. Add an id here
    // together with the surface that injects the loaded context.
    setAgentContextWhitelist([])
    registerOffscreenEditorBridge()
    // Per-agent private documents (真并行): delegated agents fork their own
    // copy of a page and merge back when they finish.
    registerAgentDocumentBridge()
    // Parallel delegation can legitimately hold several off-screen editors at
    // once (one per agent's page); the cap only bounds *idle* sessions.
    setMaxOffscreenSessions(8)
    registerPageEditWindow()
    coreRuntimeRegistered = true
}

export const App: React.FC<AppProps> = (props) => {
    ensureCoreRuntimeRegistered()
    const { plugins = [] } = props
    const [router, setRouter] = useSafeState<any>()
    const { usePath } = useUploadFile()
    const pluginManager = useMemo(() => {
        // Desktop capabilities are registered as a core service on Electron and
        // stay absent on the web, so plugins use useOptionalService("desktop").
        const desktop = createDesktopBridge()
        const storage = createAppStorage(desktop)
        const manager = new common.PluginManager({
            // Plugin artifacts are served from the public (no-auth) plugin endpoint
            // so script tags need no Authorization query param and SRI/CORS work.
            resolveUrl: (resourcePath: string) => usePath(resourcePath)
                .replace('/oss/endpoint/download', '/oss/endpoint/public/plugin'),
            hostApiVersion: PLUGIN_API_VERSION,
            coreServices: {
                spacePageService,
                uploadTaskService,
                ...(desktop ? { desktop } : {}),
            },
        }, plugins)
        // The plugin studio (and any future tooling plugin) hot-installs local
        // bundles through this narrow surface instead of importing the manager.
        manager.registerCoreService('pluginHost', {
            installBundle: (bundle) => manager.installBundle(bundle),
            installFromSource: (options) => manager.installPluginFromSource(options),
            uninstall: (name: string) => manager.uninstallPlugin(name),
            has: (name: string) => manager.hasPlugin(name),
            getActiveNames: () => manager.getAllPluginNames(),
            subscribe: (listener: () => void) => manager.onChange(listener),
        })
        // Fuller plugin-management surface: the studio (and any future
        // management UI) lists installed plugins with source/version and
        // drives install/uninstall through this instead of the manager.
        manager.registerCoreService('pluginManagement', {
            list: () => manager.getPluginEntries(),
            get: (name) => manager.getPluginEntry(name),
            has: (name) => manager.hasPlugin(name),
            getActiveNames: () => manager.getAllPluginNames(),
            install: (input) => manager.installPlugin(input),
            installBundle: (bundle) => manager.installBundle(bundle),
            installFromSource: (options) => manager.installPluginFromSource(options),
            uninstall: (name) => manager.uninstallPlugin(name),
            isRemovable: (name) => manager.isPluginRemovable(name),
            subscribe: (listener) => manager.onChange(listener),
        })
        // Catalogue lifecycle (submit / publish a version / upgrade), shared
        // by the Shop UI and the plugin studio's publish flow.
        manager.registerCoreService('pluginMarketplace', createPluginMarketplaceService())
        // Dev-session binding. Owned by the host, not by the studio page: a
        // project's builds keep hot-reloading the window while the developer is
        // looking at the plugin they are developing (or at anything else).
        manager.registerCoreService('pluginDevHost', createPluginDevHost({
            manager,
            dev: desktop?.dev,
        }))
        // Durable storage, registered on every platform: SQLite through the
        // desktop bridge, `localStorage` on the web, memory as the last resort.
        // Always present, so consumers never need a null check for it.
        manager.registerCoreService('storage', storage)
        // Move pre-storage localStorage data into the durable store, once per
        // database. Fire-and-forget on purpose: it is housekeeping, and the
        // marker + "never overwrite" rules make a duplicate run harmless.
        void importLegacyLocalStorage(storage).catch((error) => {
            logger.warn('storage: legacy localStorage import failed', error)
        })
        return manager
    }, [])
    const [pluginsReady, setPluginsReady] = useState(false)
    const [refreshFlag, setRefreshFlag] = useState(0)

    useEffect(() => subscribeToContextChanges(() => {
        if (window.location.pathname !== '/login') window.location.assign('/')
    }), [])

    useEffect(() => {
        const unbind = common.bindServiceRegistry(pluginManager.serviceRegistry)
        return () => {
            if (typeof unbind === 'function') unbind()
        }
    }, [pluginManager])

    /**
     * Plugin translations, registered as soon as the contributing plugin is active.
     *
     * This used to happen inside the router effect, i.e. only when a
     * `PLUGIN_CHANGED` arrived — which a dev build never emits, so a studio
     * plugin's strings never landed at all.
     *
     * Applied during render (not in an effect) on purpose: i18next's
     * `addResourceBundle` emits **no** event (verified), so a registration that
     * lands after the plugin's first paint would never re-render anything — the
     * strings would sit in the store unused until some unrelated state change. The
     * call is idempotent (`overwrite: true`), so re-running it on a re-render or in
     * StrictMode is harmless.
     *
     * It also has to wait for i18n itself: the host calls `i18n.init()` in an
     * effect and `init()` settles asynchronously, so on the first render
     * `isInitialized` is still false. Keying only on the locales made that first
     * attempt a silent no-op that never retried — every plugin string then
     * rendered as its key (`pluginStudio.title` in the page header).
     */
    /**
     * Read through **the manager this component owns**, never through
     * `AppContext`: `App` is the component that provides that context, and a
     * component never sees its own provider's value. Using the context hook here
     * (`usePluginLocales()`) silently yielded `{}` — no plugin translation was ever
     * registered, and every `t('pluginStudio.*')` in the studio rendered as its key.
     */
    const registryVersion = useRegistryVersion(pluginManager)
    const pluginLocales = useMemo(
        () => (pluginManager?.resolveLocales() ?? {}) as Record<string, unknown>,
        [pluginManager, registryVersion],
    )
    const i18nReady = useI18nInitialized()
    useMemo(() => {
        if (!i18nReady) return
        // One `addResourceBundle` per (language, namespace) with the *bundle* — not
        // the whole `{ translation: {...} }` wrapper. Passing the wrapper registered
        // `en.translation.translation.*`, which "worked" only because the merge
        // mutated the very object i18next holds by reference.
        const res = merge({}, resources, pluginLocales) as Record<string, Record<string, unknown>>
        for (const lng of Object.keys(res)) {
            const namespaces = res[lng] ?? {}
            for (const ns of Object.keys(namespaces)) {
                i18n.addResourceBundle(lng, ns, namespaces[ns] as never, true, true)
            }
        }
    }, [pluginLocales, i18nReady, registryVersion])

    // Wire up toast for the request module
    setRequestToast((msg, opts) => toast.error(msg))

    // Wire up session-expired dialog — shows a prompt instead of silently
    // redirecting to /login when the token expires
    setSessionExpiredHandler(showSessionExpiredDialog)
    setEntitlementRequiredHandler(({ message }) => showEntitlementRequiredDialog(message))

    // Listen for plugin events to update routes
    useEffect(() => {
        const handlePluginChange = () => {
            console.log('Received plugin change event, updating router');
            setRefreshFlag(prev => prev + 1);
        };

        // PLUGIN_CHANGED: emitted when user installs/uninstalls/updates/refreshes
        event.on(PLUGIN_CHANGED, handlePluginChange);
        // PLUGIN_INIT_SUCCESS: emitted after Layout initializes plugins from server
        event.on(PLUGIN_INIT_SUCCESS, handlePluginChange);

        return () => {
            event.off(PLUGIN_CHANGED, handlePluginChange);
            event.off(PLUGIN_INIT_SUCCESS, handlePluginChange);
        };
    }, []);

    // Initialize i18n immediately without plugin locales
    useEffect(() => {
        if (!i18n.isInitialized) {
            i18n.use(initReactI18next)
                .use(LanguageDetector)
                .init({
                    detection: {
                        lookupLocalStorage: 'language',
                    },
                    resources: resources,
                    fallbackLng: "en",
                    debug: false,
                    supportedLngs: common.supportedLngs,
                    interpolation: {
                        escapeValue: false,
                    }
                })
        }
    }, [])

    // DON'T create initial router - wait for plugins to load first
    // This prevents route matching failures when refreshing on plugin routes

    // Create/Update router when plugins are loaded
    useEffect(() => {
        console.log('Router useEffect triggered. pluginsReady:', pluginsReady, 'refreshFlag:', refreshFlag);

        if (pluginsReady && pluginManager) {
            const routeConfigs = pluginManager.resolveRoutes()
            const routes = routeConfigs.map(it => reslove(it))
            console.log('Creating router with', routes.length, 'plugin routes')
            const updatedRouter = createBrowserRouter(createRoutesFromElements(
                [
                    <Route
                        path='/'
                        element={
                            <>
                                <EntitlementsProvider><Layout onPluginsReady={setPluginsReady} /></EntitlementsProvider>
                                {/* Host-owned publish UI (pluginMarketplace.openPublisher):
                                    its publish editors mount extension page footers that
                                    call useNavigator, so it must sit inside the router. */}
                                <PluginPublisherHost />
                            </>
                        }
                        errorElement={<ErrorPage />}
                    >
                        {routes}
                        {/* Standalone agent page: the fallback for entry points
                            outside a space, where no side dock is mounted. */}
                        <Route
                            path="/ai-assistant"
                            element={<AIAssistantPage />}
                            handle={createRouteCacheHandle("/ai-assistant")}
                        />
                        <Route
                            path="/plugin-hub"
                            element={<Shop />}
                            handle={createRouteCacheHandle("/plugin-hub")}
                        >
                            <Route path="/plugin-hub" element={<Marketplace />} />
                            <Route path="/plugin-hub/:id" element={<PluginDetail />} />
                        </Route>
                        {/*
                          Everything the router's tree does not know about, resolved
                          live: a plugin activated *after* this router was built (the
                          studio's dev build above all) has routes only the registry
                          knows. Static routes above still win, so this is purely the
                          fallback — see LivePluginRoutes.
                        */}
                        <Route path="*" element={<LivePluginRoutes ready={pluginsReady} />} />
                    </Route>,
                    <Route path='/login' element={<Login />} />,
                    <Route path='/sign-up' element={<SignUpForm />} />,
                    <Route path='/organization-invite/:token' element={<OrganizationInvitationAccept />} />,
                    <Route path='/welcome' element={<Welcome />} />
                ]
            ))
            setRouter(updatedRouter)
        } else {
            // Create minimal router while waiting for plugins
            // The Layout component will show loading screen until plugins are ready
            console.log('Creating minimal router (plugins not ready yet)')
            const minimalRouter = createBrowserRouter(createRoutesFromElements(
                [
                    <Route path='/' element={<EntitlementsProvider><Layout onPluginsReady={setPluginsReady} /></EntitlementsProvider>} errorElement={<ErrorPage />}>
                        <Route path="*" element={<div className="flex items-center justify-center h-screen">Loading...</div>} />
                    </Route>,
                    <Route path='/login' element={<Login />} />,
                    <Route path='/sign-up' element={<SignUpForm />} />,
                    <Route path='/organization-invite/:token' element={<OrganizationInvitationAccept />} />,
                    <Route path='/welcome' element={<Welcome />} />
                ]
            ))
            setRouter(minimalRouter)
        }
    }, [pluginsReady, pluginManager, refreshFlag])

    // The pre-mount boot splash is dismissed by the shell once the plugin
    // workspace is ready. Auth / onboarding routes are rendered outside
    // `Layout`, so nothing else would ever close it — and leaving it up would
    // cover the login form the user is being redirected to.
    useEffect(() => {
        if (!router) return
        const path = window.location.pathname
        const servesWithoutLayout = path === '/login'
            || path === '/sign-up'
            || path === '/welcome'
            || path.startsWith('/organization-invite')
        if (servesWithoutLayout) bootSplashReady()
    }, [router])

    return <AppContext.Provider value={{
        pluginManager: pluginManager,
        serviceRegistry: pluginManager?.serviceRegistry
    }}>
        <ThemeProvider>
            <ResponsiveProvider>
            <Provider store={store}>
                {/* Kernel agent-pane state: surfaces mount <AgentPaneHost /> in
                    their own split layout (side peek, not an overlay). */}
                <AgentPaneProvider>
                {/* Until the router exists the static boot splash (index.html)
                    is still on screen, so there is nothing to render here. */}
                {router ? <RouterProvider router={router} /> : null}
                </AgentPaneProvider>
                <Toaster />
            </Provider>
            </ResponsiveProvider>
        </ThemeProvider>
    </AppContext.Provider>
}

// Install window.__KN__ after App has been initialized so App.tsx does not need
// to import the package root and create an App -> index -> App cycle.
const coreApi = Object.freeze({ ...legacyCoreApi, App })
common.setupGlobalNamespace({
    React,
    ReactDOM,
    // Published so plugin bundles resolve `react/jsx-runtime` to the host's real
    // automatic runtime instead of to `React` (which has no `jsx` export).
    jsxRuntime,
    jsxDevRuntime,
    ui,
    common,
    core: coreApi,
    icon,
    editor,
    hostApiVersion: PLUGIN_API_VERSION,
    // Publish the host's build-time env so plugin UMD bundles can read VITE_*
    // variables at runtime via @kn/common's getAppEnv().
    env: { ...(import.meta as any).env },
    // Published so plugins can resolve `@kn/plugin-api` as a host module.
    pluginApi,
})