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
        <div className="flex justify-between items-center w-full px-8 py-6 border-b bg-background/95 backdrop-blur-sm sticky top-0 z-10 shadow-sm">
            <div className="flex-1 max-w-2xl mx-8">
                <Input
                    placeholder="Search plugins..."
                    className="h-10 bg-background border-2 shadow-sm focus-visible:shadow-md transition-all"
                    icon={<SearchIcon className="h-4 w-4" />}
                />
            </div>
            <div className="flex gap-3 items-center">
                <Button size="sm" variant="outline" className="shadow-sm hover:shadow-md transition-shadow">
                    <FilePlus2 className="h-4 w-4 mr-2" />
                    Request Plugin
                </Button>
                <PluginUploader>
                    <Button size="sm" className="shadow-sm hover:shadow-md transition-shadow bg-primary">
                        <PlusIcon className="h-4 w-4 mr-2" />
                        Publish Plugin
                    </Button>
                </PluginUploader>
            </div>
        </div>
        <div className="w-full px-12 py-8 space-y-8 h-[calc(100vh-102px)] overflow-auto">
            {/* Hero Section */}
            <div className="w-full max-w-7xl mx-auto text-center py-12 space-y-6">
                <div className="space-y-4">
                    <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                        {t("marketplace.title", "Enhance your Kotion experience")}
                    </h1>
                    <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto font-light">
                        {t("marketplace.description", "Discover plugins that extend Kotion's capabilities and help you work more efficiently.")}
                    </p>
                </div>

                {/* Category Pills */}
                <div className="flex gap-2 items-center justify-center flex-wrap pt-6">
                    {
                        categories.map((it, index) => <button
                            onClick={() => setSelectCategory(it)}
                            className={cn(
                                "rounded-full px-6 py-2.5 font-medium text-sm transition-all duration-200",
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
            <div className="flex gap-3 items-center justify-between max-w-7xl mx-auto px-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-medium">Results</span>
                    <Separator orientation="vertical" className="h-4" />
                    <span>{plugins.length} plugins found</span>
                </div>
                <Select>
                    <SelectTrigger className="w-[180px] h-9 shadow-sm">
                        <div className="mr-2 text-sm">Sort by</div> <SelectValue placeholder="Relevance" />
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
            <div className="max-w-7xl mx-auto px-4">
                {
                    showLoading ? (
                        <div className="grid xl:grid-cols-4 2xl:grid-cols-4 3xl:grid-cols-5 md:grid-cols-3 sm:grid-cols-2 gap-6 w-full">
                            {Array.from({ length: 8 }).map((_, index) => (
                                <Card key={index} className="relative animate-pulse border-2 shadow-lg" style={{
                                    animationDelay: `${index * 50}ms`,
                                    animationDuration: '1.5s'
                                }}>
                                    <div className="w-[80px] h-[24px] absolute right-0 top-0 rounded-bl-md rounded-tr-md">
                                        <Skeleton className="w-full h-full" />
                                    </div>
                                    <CardHeader>
                                        <CardTitle className="text-sm">
                                            <div className="flex items-center gap-2">
                                                <Skeleton className="rounded-sm w-[60px] h-[60px]" />
                                                <div className="flex flex-col gap-2 flex-1">
                                                    <Skeleton className="h-4 w-3/4" />
                                                    <Skeleton className="h-3 w-1/2" />
                                                    <Skeleton className="h-3 w-2/3" />
                                                </div>
                                            </div>
                                        </CardTitle>
                                        <CardDescription className="h-[80px] space-y-2 pt-2">
                                            <Skeleton className="h-3 w-full" />
                                            <Skeleton className="h-3 w-full" />
                                            <Skeleton className="h-3 w-4/5" />
                                        </CardDescription>
                                    </CardHeader>
                                    <CardFooter className="pb-3 space-x-1">
                                        <Skeleton className="h-9 w-24" />
                                        <Skeleton className="h-9 w-24" />
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    ) : plugins.length === 0 ? (
                        <EmptyState
                            className="h-[calc(100vh-160px)] hover:bg-background w-full max-w-none border-none flex flex-col justify-center"
                            title="No plugins found"
                            icons={[BoxIcon]}
                            description="Try adjusting your search or category filter"
                        />
                    ) : <div className="grid xl:grid-cols-4 2xl:grid-cols-4 3xl:grid-cols-5 md:grid-cols-3 sm:grid-cols-2 gap-3 w-full animate-in fade-in-50 duration-500">
                        {
                            plugins.map((plugin, index) => (
                                <div key={index} className="group">
                                    <Card className="relative h-full border-2 hover:border-primary/50 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-card overflow-hidden">
                                        <div className="absolute right-0 top-0 px-3 py-1.5 text-xs font-semibold rounded-bl-2xl bg-primary/10 text-primary border-l border-b border-primary/20">
                                            {plugin?.category?.value}
                                        </div>
                                        <CardHeader className="space-y-4 pb-4">
                                            <CardTitle className="text-base">
                                                <div className="flex items-start gap-3">
                                                    <Avatar className="rounded-lg w-16 h-16 ">
                                                        <img src={usePath(plugin.icon)} alt={plugin.name} className="object-cover" />
                                                    </Avatar>
                                                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                                                        <div className="font-semibold text-base truncate group-hover:text-primary transition-colors" title={plugin.name}>
                                                            {plugin.name}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                                                            <span className="truncate max-w-[80px]" title={plugin.developer}>{plugin.developer}</span>
                                                            <span className="flex-shrink-0">/</span>
                                                            <span className="truncate max-w-[80px]" title={plugin.maintainer}>{plugin.maintainer}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1 text-muted-foreground">
                                                            <Rate rating={plugin.rating} variant="yellow" disabled size={14} />
                                                            <Dot className="opacity-50" />
                                                            <div className="text-xs flex items-center gap-1">
                                                                <DownloadIcon className="h-3 w-3" />
                                                                <span className="font-medium">{plugin.downloads}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardTitle>
                                            <CardDescription className="h-20 text-sm leading-relaxed line-clamp-3 overflow-hidden" title={plugin.description}>
                                                {plugin.description}
                                            </CardDescription>
                                        </CardHeader>
                                        <CardFooter className="pb-4 pt-0 gap-2 flex-col">
                                            <Button
                                                disabled={!!(plugin.installeddVersions.length > 0)}
                                                className="w-full shadow-sm hover:shadow-md transition-all"
                                                size="sm"
                                                onClick={() => installPlugin(plugin)}
                                            >
                                                {(installing && installingPluginId === plugin.currentVersionId) ? (
                                                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                ) : (
                                                    <DownloadIcon className="w-4 h-4 mr-2" />
                                                )}
                                                {plugin.installeddVersions.length > 0 ? "Installed" : "Install"}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="w-full shadow-sm hover:shadow-md transition-all"
                                                size="sm"
                                                onClick={() => {
                                                    navigator.go({
                                                        to: `/plugin-hub/${plugin.id}`
                                                    })
                                                }}
                                            >
                                                <ArrowUpRight className="w-4 h-4 mr-2" />
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
                <div className="w-full max-w-7xl mx-auto px-4 py-12">
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-primary/20">
                        <div className="relative flex flex-col md:flex-row justify-between items-center p-12 gap-8">
                            <div className="flex-1 space-y-3">
                                <h2 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text ">
                                    {t("marketplace.create-your-own-plugin", "Create Your Own Plugin")}
                                </h2>
                                <p className="text-lg text-muted-foreground max-w-xl">
                                    Create plugins for Kotion and reach thousands of users worldwide. Share your ideas and innovations with the community.
                                </p>
                            </div>
                            <div className="flex items-center gap-4">
                                <Button size="lg" className="shadow-lg hover:shadow-xl transition-all hover:scale-105">
                                    {t("marketplace.get-started", "Get Started")}
                                </Button>
                                <Button size="lg" variant="outline" className="shadow-lg hover:shadow-xl transition-all hover:scale-105 bg-background">
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