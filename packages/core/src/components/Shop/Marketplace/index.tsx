import { ArchiveIcon, ArrowUpRight, BoxIcon, Dot, DownloadIcon, FilePlus2, Loader2, PlusIcon, RiNftFill, SearchIcon } from "@kn/icon";
import {
    Avatar, Button, Card, CardDescription, CardFooter, CardHeader, CardTitle, EmptyState, IconButton, Input,
    Rate,
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator, Skeleton, cn
} from "@kn/ui";
import React, { useContext, useEffect, useState } from "react";
import { PluginUploader } from "../PluginUploader";
import { useApi, useNavigator, useUploadFile } from "../../../hooks";
import { APIS } from "../../../api";
import { useToggle } from "ahooks";
import { AppContext, event, useTranslation } from "@kn/common";

export const Marketplace: React.FC = () => {

    const [categories, setCategories] = React.useState<string[]>([
        "All",
        "App",
        "Feature",
        "Connector"
    ])

    const [selectCategory, setSelectCategory] = useState<string>("All")
    const [plugins, setPlugins] = useState<any[]>([])
    const [installing, { toggle }] = useToggle(false)
    const [installingPluginId, setInstallingPluginId] = useState<string>()
    const { usePath } = useUploadFile()
    const navigator = useNavigator()
    const [flag, setFlag] = useState(0)
    const { t } = useTranslation()
    const { pluginManager } = useContext(AppContext)
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [showLoading, setShowLoading] = useState<boolean>(false)

    useEffect(() => {
        setIsLoading(true)

        // Delay showing loading state to avoid flicker on fast loads
        const loadingTimer = setTimeout(() => {
            setShowLoading(true)
        }, 300)

        useApi(APIS.GET_PLUGIN_LIST, { pageSize: 10, category: selectCategory === "All" ? null : selectCategory.toLocaleUpperCase() }).then(res => {
            setPlugins(res.data.records)
        }).finally(() => {
            clearTimeout(loadingTimer)
            setShowLoading(false)
            setIsLoading(false)
        })
    }, [flag, selectCategory])

    useEffect(() => {
        event.on("REFRESH_PLUSINS", () => {
            setFlag(f => f + 1)
        })

        return () => {
            event.off("REFRESH_PLUSINS")
        }
    }, [])

    const installPlugin = (plugin: any) => {
        toggle()
        setInstallingPluginId(plugin.currentVersionId)
        useApi(APIS.INSTALL_PLUGIN, {
            versionId: plugin.currentVersionId
        }).then(() => {
            pluginManager?.installPlugin(plugin).then(() => {
                setInstallingPluginId(undefined)
                toggle()
            })
        })

    }

    return <div className="w-full min-h-screen bg-gradient-to-b from-background to-muted/20">
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center w-full px-4 sm:px-6 py-3 sm:py-4 border-b bg-background/95 backdrop-blur-sm sticky top-0 z-10 shadow-sm gap-2 sm:gap-0">
            <div className="flex-1 w-full sm:max-w-2xl sm:mx-6">
                <Input
                    placeholder="Search plugins..."
                    className="h-9 bg-background border-2 shadow-sm focus-visible:shadow-md transition-all text-sm w-full"
                    icon={<SearchIcon className="h-4 w-4" />}
                />
            </div>
            <div className="flex gap-2 items-center justify-end sm:justify-start">
                <Button size="sm" variant="outline" className="shadow-sm hover:shadow-md transition-shadow h-8 text-xs flex-1 sm:flex-initial">
                    <FilePlus2 className="h-3.5 w-3.5 sm:mr-1.5" />
                    <span className="hidden sm:inline">Request Plugin</span>
                </Button>
                <PluginUploader>
                    <Button size="sm" className="shadow-sm hover:shadow-md transition-shadow bg-primary h-8 text-xs flex-1 sm:flex-initial">
                        <PlusIcon className="h-3.5 w-3.5 sm:mr-1.5" />
                        <span className="hidden sm:inline">Publish Plugin</span>
                    </Button>
                </PluginUploader>
            </div>
        </div>
        <div className="w-full px-4 sm:px-6 md:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 h-[calc(100vh-89px)] sm:h-[calc(100vh-73px)] overflow-auto">
            {/* Hero Section */}
            <div className="w-full max-w-7xl mx-auto text-center py-6 sm:py-8 space-y-3 sm:space-y-4 px-2">
                <div className="space-y-2 sm:space-y-3">
                    <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                        {t("marketplace.title", "Enhance your Kotion experience")}
                    </h1>
                    <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-3xl mx-auto font-light px-4">
                        {t("marketplace.description", "Discover plugins that extend Kotion's capabilities and help you work more efficiently.")}
                    </p>
                </div>

                {/* Category Pills */}
                <div className="flex gap-2 items-center justify-center flex-wrap pt-3 sm:pt-4">
                    {
                        categories.map((it, index) => <button
                            onClick={() => setSelectCategory(it)}
                            className={cn(
                                "rounded-full px-4 sm:px-5 py-1.5 sm:py-2 font-medium text-xs transition-all duration-200",
                                "hover:scale-105 hover:shadow-md",
                                selectCategory === it
                                    ? "bg-primary text-primary-foreground shadow-lg scale-105"
                                    : "bg-background border-2 hover:border-primary/50"
                            )}
                            key={index}>
                            {it}
                        </button>)
                    }
                </div>
            </div>

            {/* Filters Bar */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-center justify-between max-w-7xl mx-auto px-2 sm:px-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium">Results</span>
                    <Separator orientation="vertical" className="h-4" />
                    <span>{plugins.length} plugins found</span>
                </div>
                <Select>
                    <SelectTrigger className="w-full sm:w-[160px] h-8 shadow-sm text-xs">
                        <div className="mr-2 text-xs">Sort by</div> <SelectValue placeholder="Relevance" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="relevance">Relevance</SelectItem>
                        <SelectItem value="popular">Most Popular</SelectItem>
                        <SelectItem value="recent">Recently Added</SelectItem>
                        <SelectItem value="rating">Highest Rated</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            {/* Plugin Grid */}
            <div className="max-w-7xl mx-auto px-2 sm:px-4">
                {
                    showLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 3xl:grid-cols-5 gap-3 sm:gap-4 w-full">
                            {Array.from({ length: 8 }).map((_, index) => (
                                <Card key={index} className="relative animate-pulse border-2 shadow-lg" style={{
                                    animationDelay: `${index * 50}ms`,
                                    animationDuration: '1.5s'
                                }}>
                                    <div className="w-[70px] h-[20px] absolute right-0 top-0 rounded-bl-md rounded-tr-md">
                                        <Skeleton className="w-full h-full" />
                                    </div>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-sm">
                                            <div className="flex items-center gap-2">
                                                <Skeleton className="rounded-sm w-[50px] h-[50px]" />
                                                <div className="flex flex-col gap-1.5 flex-1">
                                                    <Skeleton className="h-3 w-3/4" />
                                                    <Skeleton className="h-2.5 w-1/2" />
                                                    <Skeleton className="h-2.5 w-2/3" />
                                                </div>
                                            </div>
                                        </CardTitle>
                                        <CardDescription className="h-[60px] space-y-1.5 pt-2">
                                            <Skeleton className="h-2.5 w-full" />
                                            <Skeleton className="h-2.5 w-full" />
                                            <Skeleton className="h-2.5 w-4/5" />
                                        </CardDescription>
                                    </CardHeader>
                                    <CardFooter className="pb-3 space-x-1">
                                        <Skeleton className="h-8 w-20" />
                                        <Skeleton className="h-8 w-20" />
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    ) : plugins.length === 0 ? (
                        <EmptyState
                            className="h-[calc(100vh-300px)] sm:h-[calc(100vh-160px)] hover:bg-background w-full max-w-none border-none flex flex-col justify-center"
                            title="No plugins found"
                            icons={[BoxIcon]}
                            description="Try adjusting your search or category filter"
                        />
                    ) : <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 3xl:grid-cols-5 gap-3 sm:gap-4 w-full animate-in fade-in-50 duration-500">
                        {
                            plugins.map((plugin, index) => (
                                <div key={index} className="group">
                                    <Card className="relative h-full border-2 hover:border-primary/50 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-card overflow-hidden">
                                        <div className="absolute right-0 top-0 px-2.5 py-1 text-[10px] font-semibold rounded-bl-xl bg-primary/10 text-primary border-l border-b border-primary/20">
                                            {plugin?.category?.value}
                                        </div>
                                        <CardHeader className="space-y-3 pb-3">
                                            <CardTitle className="text-sm">
                                                <div className="flex items-start gap-2.5">
                                                    <Avatar className="rounded-lg w-12 h-12">
                                                        <img src={usePath(plugin.icon)} alt={plugin.name} className="object-cover" />
                                                    </Avatar>
                                                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                                                        <div className="font-semibold text-sm truncate group-hover:text-primary transition-colors" title={plugin.name}>
                                                            {plugin.name}
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground flex items-center gap-1 min-w-0">
                                                            <span className="truncate max-w-[70px]" title={plugin.developer}>{plugin.developer}</span>
                                                            <span className="flex-shrink-0">/</span>
                                                            <span className="truncate max-w-[70px]" title={plugin.maintainer}>{plugin.maintainer}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1 text-muted-foreground">
                                                            <Rate rating={plugin.rating} variant="yellow" disabled size={12} />
                                                            <Dot className="opacity-50" />
                                                            <div className="text-[10px] flex items-center gap-0.5">
                                                                <DownloadIcon className="h-2.5 w-2.5" />
                                                                <span className="font-medium">{plugin.downloads}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardTitle>
                                            <CardDescription className="h-16 text-xs leading-relaxed line-clamp-3 overflow-hidden" title={plugin.description}>
                                                {plugin.description}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardFooter className="pb-3 pt-0 gap-1.5 flex-col">
                                            <Button
                                                disabled={!!(plugin.installeddVersions.length > 0)}
                                                className="w-full shadow-sm hover:shadow-md transition-all h-8 text-xs"
                                                size="sm"
                                                onClick={() => installPlugin(plugin)}
                                            >
                                                {(installing && installingPluginId === plugin.currentVersionId) ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                                                ) : (
                                                    <DownloadIcon className="w-3.5 h-3.5 mr-1.5" />
                                                )}
                                                {plugin.installeddVersions.length > 0 ? "Installed" : "Install"}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="w-full shadow-sm hover:shadow-md transition-all h-8 text-xs"
                                                size="sm"
                                                onClick={() => {
                                                    navigator.go({
                                                        to: `/plugin-hub/${plugin.id}`
                                                    })
                                                }}
                                            >
                                                <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
                                                View Details
                                            </Button>
                                        </CardFooter>
                                    </Card>
                                </div>
                            ))
                        }
                    </div>
                }
                {/* CTA Section */}
                <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-6 sm:py-8">
                    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-primary/20">
                        <div className="relative flex flex-col md:flex-row justify-between items-center p-6 sm:p-8 gap-4 sm:gap-6">
                            <div className="flex-1 space-y-2 text-center md:text-left">
                                <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text ">
                                    {t("marketplace.create-your-own-plugin", "Create Your Own Plugin")}
                                </h2>
                                <p className="text-xs sm:text-sm text-muted-foreground max-w-xl mx-auto md:mx-0">
                                    Create plugins for Kotion and reach thousands of users worldwide. Share your ideas and innovations with the community.
                                </p>
                            </div>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full md:w-auto">
                                <Button size="sm" className="shadow-lg hover:shadow-xl transition-all hover:scale-105 h-9 text-sm w-full sm:w-auto">
                                    {t("marketplace.get-started", "Get Started")}
                                </Button>
                                <Button size="sm" variant="outline" className="shadow-lg hover:shadow-xl transition-all hover:scale-105 bg-background h-9 text-sm w-full sm:w-auto">
                                    {t("marketplace.doc", "Documentation")}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
}