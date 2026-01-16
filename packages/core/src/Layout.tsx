
import { Outlet, useLocation } from "react-router-dom"
import { SiderMenu } from "./components/SiderMenu"
import { useContext, useEffect, useState, useMemo } from "react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger, Badge, Item, ItemContent, ItemDescription, ItemTitle, Onboarding, OnboardingStep, Rate, SparklesText, cn } from "@kn/ui"
import { useApi } from "./hooks/use-api"
import { APIS } from "./api"
import { useDispatch, AppContext, event } from "@kn/common"
import { useNavigator } from "./hooks/use-navigator"
import { ErrorBoundary } from "react-error-boundary"
import { GO_TO_MARKETPLACE } from "@kn/common"
import { toast } from "@kn/ui"
import { ErrorPage } from "./components/ErrorPage"
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

            <div className={cn("grid min-h-screen w-full transition-all grid-cols-[70px_1fr]", !pluginsLoaded && "opacity-0")} >
                <div className="border-r md:block">
                    <div className="flex h-full max-h-screen flex-col gap-3 items-center pt-4">
                        <SparklesText className=" text-[30px]" sparklesCount={5} text="KN" />
                        <div className="flex-1 px-2">
                            <SiderMenu />
                        </div>
                    </div>
                </div>
                <main className="h-screen w-full overflow-auto">
                    {pluginsLoaded ? <Outlet /> : null}
                </main>
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
