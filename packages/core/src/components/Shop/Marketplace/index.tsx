import { ArrowUpRight, BoxIcon, CheckCircle2, DownloadIcon, FilePlus2, Loader2, PlusIcon, SearchIcon } from "@kn/icon";
import {
    Avatar, Badge, Button, Card, CardContent, CardFooter, CardHeader, EmptyState, Input,
    Rate, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, cn
} from "@kn/ui";
import React, { useContext, useEffect, useMemo, useState } from "react";
import { PluginUploader } from "../PluginUploader";
import { useApi, useNavigator, useUploadFile, usePluginState, useDebounce, PLUGIN_CHANGED, event } from "@kn/common";
import { APIS } from "@kn/common";
import { useToggle } from "ahooks";
import { AppContext, useTranslation } from "@kn/common";

const CATEGORIES = ["All", "App", "Feature", "Connector"] as const
type SortKey = "relevance" | "popular" | "recent" | "rating"
const PAGE_SIZE = 12

export const Marketplace: React.FC = () => {
    const { usePath } = useUploadFile()
    const navigator = useNavigator()
    const { t } = useTranslation()
    const { pluginManager } = useContext(AppContext)

    const [rawPlugins, setRawPlugins] = useState<any[]>([])
    const [selectCategory, setSelectCategory] = useState<string>("All")
    const [keyword, setKeyword] = useState("")
    const [sort, setSort] = useState<SortKey>("relevance")
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

    const [installing, { toggle }] = useToggle(false)
    const [installingPluginId, setInstallingPluginId] = useState<string>()
    const [showLoading, setShowLoading] = useState(false)
    const [refetchKey, setRefetchKey] = useState(0)

    // Runtime state for "Active" badge on loaded plugins
    const { loadedPluginNames, pluginVersion } = usePluginState()

    const debouncedKeyword = useDebounce(keyword, { wait: 300 })

    // Server fetch: only the proven params (category + a generous pageSize).
    // Keyword search and sort are applied client-side below so they always work
    // regardless of backend support. NOTE: pageSize:200 ceiling — if the catalog
    // grows beyond this, switch to server-side search.
    useEffect(() => {
        const loadingTimer = setTimeout(() => setShowLoading(true), 300)
        useApi(APIS.GET_PLUGIN_LIST, {
            pageSize: 200,
            category: selectCategory === "All" ? null : selectCategory.toLocaleUpperCase()
        }).then(res => {
            setRawPlugins(res.data.records ?? [])
        }).finally(() => {
            clearTimeout(loadingTimer)
            setShowLoading(false)
        })
    }, [selectCategory, pluginVersion, refetchKey])

    // Single refetch mechanism on plugin changes (install / uninstall / update)
    useEffect(() => {
        const handlePluginChange = () => setRefetchKey(k => k + 1)
        event.on(PLUGIN_CHANGED, handlePluginChange)
        return () => { event.off(PLUGIN_CHANGED, handlePluginChange) }
    }, [])

    // Client-side keyword filter + sort — the reliable source of truth.
    const filtered = useMemo(() => {
        const q = debouncedKeyword.trim().toLowerCase()
        let list = rawPlugins
        if (q) {
            list = list.filter(p =>
                [p.name, p.description, p.developer, p.maintainer, p.category?.value]
                    .filter(Boolean)
                    .some(s => String(s).toLowerCase().includes(q)))
        }
        const out = [...list]
        switch (sort) {
            case "popular":
                out.sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0))
                break
            case "rating":
                out.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
                break
            case "recent":
                out.sort((a, b) =>
                    new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
                break
            case "relevance":
            default:
                // With a query, surface name-prefix matches first; otherwise keep server order.
                if (q) {
                    out.sort((a, b) =>
                        Number(b.name?.toLowerCase().startsWith(q)) -
                        Number(a.name?.toLowerCase().startsWith(q)))
                }
        }
        return out
    }, [rawPlugins, debouncedKeyword, sort])

    const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])

    // Reset paging whenever the filter inputs change.
    useEffect(() => {
        setVisibleCount(PAGE_SIZE)
    }, [debouncedKeyword, sort, selectCategory])

    const installPlugin = (plugin: any) => {
        toggle()
        setInstallingPluginId(plugin.currentVersionId)
        useApi(APIS.INSTALL_PLUGIN, {
            versionId: plugin.currentVersionId
        }).then(() => {
            pluginManager?.installPlugin(plugin).then(() => {
                setInstallingPluginId(undefined)
                toggle()
                event.emit(PLUGIN_CHANGED, { source: 'install' })
            })
        })
    }

    const isFirstLoad = showLoading && rawPlugins.length === 0
    const hasRawData = rawPlugins.length > 0

    return (
        <div className="w-full min-h-full bg-background flex flex-col">
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background px-4 sm:px-6 py-3">
                <div className="flex items-center gap-2 min-w-0">
                    <h1 className="text-base sm:text-lg font-semibold truncate">
                        {t("marketplace.title", "Plugins")}
                    </h1>
                    <Badge variant="secondary" className="shrink-0">{filtered.length}</Badge>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="h-9">
                        <FilePlus2 className="h-4 w-4 sm:mr-1.5" />
                        <span className="hidden sm:inline">{t("marketplace.request", "Request")}</span>
                    </Button>
                    <PluginUploader>
                        <Button size="sm" className="h-9">
                            <PlusIcon className="h-4 w-4 sm:mr-1.5" />
                            <span className="hidden sm:inline">{t("marketplace.publish", "Publish")}</span>
                        </Button>
                    </PluginUploader>
                </div>
            </div>

            <div className="flex-1 px-4 sm:px-6 py-4 sm:py-5 space-y-4 max-w-7xl w-full mx-auto">
                {/* Toolbar: search + sort */}
                <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                        placeholder={t("marketplace.search-placeholder", "Search plugins...")}
                        value={keyword}
                        onChange={e => setKeyword(e.target.value)}
                        className="flex-1 h-11 sm:h-9"
                        icon={<SearchIcon className="h-4 w-4" />}
                    />
                    <Select value={sort} onValueChange={(v: SortKey) => setSort(v)}>
                        <SelectTrigger className="w-full sm:w-[170px] h-11 sm:h-9 shrink-0">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="relevance">{t("marketplace.sort.relevance", "Relevance")}</SelectItem>
                            <SelectItem value="popular">{t("marketplace.sort.popular", "Most Popular")}</SelectItem>
                            <SelectItem value="recent">{t("marketplace.sort.recent", "Recently Added")}</SelectItem>
                            <SelectItem value="rating">{t("marketplace.sort.rating", "Highest Rated")}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Category pills */}
                <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map(cat => (
                        <Badge
                            key={cat}
                            variant={selectCategory === cat ? "default" : "outline"}
                            className="cursor-pointer h-9 sm:h-8 px-3 text-xs font-medium"
                            onClick={() => setSelectCategory(cat)}
                        >
                            {cat}
                        </Badge>
                    ))}
                </div>

                {/* Results count */}
                <div className="text-xs text-muted-foreground">
                    {t("marketplace.results-count", "Showing {{count}} plugins", { count: filtered.length })}
                </div>

                {/* Grid / states */}
                {isFirstLoad ? (
                    <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {Array.from({ length: 8 }).map((_, index) => (
                            <Card key={index} className="border">
                                <CardHeader className="pb-3">
                                    <div className="flex items-start gap-3">
                                        <Skeleton className="rounded-lg w-12 h-12 shrink-0" />
                                        <div className="flex flex-col gap-1.5 flex-1">
                                            <Skeleton className="h-3.5 w-3/4" />
                                            <Skeleton className="h-2.5 w-1/2" />
                                            <Skeleton className="h-2.5 w-2/3" />
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="pb-3 space-y-1.5">
                                    <Skeleton className="h-2.5 w-full" />
                                    <Skeleton className="h-2.5 w-4/5" />
                                </CardContent>
                                <CardFooter className="pb-3 gap-2">
                                    <Skeleton className="h-9 flex-1" />
                                    <Skeleton className="h-9 flex-1" />
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <EmptyState
                        className="min-h-[40vh] hover:bg-background w-full max-w-none border-none flex flex-col justify-center"
                        title={
                            hasRawData
                                ? t("marketplace.empty.no-match", "No matches for your search")
                                : t("marketplace.empty.none", "No plugins found")
                        }
                        icons={[BoxIcon]}
                        description={
                            hasRawData
                                ? t("marketplace.empty.no-match-desc", "Try a different keyword or sort option")
                                : t("marketplace.empty.none-desc", "Try adjusting your category filter")
                        }
                    />
                ) : (
                    <>
                        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {visible.map((plugin, index) => {
                                const installed = plugin.installeddVersions.length > 0
                                const active = installed && loadedPluginNames.has(plugin.name)
                                const isInstalling = installing && installingPluginId === plugin.currentVersionId
                                return (
                                    <Card
                                        key={plugin.id ?? index}
                                        className="group flex flex-col border hover:border-primary/50 transition-colors"
                                    >
                                        <CardHeader className="pb-3">
                                            <div className="flex items-start gap-3">
                                                <Avatar className="rounded-lg w-12 h-12 shrink-0">
                                                    <img src={usePath(plugin.icon)} alt={plugin.name} className="object-cover" />
                                                </Avatar>
                                                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                                    <div className="font-semibold text-sm truncate group-hover:text-primary transition-colors" title={plugin.name}>
                                                        {plugin.name}
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground flex items-center gap-1 min-w-0">
                                                        <span className="truncate" title={plugin.developer}>{plugin.developer}</span>
                                                        {plugin.maintainer && (
                                                            <>
                                                                <span className="shrink-0">/</span>
                                                                <span className="truncate" title={plugin.maintainer}>{plugin.maintainer}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-muted-foreground pt-0.5">
                                                        <Rate rating={plugin.rating} variant="yellow" disabled size={12} />
                                                        <span className="text-[11px] flex items-center gap-0.5">
                                                            <DownloadIcon className="h-3 w-3" />
                                                            {plugin.downloads ?? 0}
                                                        </span>
                                                    </div>
                                                </div>
                                                {plugin?.category?.value && (
                                                    <Badge variant="outline" className="text-[10px] shrink-0">
                                                        {plugin.category.value}
                                                    </Badge>
                                                )}
                                            </div>
                                        </CardHeader>
                                        <CardContent className="pb-3 flex-1">
                                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2" title={plugin.description}>
                                                {plugin.description}
                                            </p>
                                        </CardContent>
                                        <CardFooter className="pt-0 gap-2">
                                            <Button
                                                disabled={installed}
                                                className={cn(
                                                    "flex-1 h-9 text-xs",
                                                    active && "bg-green-600 hover:bg-green-700 text-white"
                                                )}
                                                size="sm"
                                                onClick={() => installPlugin(plugin)}
                                            >
                                                {isInstalling ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                                                ) : installed ? (
                                                    <>
                                                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                                        {active ? t("marketplace.active", "Active") : t("marketplace.installed", "Installed")}
                                                    </>
                                                ) : (
                                                    <>
                                                        <DownloadIcon className="w-3.5 h-3.5 mr-1.5" />
                                                        {t("marketplace.install", "Install")}
                                                    </>
                                                )}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                className="flex-1 h-9 text-xs"
                                                size="sm"
                                                onClick={() => navigator.go({ to: `/plugin-hub/${plugin.id}` })}
                                            >
                                                <ArrowUpRight className="w-3.5 h-3.5 mr-1.5" />
                                                {t("marketplace.details", "Details")}
                                            </Button>
                                        </CardFooter>
                                    </Card>
                                )
                            })}
                        </div>

                        {visibleCount < filtered.length && (
                            <div className="flex justify-center pt-2">
                                <Button
                                    variant="outline"
                                    onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                                >
                                    {t("marketplace.load-more", "Load more")}
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
