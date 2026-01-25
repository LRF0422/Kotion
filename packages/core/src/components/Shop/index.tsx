import { BoxSelect, DownloadCloud, PlusSquare, RefreshCcw, Slack, Star, Trash2, Package } from "@kn/icon";
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
    Badge, Button, EmptyState, Input, Separator, Tooltip,
    TooltipContent, TooltipProvider, TooltipTrigger
} from "@kn/ui";
import React, { useContext, useEffect, useState } from "react";
import { useNavigator } from "../../hooks/use-navigator";
import { Outlet } from "react-router-dom";
import { PluginUploader } from "./PluginUploader";
import { PluginManager } from "./PluginManager";
import { useApi, useUploadFile } from "../../hooks";
import { APIS } from "../../api";
import { useSafeState } from "ahooks";
import { AppContext, REFRESH_PLUSINS, event } from "@kn/common";


const Item: React.FC<{ item: any, handleUnInstall: (id: string) => void, handleUpdate: (id: string) => void }> = ({ item, handleUnInstall, handleUpdate }) => {
    const navigator = useNavigator()
    const { usePath } = useUploadFile()
    const [isHovered, setIsHovered] = useState(false)

    return <TooltipProvider>
        <Tooltip>
            <TooltipTrigger asChild>
                <div
                    className="group relative flex items-center gap-3 rounded-lg p-3 border bg-card hover:bg-accent/50 transition-all duration-300 cursor-pointer hover:shadow-md hover:border-primary/20"
                    style={{
                        transform: isHovered ? 'translateX(2px)' : 'translateX(0)',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    onClick={() => {
                        navigator.go({
                            to: `/plugin-hub/${item.subjectId}`
                        })
                    }}
                >
                    {/* Plugin Icon */}
                    <div className="flex-shrink-0">
                        <Avatar className="h-12 w-12 rounded-lg border-2 border-border/50 group-hover:border-primary/30 transition-colors">
                            <img src={usePath(item.icon)} alt={item.name} className="object-cover" />
                        </Avatar>
                    </div>

                    {/* Plugin Info */}
                    <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                            <h4 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                                {item.name}
                            </h4>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
                                <div className="flex items-center gap-0.5">
                                    <DownloadCloud className="h-3 w-3" />
                                    <span>100M</span>
                                </div>
                                <div className="flex items-center gap-0.5">
                                    <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                    <span>100M</span>
                                </div>
                            </div>
                        </div>

                        <p className="text-xs text-muted-foreground line-clamp-1">
                            {item.description}
                        </p>

                        {/* Action Buttons */}
                        <div className="flex gap-1.5 pt-0.5">
                            <Button
                                variant="secondary"
                                size="sm"
                                className="h-7 px-2.5 text-xs gap-1.5 hover:bg-destructive/10 hover:text-destructive transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleUnInstall(item)
                                }}
                            >
                                <Trash2 className="h-3 w-3" />
                                Uninstall
                            </Button>
                            {
                                item.activeVersionId !== item.id &&
                                <Badge variant="outline" className="h-7 px-2.5 text-xs cursor-pointer hover:bg-primary/10 hover:text-primary hover:border-primary/50 transition-colors" onClick={(e) => {
                                    e.stopPropagation()
                                    handleUpdate(item.id)
                                }}>
                                    Update Available
                                </Badge>
                            }
                        </div>
                    </div>
                </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="space-y-2 w-[320px] p-4">
                <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 rounded-lg">
                        <img src={usePath(item.icon)} alt={item.name} />
                    </Avatar>
                    <div className="flex-1">
                        <h4 className="font-semibold">{item.name}</h4>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            <div className="flex items-center gap-1">
                                <DownloadCloud className="h-3 w-3" />
                                <span>100M downloads</span>
                            </div>
                            <Separator orientation="vertical" className="h-3" />
                            <div className="flex items-center gap-1">
                                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                <span>100M stars</span>
                            </div>
                        </div>
                    </div>
                </div>
                <Separator />
                <p className="text-sm text-muted-foreground leading-relaxed">
                    {item.description}
                </p>
            </TooltipContent>
        </Tooltip>
    </TooltipProvider>
}

export const Shop: React.FC = () => {

    const [installedPlugins, setInstalledPlugins] = useSafeState([])
    const navigator = useNavigator()
    const [flag, setFlag] = useState(0)
    const [open, setOpen] = useState(false)
    const { pluginManager } = useContext(AppContext)
    const [currentPlugin, setCurrentPlugin] = useState<any | undefined>()

    useEffect(() => {
        useApi(APIS.GET_INSTALLED_PLUGINS).then(res => {
            setInstalledPlugins(res.data)
        })
    }, [flag])

    useEffect(() => {
        event.on("REFRESH_PLUSINS", () => {
            setFlag(f => f + 1)
        })
    }, [])

    const goToMarketplace = () => {
        navigator.go({
            to: '/plugin-hub'
        })
    }

    const uninstall = (plugin: any) => {
        setOpen(true)
        setCurrentPlugin(plugin)
    }

    const handleUpdate = (id: string) => {
        useApi(APIS.UPDATE_PLUGIN, { versionId: id }).then(() => {
            setFlag(f => f + 1)
        })
    }

    return <div className="grid grid-cols-[320px_1fr] w-full h-screen bg-background">
        {/* Sidebar */}
        <div className="border-r bg-muted/30 flex flex-col h-screen">
            {/* Header */}
            <div className="flex-shrink-0 border-b bg-background/80 backdrop-blur-sm">
                <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500">
                            <Package className="h-4 w-4 text-white" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold">Extensions</h2>
                            <p className="text-xs text-muted-foreground">
                                {installedPlugins.length} installed
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-1 items-center">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted">
                                        <RefreshCcw className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Refresh</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <PluginUploader>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted">
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
                                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted">
                                            <Slack className="h-4 w-4" />
                                        </Button>
                                    </PluginManager>
                                </TooltipTrigger>
                                <TooltipContent>Manage Plugins</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="px-4 pb-4">
                    <Input
                        className="h-9 bg-background"
                        placeholder="Search extensions..."
                    />
                </div>
            </div>

            {/* Plugin List */}
            <div className="flex-1 overflow-hidden">
                <Accordion
                    type="multiple"
                    defaultValue={["installed"]}
                    className="h-full overflow-auto px-3 py-2"
                >
                    <AccordionItem value="installed" className="border-none">
                        <AccordionTrigger className="text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground py-2 px-2 hover:no-underline">
                            <div className="flex items-center gap-2">
                                <span>Installed</span>
                                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                                    {installedPlugins.length}
                                </Badge>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2">
                            <div className="space-y-1.5">
                                {
                                    installedPlugins.length > 0 ? installedPlugins.map((plugin, index) => {
                                        return <Item key={index} item={plugin} handleUnInstall={uninstall} handleUpdate={handleUpdate} />
                                    }) : <div className="py-12">
                                        <EmptyState
                                            title="No Plugins Installed"
                                            description="Browse the marketplace to discover and install plugins"
                                            className="border-dashed bg-background/50"
                                            action={{
                                                label: "Browse Marketplace",
                                                onClick: () => {
                                                    goToMarketplace()
                                                }
                                            }}
                                            icons={[Package, BoxSelect, Slack]}
                                        />
                                    </div>
                                }
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </div>
        </div>

        {/* Main Content */}
        <div className="overflow-auto">
            <Outlet />
        </div>
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger />
            <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-3 rounded-full bg-destructive/10">
                            <Trash2 className="h-6 w-6 text-destructive" />
                        </div>
                        <div className="flex-1">
                            <AlertDialogTitle className="text-lg">Uninstall Plugin</AlertDialogTitle>
                            <AlertDialogDescription className="text-sm text-muted-foreground mt-1">
                                This action cannot be undone
                            </AlertDialogDescription>
                        </div>
                    </div>
                </AlertDialogHeader>
                <div className="py-4">
                    <div className="rounded-lg border bg-muted/30 p-4">
                        <p className="text-sm">
                            Are you sure you want to permanently remove <span className="font-semibold text-foreground">{currentPlugin?.name}</span>?
                            All plugin data and configurations will be deleted.
                        </p>
                    </div>
                </div>
                <AlertDialogFooter className="gap-2 sm:gap-2">
                    <AlertDialogCancel
                        className="mt-0"
                        onClick={() => {
                            setCurrentPlugin(undefined)
                            setOpen(false)
                        }}
                    >
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        onClick={() => {
                            if (currentPlugin) {
                                useApi(APIS.UNINSTALL_PLUGIN, { versionId: currentPlugin.id }).then(res => {
                                    setFlag(f => f + 1)
                                    pluginManager?.uninstallPlugin(currentPlugin.name)
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
}