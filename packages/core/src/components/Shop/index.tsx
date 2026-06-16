import { AlertCircle, BoxSelect, CheckCircle2, Package, PanelLeftClose, PanelLeftOpen, PlusSquare, RefreshCcw, Slack, Trash2 } from "@kn/icon";
import {
    Accordion, AccordionContent,
    AccordionItem, AccordionTrigger,
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
    Avatar,
    Badge, Button, EmptyState, Input,
    Sheet, SheetContent, SheetTitle,
    Tooltip,
    TooltipContent, TooltipProvider, TooltipTrigger,
    useResponsive, cn
} from "@kn/ui";
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigator } from "@kn/common";
import { Outlet } from "react-router-dom";
import { PluginUploader } from "./PluginUploader";
import { PluginManager } from "./PluginManager";
import { useApi, useUploadFile } from "@kn/common";
import { APIS } from "@kn/common";
import { useSafeState } from "ahooks";
import { AppContext, PLUGIN_CHANGED, event, usePluginState } from "@kn/common";


const Item: React.FC<{ item: any, handleUnInstall: (item: any) => void, handleUpdate: (id: string) => void, isLoaded?: boolean }> = ({ item, handleUnInstall, handleUpdate, isLoaded }) => {
    const navigator = useNavigator()
    const { usePath } = useUploadFile()

    return (
        <div
            className="group flex items-center gap-3 rounded-lg p-2.5 border bg-card hover:bg-accent/50 hover:border-primary/30 transition-colors cursor-pointer"
            onClick={() => navigator.go({ to: `/plugin-hub/${item.subjectId}` })}
        >
            {/* Plugin Icon + runtime status */}
            <div className="shrink-0 relative">
                <Avatar className="h-11 w-11 rounded-lg border border-border/50">
                    <img src={usePath(item.icon)} alt={item.name} className="object-cover" />
                </Avatar>
                <div className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-background",
                    isLoaded ? "bg-green-500" : "bg-yellow-500"
                )} title={isLoaded ? "Loaded" : "Not loaded"} />
            </div>

            {/* Plugin Info */}
            <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                        {item.name}
                    </h4>
                    {isLoaded ? (
                        <span className="shrink-0 inline-flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Active
                        </span>
                    ) : (
                        <span className="shrink-0 inline-flex items-center gap-1 text-[10px] text-yellow-600 dark:text-yellow-400">
                            <AlertCircle className="h-3 w-3" />
                            Inactive
                        </span>
                    )}
                </div>

                <p className="text-xs text-muted-foreground line-clamp-1">
                    {item.description}
                </p>

                {/* Action Buttons */}
                <div className="flex gap-1.5 pt-0.5">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 px-2.5 text-xs gap-1.5 hover:bg-destructive/10 hover:text-destructive transition-colors"
                        onClick={(e) => {
                            e.stopPropagation()
                            handleUnInstall(item)
                        }}
                    >
                        <Trash2 className="h-3 w-3" />
                        Uninstall
                    </Button>
                    {item.activeVersionId !== item.id && (
                        <Badge
                            variant="outline"
                            className="h-8 px-2.5 text-xs cursor-pointer hover:bg-primary/10 hover:text-primary hover:border-primary/50 transition-colors"
                            onClick={(e) => {
                                e.stopPropagation()
                                handleUpdate(item.id)
                            }}
                        >
                            Update
                        </Badge>
                    )}
                </div>
            </div>
        </div>
    )
}

export const Shop: React.FC = () => {

    const { isMobile, isTablet } = useResponsive()
    const [installedPlugins, setInstalledPlugins] = useSafeState<any[]>([])
    const navigator = useNavigator()
    const [open, setOpen] = useState(false)
    const [refreshing, setRefreshing] = useState(false)
    const [installedKeyword, setInstalledKeyword] = useState("")
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const { pluginManager } = useContext(AppContext)
    const [currentPlugin, setCurrentPlugin] = useState<any | undefined>()

    // Tablet: the installed sidebar is collapsible. Persisted across reloads.
    const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(
        () => typeof window !== "undefined" && localStorage.getItem("kn:plugin-sidebar-collapsed") === "1"
    )
    const toggleSidebarCollapsed = useCallback(() => {
        setSidebarCollapsed(v => {
            const next = !v
            try { localStorage.setItem("kn:plugin-sidebar-collapsed", next ? "1" : "0") } catch { }
            return next
        })
    }, [])

    // Runtime state for runtime "loaded" indicators
    const { loadedPluginNames, pluginVersion } = usePluginState()

    const loadInstalled = useCallback(() => {
        return useApi(APIS.GET_INSTALLED_PLUGINS).then(res => {
            setInstalledPlugins(res.data ?? [])
        })
    }, [setInstalledPlugins])

    useEffect(() => {
        loadInstalled()
    }, [pluginVersion, loadInstalled])

    useEffect(() => {
        const handlePluginChange = () => { loadInstalled() }
        event.on(PLUGIN_CHANGED, handlePluginChange)
        return () => { event.off(PLUGIN_CHANGED, handlePluginChange) }
    }, [loadInstalled])

    const filteredInstalled = useMemo(() => {
        const q = installedKeyword.trim().toLowerCase()
        if (!q) return installedPlugins
        return installedPlugins.filter((p: any) =>
            [p.name, p.description].filter(Boolean).some(s => String(s).toLowerCase().includes(q)))
    }, [installedPlugins, installedKeyword])

    const goToMarketplace = () => navigator.go({ to: '/plugin-hub' })

    const uninstall = (plugin: any) => {
        setOpen(true)
        setCurrentPlugin(plugin)
    }

    const handleUpdate = (id: string) => {
        useApi(APIS.UPDATE_PLUGIN, { versionId: id }).then(() => {
            // Clear plugin script cache before refreshing to ensure new version loads
            pluginManager?.clearPluginCache()
            event.emit(PLUGIN_CHANGED, { source: 'update' })
        })
    }

    const handleRefresh = () => {
        // Clear plugin script cache before refreshing to get latest state
        pluginManager?.clearPluginCache()
        setRefreshing(true)
        loadInstalled().finally(() => setRefreshing(false))
        event.emit(PLUGIN_CHANGED, { source: 'refresh' })
    }

    const collapsedOnTablet = isTablet && sidebarCollapsed
    const gridCols = isTablet
        ? (sidebarCollapsed ? "grid-cols-[48px_1fr]" : "grid-cols-[300px_1fr]")
        : "grid-cols-[320px_1fr]"

    const sidebarContent = (
        <div className="flex flex-col h-full min-h-0 bg-muted/30">
            {/* Header */}
            <div className="shrink-0 border-b bg-background">
                <div className="flex items-center justify-between p-3 sm:p-4">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="p-2 rounded-lg bg-muted">
                            <Package className="h-4 w-4 text-foreground" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-sm font-semibold truncate">Extensions</h2>
                            <p className="text-xs text-muted-foreground">
                                {installedPlugins.length} installed
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-1 items-center shrink-0">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8" onClick={handleRefresh}>
                                        <RefreshCcw className={cn("h-4 w-4", refreshing && "animate-spin")} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Refresh</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <PluginUploader>
                                        <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8">
                                            <PlusSquare className="h-4 w-4" />
                                        </Button>
                                    </PluginUploader>
                                </TooltipTrigger>
                                <TooltipContent>Upload Plugin</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <PluginManager>
                                        <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8">
                                            <Slack className="h-4 w-4" />
                                        </Button>
                                    </PluginManager>
                                </TooltipTrigger>
                                <TooltipContent>Manage Plugins</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </div>

                {/* Search */}
                <div className="px-3 sm:px-4 pb-3 sm:pb-4">
                    <Input
                        className="h-9 bg-background text-sm"
                        placeholder="Search extensions..."
                        value={installedKeyword}
                        onChange={e => setInstalledKeyword(e.target.value)}
                    />
                </div>
            </div>

            {/* List */}
            <div className="flex-1 min-h-0 overflow-auto px-2 sm:px-3 py-2">
                <Accordion type="multiple" defaultValue={["installed"]}>
                    <AccordionItem value="installed" className="border-none">
                        <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground py-2 px-2 hover:no-underline">
                            <div className="flex items-center gap-2">
                                <span>Installed</span>
                                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                                    {filteredInstalled.length}
                                </Badge>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2">
                            <div className="space-y-1.5">
                                {filteredInstalled.length > 0 ? (
                                    filteredInstalled.map((plugin: any, index: number) => (
                                        <Item
                                            key={index}
                                            item={plugin}
                                            handleUnInstall={uninstall}
                                            handleUpdate={handleUpdate}
                                            isLoaded={loadedPluginNames.has(plugin.name)}
                                        />
                                    ))
                                ) : installedKeyword ? (
                                    <p className="py-8 text-center text-xs text-muted-foreground">
                                        No extensions match "{installedKeyword}"
                                    </p>
                                ) : (
                                    <div className="py-8">
                                        <EmptyState
                                            title="No Plugins Installed"
                                            description="Browse the marketplace to discover and install plugins"
                                            className="border-dashed bg-background/50"
                                            action={{ label: "Browse Marketplace", onClick: goToMarketplace }}
                                            icons={[Package, BoxSelect, Slack]}
                                        />
                                    </div>
                                )}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </div>
        </div>
    )

    return (
        <div className={cn(
            "w-full bg-background",
            isMobile ? "h-screen flex flex-col" : cn("h-screen grid", gridCols)
        )}>
            {/* Mobile: installed sidebar lives in a drawer */}
            {isMobile && (
                <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                    <SheetContent side="left" className="w-[300px] p-0">
                        <SheetTitle className="sr-only">Installed extensions</SheetTitle>
                        <div className="h-full pt-safe">
                            {sidebarContent}
                        </div>
                    </SheetContent>
                </Sheet>
            )}

            {/* Tablet / desktop sidebar (tablet is collapsible) */}
            {!isMobile && (
                <div className="h-screen w-full border-r flex flex-col overflow-hidden">
                    {isTablet && (
                        <div className="flex items-center justify-end px-1 py-1 border-b shrink-0 bg-background">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={toggleSidebarCollapsed}
                                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                            >
                                {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                            </Button>
                        </div>
                    )}
                    {!collapsedOnTablet && sidebarContent}
                </div>
            )}

            {/* Main content */}
            <div className={cn("relative w-full overflow-auto", isMobile ? "flex-1 min-h-0" : "h-screen")}>
                {/* Mobile trigger to open the installed drawer */}
                {isMobile && (
                    <Button
                        size="sm"
                        variant="secondary"
                        className="fixed bottom-4 right-4 z-20 h-11 rounded-full shadow-lg gap-1.5 mb-safe-bottom"
                        onClick={() => setSidebarOpen(true)}
                    >
                        <Package className="h-4 w-4" />
                        Installed
                        <Badge variant="default" className="h-5 px-1.5 text-xs">{installedPlugins.length}</Badge>
                    </Button>
                )}
                <Outlet />
            </div>

            {/* Uninstall confirmation */}
            <AlertDialog open={open} onOpenChange={setOpen}>
                <AlertDialogTrigger />
                <AlertDialogContent className="max-w-[90vw] sm:max-w-md mx-4">
                    <AlertDialogHeader>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 sm:p-3 rounded-full bg-destructive/10">
                                <Trash2 className="h-5 w-5 sm:h-6 sm:w-6 text-destructive" />
                            </div>
                            <div className="flex-1">
                                <AlertDialogTitle className="text-base sm:text-lg">Uninstall Plugin</AlertDialogTitle>
                                <AlertDialogDescription className="text-xs sm:text-sm text-muted-foreground mt-1">
                                    This action cannot be undone
                                </AlertDialogDescription>
                            </div>
                        </div>
                    </AlertDialogHeader>
                    <div className="py-3 sm:py-4">
                        <div className="rounded-lg border bg-muted/30 p-3 sm:p-4">
                            <p className="text-xs sm:text-sm">
                                Are you sure you want to permanently remove <span className="font-semibold text-foreground">{currentPlugin?.name}</span>?
                                All plugin data and configurations will be deleted.
                            </p>
                        </div>
                    </div>
                    <AlertDialogFooter className="gap-2 flex-col sm:flex-row">
                        <AlertDialogCancel
                            className="mt-0 w-full sm:w-auto"
                            onClick={() => {
                                setCurrentPlugin(undefined)
                                setOpen(false)
                            }}
                        >
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground w-full sm:w-auto"
                            onClick={() => {
                                if (currentPlugin) {
                                    useApi(APIS.UNINSTALL_PLUGIN, { versionId: currentPlugin.id }).then(() => {
                                        // Uninstall from runtime PluginManager (this also invalidates the script cache)
                                        pluginManager?.uninstallPlugin(currentPlugin.name)
                                        event.emit(PLUGIN_CHANGED, { source: 'uninstall' })
                                        setOpen(false)
                                    })
                                }
                            }}
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Uninstall
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
