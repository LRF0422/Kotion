
import { Outlet } from "react-router-dom"
import { SiderMenu } from "./components/SiderMenu"
import { useContext, useEffect, useState } from "react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger, Badge, Item, ItemContent, ItemDescription, ItemTitle, Rate, SparklesText, cn, useIsMobile, useVirtualKeyboard, Button } from "@kn/ui"
import { TourHost } from "./components/Tour/TourHost"
import { ChevronLeft } from "@kn/icon"
import { MobileTabBar } from "./components/mobile/MobileTabBar"
import { useApi, APIS, useNavigator, useUploadFile, getAccessToken, clearTokens, useDispatch, AppContext, event, GO_TO_MARKETPLACE, PLUGIN_CHANGED, PLUGIN_INIT_SUCCESS, TOGGLE_AI_ASSISTANT, SystemAgentProvider } from "@kn/common"
import { toast } from "@kn/ui"
import React from "react"
import { useAsyncEffect } from "ahooks"
import { MobilePageHeaderProvider, useMobilePageHeader } from "@kn/common"
import {
    AIAssistantPanel,
    useAIAssistantShortcut
} from "./ai/system-agent"

interface LayoutProps {
    onPluginsReady: (ready: boolean) => void
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
    const { pluginManager } = useContext(AppContext)
    const [pluginsLoaded, setPluginsLoaded] = useState(false)
    const [refreshFlag, setRefreshFlag] = useState(0)
    const [aiPanelOpen, setAiPanelOpen] = useState(false)

    // AI Assistant keyboard shortcut
    useAIAssistantShortcut(aiPanelOpen, setAiPanelOpen)

    // Allow other parts of the app (e.g. Home quick actions) to toggle the AI panel
    useEffect(() => {
        const handleToggleAi = () => setAiPanelOpen(prev => !prev)
        event.on(TOGGLE_AI_ASSISTANT, handleToggleAi)
        return () => {
            event.off(TOGGLE_AI_ASSISTANT, handleToggleAi)
        }
    }, [])

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

        console.log('enter layout');

        try {
            const token = getAccessToken()
            console.log('Token check:', token ? 'present' : 'missing')

            if (token) {
                // Reset plugin manager state before reinitializing to ensure clean state on page refresh
                console.log('Loading plugins in Layout, refreshFlag:', refreshFlag)
                const installedPlugins: any[] = (await useApi(APIS.GET_INSTALLED_PLUGINS)).data
                await pluginManager.init(installedPlugins)

                setPluginsLoaded(true)
                onPluginsReady(true)
                // Emit PLUGIN_INIT_SUCCESS to notify other components that plugins are ready.
                // Do NOT emit PLUGIN_CHANGED here – Layout itself listens to that event
                // to trigger reinit, so emitting it would cause an infinite refresh loop.
                event.emit(PLUGIN_INIT_SUCCESS)
            } else {
                // Public share pages are viewable without authentication:
                // initialize with built-in plugins only so their routes resolve.
                if (window.location.pathname.startsWith('/share/')) {
                    console.log('No token, but public share route - loading built-in plugins')
                    await pluginManager.init([])
                    setPluginsLoaded(true)
                    onPluginsReady(true)
                    event.emit(PLUGIN_INIT_SUCCESS)
                    return
                }
                // No auth token, redirect to login preserving the deep link
                // (e.g. invitation links) so the user lands back after login
                console.log('No token found, redirecting to login')
                await pluginManager.init([])
                const backTo = window.location.pathname + window.location.search
                window.location.href = backTo && backTo !== '/'
                    ? '/login?redirect=' + encodeURIComponent(backTo)
                    : '/login'
            }
        } catch (error) {
            console.error('Failed to load plugins:', error)
            // Only redirect to login if not already there
            await pluginManager.init([])
            setPluginsLoaded(true)
            onPluginsReady(true)
            // Don't auto-redirect on plugin load failure - let user stay on current page
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
            console.log('No token for user info, skipping')
            return
        }

        useApi(APIS.GET_USER_INFO).then((res) => {
            dispatch({
                type: 'UPDATE_USER',
                payload: res.data
            })
        }).catch(e => {
            console.error('Failed to get user info:', e)
            // Only redirect if we have a token but it's invalid (401)
            // Don't redirect on network errors
            if (e?.response?.status === 401 || e?.code === 401) {
                clearTokens()
                navigator.go({
                    to: '/login'
                })
            }
        })
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

    return (
        <SystemAgentProvider>
            <MobilePageHeaderProvider>
                <div>
                    {/* Onboarding / feature tours */}
                    <TourHost />

                    {/* AI Assistant Panel */}
                    <AIAssistantPanel
                        open={aiPanelOpen}
                        onOpenChange={setAiPanelOpen}
                        position="bottom-right"
                    />

                    {/* Show loading overlay while plugins are loading */}
                    {!pluginsLoaded && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
                            <div className="flex flex-col items-center gap-4">
                                <SparklesText className="text-[60px]" sparklesCount={8} text="KN" />
                                <div className="flex items-center gap-2 text-lg text-muted-foreground">
                                    <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                                <p className="text-sm text-muted-foreground">Loading workspace...</p>
                            </div>
                        </div>
                    )}

                    <div className={cn(
                        "grid min-h-screen w-full transition-all",
                        isMobile ? "grid-cols-1" : "grid-cols-[70px_1fr]",
                        !pluginsLoaded && "opacity-0"
                    )} >
                        {/* Desktop Sidebar */}
                        {!isMobile && (
                            <div className="border-r">
                                <div className="flex h-full max-h-screen flex-col gap-3 items-center pt-4 electron-sidebar-padding">
                                    {/* Draggable area for window movement */}
                                    <div className="absolute top-0 left-0 right-0 h-10 titlebar-drag-region" />
                                    <SparklesText className="text-[30px]" sparklesCount={5} text="KN" />
                                    <div className="flex-1 px-2">
                                        <SiderMenu />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Mobile Header + Content + bottom Tab Bar */}
                        <div className={cn(
                            "flex flex-col w-full relative",
                            isMobile ? "h-[100dvh]" : "h-screen"
                        )}>
                            {/* Draggable region at the top of main content area */}
                            {!isMobile && <div className="absolute top-0 left-0 right-0 h-10 titlebar-drag-region" />}
                            {/* Mobile top app bar */}
                            {isMobile && <MobileAppBar />}

                            <main className={cn(
                                "w-full overflow-hidden",
                                isMobile ? "flex-1 min-h-0" : "h-screen"
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
        </SystemAgentProvider>
    )
}
