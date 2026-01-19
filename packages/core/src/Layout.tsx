
import { Outlet } from "react-router-dom"
import { SiderMenu } from "./components/SiderMenu"
import { useContext, useEffect, useState } from "react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger, Badge, Item, ItemContent, ItemDescription, ItemTitle, Onboarding, OnboardingStep, Rate, SparklesText, cn, useIsMobile, Sheet, SheetContent, SheetTrigger, Button } from "@kn/ui"
import { Menu } from "@kn/icon"
import { useApi } from "./hooks/use-api"
import { APIS } from "./api"
import { useDispatch, AppContext, event } from "@kn/common"
import { useNavigator } from "./hooks/use-navigator"
import { GO_TO_MARKETPLACE } from "@kn/common"
import { toast } from "@kn/ui"
import React from "react"
import { useUploadFile } from "./hooks"
import { useAsyncEffect } from "ahooks"

interface LayoutProps {
    onPluginsReady: (ready: boolean) => void
}

export function Layout({ onPluginsReady }: LayoutProps) {

    const dispatch = useDispatch()
    const navigator = useNavigator()
    const { pluginManager } = useContext(AppContext)
    const [pluginsLoaded, setPluginsLoaded] = useState(false)
    const [refreshFlag, setRefreshFlag] = useState(0)

    const searchParams = new URLSearchParams(window.location.search);
    const requestPluginId = searchParams.get('requestPluginId');
    const [open, setOpen] = useState(false)
    const [requestPlugin, setRequestPlugin] = useState<any>()
    const { usePath } = useUploadFile()
    const [showOnboarding, setShowOnboarding] = useState(false);

    useEffect(() => {
        const flag = localStorage.getItem("showOnboarding");
        if (!flag) {
            setShowOnboarding(true);
        }
    }, [])

    const onboardingSteps: OnboardingStep[] = [
        {
            id: 'welcome',
            targetSelector: '#welcome-title',
            title: '欢迎使用',
            description: '这是我们的新功能，让我们快速了解一下如何使用吧！',
            actionText: '开始探索',
            position: 'right'
        },
        {
            id: 'message',
            targetSelector: '#message-box',
            title: '信箱',
            description: '这是我们的新功能，让我们快速了解一下如何使用吧！',
            actionText: '开始探索',
            position: 'right'
        }
    ];

    // Plugin loading logic moved from App.tsx
    useEffect(() => {
        event.on("REFRESH_PLUSINS", () => {
            setRefreshFlag(f => f + 1)
        })
        return () => {
            event.off("REFRESH_PLUSINS")
        }
    }, [])

    // Load plugins asynchronously in Layout
    useAsyncEffect(async () => {
        if (!pluginManager) return

        try {
            if (!!localStorage.getItem("knowledge-token")) {
                // Reset plugin manager state before reinitializing to ensure clean state on page refresh
                console.log('Loading plugins in Layout, refreshFlag:', refreshFlag)
                const installedPlugins: any[] = (await useApi(APIS.GET_INSTALLED_PLUGINS)).data
                await pluginManager.init(installedPlugins)

                setPluginsLoaded(true)
                onPluginsReady(true)
                // Emit event to notify other components that plugins are ready
                event.emit("PLUGIN_INIT_SUCCESS")
                // Don't emit REFRESH_PLUSINS here to avoid infinite loop
            } else {
                // No auth token, redirect to login
                await pluginManager.init([])
                if (!window.location.href.includes("login")) {
                    window.location.href = '/login'
                }
            }
        } catch (error) {
            console.error('Failed to load plugins:', error)
            await pluginManager.init([])
            if (!window.location.href.includes("login")) {
                window.location.href = '/login'
            }
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
        useApi(APIS.GET_USER_INFO).then((res) => {
            dispatch({
                type: 'UPDATE_USER',
                payload: res.data
            })
        }).catch(e => {
            navigator.go({
                to: '/login'
            })
        })
    }, [])

    const install = (versionId: string) => {
        useApi(APIS.INSTALL_PLUGIN, {
            versionId
        }).then(res => {
            toast.success('安装成功')
            event.emit("REFRESH_PLUSINS")
            setOpen(false)
        })
    }


    const isMobile = useIsMobile()
    const [sidebarOpen, setSidebarOpen] = useState(false)

    return (
        <div>
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
                        <div className="flex h-full max-h-screen flex-col gap-3 items-center pt-4">
                            <SparklesText className="text-[30px]" sparklesCount={5} text="KN" />
                            <div className="flex-1 px-2">
                                <SiderMenu />
                            </div>
                        </div>
                    </div>
                )}

                {/* Mobile Header + Content */}
                <div className="flex flex-col h-screen w-full">
                    {/* Mobile Header */}
                    {isMobile && (
                        <div className="flex items-center justify-between px-4 h-14 border-b bg-background sticky top-0 z-40">
                            <SparklesText className="text-[24px]" sparklesCount={3} text="KN" />
                            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                                <SheetTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                        <Menu className="h-5 w-5" />
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="left" className="w-[280px] p-0">
                                    <div className="flex flex-col h-full">
                                        <div className="flex items-center justify-center py-4 border-b">
                                            <SparklesText className="text-[30px]" sparklesCount={5} text="KN" />
                                        </div>
                                        <div className="flex-1 overflow-auto px-2 py-2">
                                            <SiderMenu onItemClick={() => setSidebarOpen(false)} />
                                        </div>
                                    </div>
                                </SheetContent>
                            </Sheet>
                        </div>
                    )}

                    <main className={cn(
                        "w-full overflow-hidden",
                        isMobile ? "flex-1" : "h-screen"
                    )}>
                        {pluginsLoaded ? <Outlet /> : null}
                    </main>
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
            <Onboarding
                steps={onboardingSteps}
                isOpen={showOnboarding}
                onClose={() => setShowOnboarding(false)}
                onComplete={() => {
                    localStorage.setItem("showOnboarding", "false");
                }}
            />
        </div>
    )
}
