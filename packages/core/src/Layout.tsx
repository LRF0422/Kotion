
import { SiderMenu } from "./components/SiderMenu"
import { useContext, useEffect, useState } from "react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger, Badge, Item, ItemContent, ItemDescription, ItemTitle, Rate, SparklesText, cn, useIsMobile, useVirtualKeyboard, Button } from "@kn/ui"
import { TourHost } from "./components/Tour/TourHost"
import { ChevronLeft } from "@kn/icon"
import { MobileTabBar } from "./components/mobile/MobileTabBar"
import { useApi, APIS, useAsyncEffect, useLocation, Outlet, useNavigator, useUploadFile, getAccessToken, getRefreshToken, getTokenContextState, clearContextSensitiveClientState, clearTokens, normalizeTokenResponse, notifyContextChanged, saveTokens, useDispatch, AppContext, event, GO_TO_MARKETPLACE, PLUGIN_CHANGED, PLUGIN_INIT_SUCCESS, TOGGLE_AI_ASSISTANT, TOGGLE_DOCK_PANEL, dockRuntime, logger } from "@kn/common"
import { toast } from "@kn/ui"
import React from "react"
import { MobilePageHeaderProvider, useMobilePageHeader } from "@kn/common"
import { OffscreenEditorHost } from "./ai/offscreen"
import { toRemotePluginDescriptor, type PluginRecord } from "./components/Shop/plugin-model"

interface LayoutProps {
    onPluginsReady: (ready: boolean) => void
}

const normalizeInstalledPlugins = (value: unknown) => {
    if (!Array.isArray(value)) {
        logger.warn('Installed plugin response is not an array')
        return {
            plugins: [],
            invalidPlugins: ['installed-plugin-response'],
        }
    }

    const plugins: NonNullable<ReturnType<typeof toRemotePluginDescriptor>>[] = []
    const invalidPlugins: string[] = []
    value.forEach((entry: unknown) => {
        const record = entry && typeof entry === 'object'
            ? entry as PluginRecord
            : null
        const plugin = toRemotePluginDescriptor(record)
        if (plugin) {
            plugins.push(plugin)
            return
        }

        const name = record?.name || record?.pluginKey || 'unknown'
        invalidPlugins.push(name)
        logger.warn('Skipping installed plugin with incomplete runtime metadata', {
            name: record?.name,
            pluginKey: record?.pluginKey,
            currentVersionId: record?.currentVersionId,
        })
    })

    return { plugins, invalidPlugins }
}

// Mobile top app bar. Navigation lives in the bottom MobileTabBar; this bar is
// purely contextual — back button + page title/icon + page-contributed actions
// (e.g. a space's page-tree trigger), all driven by MobilePageHeaderContext.
const MobileAppBar: React.FC = () => {
    const { headerInfo } = useMobilePageHeader();

    const handleBack = () => {
        window.history.back();
    };

    return (
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur pt-safe">
            <div className="flex items-center justify-between gap-2 px-2 h-14">
                {/* Left side - back button + title, or brand on top-level pages */}
                <div className="flex items-center gap-1 flex-1 min-w-0">
                    {headerInfo ? (
                        <>
                            <Button variant="ghost" size="icon" onClick={handleBack} className="flex-shrink-0">
                                <ChevronLeft className="h-5 w-5" />
                            </Button>
                            <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                                {headerInfo.icon && <span className="text-lg flex-shrink-0">{headerInfo.icon}</span>}
                                <span className="text-sm font-medium truncate">{headerInfo.title}</span>
                            </div>
                        </>
                    ) : (
                        <div className="px-2">
                            <SparklesText className="text-[24px]" sparklesCount={3} text="KN" />
                        </div>
                    )}
                </div>

                {/* Right side - page-contributed actions (e.g. page-tree drawer trigger) */}
                <div className="flex items-center gap-1 flex-shrink-0">
                    {headerInfo?.actions}
                </div>
            </div>
        </header>
    );
};

export function Layout({ onPluginsReady }: LayoutProps) {

    const dispatch = useDispatch()
    const navigator = useNavigator()
    const location = useLocation()
    const isWorkspaceRoute = location.pathname.startsWith('/space-detail/')
    const { pluginManager } = useContext(AppContext)
    const [pluginsLoaded, setPluginsLoaded] = useState(false)
    const [pluginLoadError, setPluginLoadError] = useState<unknown>(null)
    const [refreshFlag, setRefreshFlag] = useState(0)
    const webBootMode = (window as any).__KN_WEB_BOOT_MODE__ as 'development' | 'share' | 'main' | undefined

    // App's initial plugin set is immutable. Crossing the share boundary must
    // bootstrap again so the correct bundled/remote plugin policy is selected.
    useEffect(() => {
        if (!webBootMode || webBootMode === 'development') return
        const isShareRoute = location.pathname.startsWith('/share/')
        if (isShareRoute === (webBootMode === 'share')) return
        logger.info('Reloading application after crossing public share boundary')
        window.location.assign(`${location.pathname}${location.search}${location.hash}`)
    }, [location.hash, location.pathname, location.search, webBootMode])

    // The agent now lives in the workspace side dock. Entry points outside the
    // workspace (sidebar menu, mobile tab bar, Home quick actions) still emit
    // TOGGLE_AI_ASSISTANT; forward it to the dock when one is mounted, and fall
    // back to the standalone page when there isn't (e.g. on /home).
    const openAgent = React.useCallback(() => {
        const hasAgentPanel = pluginManager
            ?.resolveDockPanels('right')
            .some(panel => panel.id === 'agent') ?? false

        if (dockRuntime.isMounted('right') && hasAgentPanel) {
            event.emit(TOGGLE_DOCK_PANEL, { id: 'agent' })
        } else {
            navigator.go({ to: '/ai-assistant' })
        }
    }, [navigator, pluginManager])

    useEffect(() => {
        event.on(TOGGLE_AI_ASSISTANT, openAgent)
        return () => { event.off(TOGGLE_AI_ASSISTANT, openAgent) }
    }, [openAgent])

    // Ctrl+Shift+A opens the agent. (Ctrl+K is already the space-level global
    // search, so the old Ctrl+K binding is gone.)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
                e.preventDefault()
                openAgent()
            }
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [openAgent])

    const searchParams = new URLSearchParams(window.location.search);
    const requestPluginId = searchParams.get('requestPluginId');
    const [open, setOpen] = useState(false)
    const [requestPlugin, setRequestPlugin] = useState<any>()
    const { usePath } = useUploadFile()

    // Plugin loading logic: listen for PLUGIN_CHANGED to trigger reinit
    useEffect(() => {
        const handlePluginChange = () => {
            setRefreshFlag(f => f + 1)
        }
        event.on(PLUGIN_CHANGED, handlePluginChange)
        return () => {
            event.off(PLUGIN_CHANGED, handlePluginChange)
        }
    }, [])

    // Load plugins asynchronously in Layout
    useAsyncEffect(async () => {
        if (!pluginManager) return

        // Skip plugin loading on login page
        if (window.location.pathname === '/login' || window.location.pathname === '/sign-up') {
            return
        }

        setPluginLoadError(null)
        console.log('enter layout');

        try {
            const token = getAccessToken()

            // Public shares always have the bundled compatibility set. Authenticated
            // viewers may additionally load remote-only plugins; duplicates are filtered.
            if (window.location.pathname.startsWith('/share/')) {
                let installedPlugins: unknown = []
                if (token) {
                    try {
                        installedPlugins = (await useApi(APIS.GET_INSTALLED_PLUGINS)).data
                    } catch (error) {
                        logger.warn('Failed to load viewer plugins for public share; using compatibility plugins only', error)
                    }
                }
                const { plugins: runtimePlugins, invalidPlugins } = normalizeInstalledPlugins(installedPlugins)
                const { failedPlugins, incompatiblePlugins } = await pluginManager.init(runtimePlugins)
                const allFailedPlugins = [...invalidPlugins, ...failedPlugins]
                if (allFailedPlugins.length > 0) {
                    logger.warn('Some viewer plugins failed on public share:', allFailedPlugins)
                }
                if (incompatiblePlugins.length > 0) {
                    logger.warn('Some viewer plugins were skipped on public share because their API versions are incompatible:', incompatiblePlugins)
                }
                setPluginsLoaded(true)
                onPluginsReady(true)
                event.emit(PLUGIN_INIT_SUCCESS)
                return
            }

            console.log('Token check:', token ? 'present' : 'missing')
            if (token) {
                console.log('Loading plugins in Layout, refreshFlag:', refreshFlag)
                const installedPlugins = (await useApi(APIS.GET_INSTALLED_PLUGINS)).data
                const { plugins: runtimePlugins, invalidPlugins } = normalizeInstalledPlugins(installedPlugins)
                const { failedPlugins, incompatiblePlugins } = await pluginManager.init(runtimePlugins)
                if (incompatiblePlugins.length > 0) {
                    logger.warn('Some installed plugins were skipped because their API versions are incompatible:', incompatiblePlugins)
                }
                const allFailedPlugins = [...invalidPlugins, ...failedPlugins]
                if (allFailedPlugins.length > 0) {
                    throw new Error(`Failed to load required plugins: ${allFailedPlugins.join(', ')}`)
                }

                setPluginsLoaded(true)
                onPluginsReady(true)
                event.emit(PLUGIN_INIT_SUCCESS)
            } else {
                console.log('No token found, redirecting to login')
                await pluginManager.init([])
                const backTo = window.location.pathname + window.location.search
                window.location.href = backTo && backTo !== '/'
                    ? '/login?redirect=' + encodeURIComponent(backTo)
                    : '/login'
            }
        } catch (error) {
            logger.error('Failed to load plugins:', error)

            if (getAccessToken() && !window.location.pathname.startsWith('/share/')) {
                // Never mount an editable document with an incomplete schema after
                // the installed-plugin request fails. Require an explicit retry.
                setPluginLoadError(error)
                return
            }

            await pluginManager.init([])
            setPluginsLoaded(true)
            onPluginsReady(true)
        }
    }, [pluginManager, refreshFlag])

    useEffect(() => {
        event.on(GO_TO_MARKETPLACE, () => {
            navigator.go({
                to: '/plugin-hub'
            })
        })
        return () => {
            event.off(GO_TO_MARKETPLACE)
        }
    }, [])

    useEffect(() => {
        if (requestPluginId) {
            useApi(APIS.GET_PLUGIN, { id: requestPluginId }).then(res => {
                setRequestPlugin(res.data)
            })
            setOpen(true)
        }
    }, [requestPluginId])

    useEffect(() => {
        // Skip user info fetch on login/signup pages
        if (window.location.pathname === '/login' || window.location.pathname === '/sign-up') {
            return
        }

        const token = getAccessToken()
        if (!token) {
            logger.info('No token for user info, skipping')
            return
        }

        const tokenContext = getTokenContextState(token)
        const handleIdentityError = (e: any) => {
            logger.error('Failed to load current account context', e)
            if (e?.response?.status === 401 || e?.code === 401) {
                clearTokens()
                navigator.go({ to: '/login' })
            }
        }
        useApi(APIS.GET_ME).then(meRes => {
            dispatch({ type: 'UPDATE_USER', payload: meRes.data })
        }).catch(handleIdentityError)
        useApi(APIS.GET_CONTEXTS).then(async contextsRes => {
            const contexts = contextsRes.data ?? []
            const tokenContextMatch = contexts.find(context => context.id === tokenContext.contextId)
            if (tokenContext.contextId && !tokenContextMatch && contexts[0]) {
                try {
                    const switched = await useApi(APIS.SWITCH_CONTEXT, { contextId: contexts[0].id }, {
                        refreshToken: getRefreshToken() || ''
                    })
                    const tokens = normalizeTokenResponse(switched.data)
                    if (!tokens.accessToken || !tokens.refreshToken) throw new Error('Missing fallback context tokens')
                    saveTokens(tokens.accessToken, tokens.refreshToken)
                    clearContextSensitiveClientState()
                    notifyContextChanged(contexts[0].id)
                    window.location.assign('/')
                } catch (error) {
                    logger.error('Unable to recover an unavailable authorization context', error)
                    clearTokens()
                    navigator.go({ to: '/login' })
                }
                return
            }
            const currentContext = tokenContextMatch
                ?? contexts.find(context => context.type === tokenContext.contextType)
                ?? contexts[0]
            dispatch({ type: 'UPDATE_CONTEXTS', payload: { availableContexts: contexts, currentContextId: currentContext?.id } })
        }).catch(handleIdentityError)
    }, [])

    const install = (versionId: string) => {
        useApi(APIS.INSTALL_PLUGIN, {
            versionId
        }).then(res => {
            toast.success('安装成功')
            // Invalidate plugin cache and trigger reinit to load the new plugin into runtime
            pluginManager?.clearPluginCache()
            event.emit(PLUGIN_CHANGED, { source: 'install' })
            setOpen(false)
        })
    }


    const isMobile = useIsMobile()
    // Hide the bottom tab bar while the soft keyboard is open so it doesn't
    // collide with the editor's keyboard-docked toolbar.
    const { isOpen: keyboardOpen } = useVirtualKeyboard()
    // Frameless-window drag regions only work in the Electron shell (their CSS
    // lives in the desktop app); in the browser they'd be invisible click blockers.
    const isDesktopShell = typeof window !== 'undefined' && typeof (window as any).api !== 'undefined'

    return (
        <MobilePageHeaderProvider>
            <div>
                    {/* Onboarding / feature tours */}
                    <TourHost />

                    {/* Hidden collaborative editors for off-screen page editing (Chat @-page) */}
                    <OffscreenEditorHost />

                    {/* Show loading overlay while plugins are loading */}
                    {(!pluginsLoaded || Boolean(pluginLoadError)) && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
                            {pluginLoadError ? (
                                <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center">
                                    <SparklesText className="text-[48px]" sparklesCount={6} text="KN" />
                                    <p className="text-sm text-muted-foreground">
                                        Failed to load the installed plugins. Retry before opening the workspace to avoid editing with an incomplete document schema.
                                    </p>
                                    <Button onClick={() => setRefreshFlag(flag => flag + 1)}>Retry</Button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-4">
                                    <SparklesText className="text-[60px]" sparklesCount={8} text="KN" />
                                    <div className="flex items-center gap-2 text-lg text-muted-foreground">
                                        <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                    <p className="text-sm text-muted-foreground">Loading workspace...</p>
                                </div>
                            )}
                        </div>
                    )}

                    <div className={cn(
                        "grid w-full transition-opacity",
                        isMobile
                            ? "min-h-screen grid-cols-1"
                            : "kn-app-shell relative h-screen min-h-0 grid-cols-[var(--kn-global-rail-width)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden [--kn-global-rail-width:48px] [--kn-app-shell-padding:0px] [--kn-workspace-gap:0px] [--kn-workspace-radius:0px] md:[--kn-app-shell-padding:6px] md:[--kn-workspace-gap:4px] md:[--kn-workspace-radius:10px] lg:[--kn-app-shell-padding:8px] lg:[--kn-workspace-gap:6px] lg:[--kn-workspace-radius:12px]",
                        !pluginsLoaded && "opacity-0"
                    )} >
                        {!isMobile && isDesktopShell && (
                            <div className="kn-shell-top-drag-region titlebar-drag-region absolute inset-x-0 top-0 z-50" />
                        )}
                        {/* Desktop Sidebar: SiYuan-style compact icon rail */}
                        {!isMobile && (
                            <div className="kn-app-rail min-h-0 overflow-hidden border-r bg-muted/40">
                                <div className="flex h-full min-h-0 flex-col items-center pt-3 electron-sidebar-padding">
                                    {/* Draggable area for window movement (Electron only) */}
                                    {isDesktopShell && <div className="absolute top-0 left-0 right-0 h-10 titlebar-drag-region" />}
                                    <div className="flex-1 w-full px-1">
                                        <SiderMenu />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Mobile Header + Content + bottom Tab Bar */}
                        <div className={cn(
                            "relative flex w-full min-w-0 flex-col",
                            isMobile ? "h-[100dvh]" : "h-full min-h-0"
                        )}>
                            {/* Draggable region at the top of main content area (Electron only) */}
                            {!isMobile && isDesktopShell && <div className="absolute top-0 left-0 right-0 h-10 titlebar-drag-region" />}
                            {/* Mobile top app bar */}
                            {isMobile && <MobileAppBar />}

                            <main className={cn(
                                "w-full overflow-hidden",
                                isMobile ? "flex-1 min-h-0" : "h-full min-h-0",
                                !isMobile && !isWorkspaceRoute && "kn-route-pane"
                            )}>
                                {pluginsLoaded ? <Outlet /> : null}
                            </main>

                            {/* Mobile bottom navigation (hidden while typing) */}
                            {isMobile && !keyboardOpen && <MobileTabBar />}
                        </div>
                        <AlertDialog open={open} onOpenChange={setOpen}>
                            <AlertDialogTrigger />
                            <AlertDialogContent>
                                <AlertDialogTitle>Sure to install ?</AlertDialogTitle>
                                <AlertDialogDescription className=" hidden" />
                                {requestPlugin &&
                                    <Item variant="muted" className=" hover:shadow-sm transition-shadow duration-300">
                                        <ItemContent>
                                            <ItemTitle className="flex gap-2">
                                                <img src={usePath(requestPlugin.icon)} className="w-10 h-10" />
                                                <div>
                                                    <div>
                                                        {requestPlugin.name}
                                                        <Badge className=" ml-2">{requestPlugin.category.value}</Badge>
                                                    </div>

                                                    <div className="text-xs italic text-gray-400">
                                                        {requestPlugin.developer} / {requestPlugin.maintainer}
                                                    </div>
                                                    <Rate rating={requestPlugin.rating} disabled variant="yellow" />
                                                </div>
                                            </ItemTitle>
                                            <ItemDescription>{requestPlugin.description}</ItemDescription>
                                        </ItemContent>
                                    </Item>
                                }
                                <AlertDialogFooter>
                                    <AlertDialogAction onClick={() => {
                                        install(requestPlugin.currentVersion.id)
                                    }}>Confirm</AlertDialogAction>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>
        </MobilePageHeaderProvider>
    )
}
