import { Button, Card, CardContent, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger, cn, useIsMobile } from "@kn/ui";
import { type BlockSummary, type DateTimeValue, type PageSummary, type ResolvedPageType, type Space, useSpacePageService, useNavigator, useSelector, GlobalState, event, TOGGLE_AI_ASSISTANT, useDebounce } from "@kn/common";
import { ArrowRight, BanIcon, Book, Box, FileText, FilePlus, FolderPlus, LayoutGrid, Moon, Network, Plus, SearchIcon, Sparkles, Star, Sun, Sunset, Tag, Users, X, AlignLeft } from "@kn/icon";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CreateSpaceDlg } from "../components/SpaceForm";
import { PageItemIcon, type PageIconData } from "../SpaceDetail/components/PageItemIcon";
import { PagePreviewCard, PagePreviewProvider } from "./PagePreviewCard";
import { SpaceGraph } from "../SpaceGraph";
import { CreatePageTypeMenu, createPageByType } from "../../components/CreatePageTypeMenu";
import { useTranslation } from "@kn/common";
import { format, parseISO, formatDistanceToNow } from "@kn/ui";


// Accent helpers. Icons carry the color directly — no chip backgrounds, so
// the surfaces stay neutral and the color reads as an accent, not a block.
const chipStyle = (hue: number): React.CSSProperties => ({
    color: "hsl(" + hue + " 72% 70%)",
})

// Curated space palette (mirrors the relation graph) for stable per-space color.
const SPACE_PALETTE = [
    "#337EA9", "#448361", "#D9730D", "#9065B0", "#C14C8A",
    "#CB912F", "#D44C47", "#548164", "#5B97BD", "#787774",
]
const hashIndex = (value: string, modulo: number): number => {
    let h = 0
    for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) >>> 0
    return h % modulo
}
const spaceAccent = (id?: string): string =>
    id ? SPACE_PALETTE[hashIndex(id, SPACE_PALETTE.length)] : "#5B97BD"
const tagHue = (tag: string): number => hashIndex(tag, 360)
const colorChipStyle = (color: string): React.CSSProperties => ({ color })

const relativeTime = (value?: DateTimeValue): string => {
    if (value == null) return ""
    const text = String(value)
    try {
        const date = typeof value === "number" ? new Date(value) : parseISO(value)
        return formatDistanceToNow(date, { addSuffix: true })
    } catch {
        try {
            const date = typeof value === "number" ? new Date(value) : parseISO(value)
            return format(date, "MM/dd/yyyy")
        } catch {
            return text
        }
    }
}

const asPageIcon = (icon: unknown): PageIconData | undefined => {
    if (!icon || typeof icon !== "object") return undefined
    const value = icon as Partial<PageIconData>
    return typeof value.icon === "string" ? value as PageIconData : undefined
}

const metadataText = (metadata: Record<string, unknown> | undefined, key: string): string | undefined => {
    const value = metadata?.[key]
    return typeof value === "string" ? value : undefined
}

/** Build a short snippet centered on the first keyword occurrence */
function makeSnippet(text: string, keyword: string, radius = 40): string {
    if (!text) return ''
    const idx = text.toLowerCase().indexOf(keyword.toLowerCase())
    if (idx < 0) return text.length > radius * 2 ? text.slice(0, radius * 2) + '…' : text
    const start = Math.max(0, idx - radius)
    const end = Math.min(text.length, idx + keyword.length + radius)
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

/** Highlight keyword occurrences inside a snippet */
const Highlighted: React.FC<{ text: string; keyword: string }> = ({ text, keyword }) => {
    if (!keyword) return <>{text}</>
    const parts = text.split(new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
    return (
        <>
            {parts.map((part, i) =>
                part.toLowerCase() === keyword.toLowerCase()
                    ? <mark key={i} className="bg-primary/20 text-foreground rounded-[2px] px-0">{part}</mark>
                    : <React.Fragment key={i}>{part}</React.Fragment>
            )}
        </>
    )
}


export const Home: React.FC = () => {

    const isMobile = useIsMobile()
    const [recentSpaces, setRecentSpaces] = useState<Space[]>([])
    const [teamSpaces, setTeamSpaces] = useState<Space[]>([])
    const [recentPages, setRecentPages] = useState<PageSummary[]>([])
    const [favoritePages, setFavoritePages] = useState<PageSummary[]>([])
    const [flag, setFlag] = useState(0)
    const [loading, setLoading] = useState(true)
    const [creatingPage, setCreatingPage] = useState(false)
    const [graphOpen, setGraphOpen] = useState(false)
    const [activeTab, setActiveTab] = useState("recent")
    const [currentHour, setCurrentHour] = useState(new Date().getHours())
    const navigator = useNavigator()
    const service = useSpacePageService()
    const { t, i18n } = useTranslation()
    const { userInfo } = useSelector((state: GlobalState) => state)

    // Search + tag-filter state for the tab sections. Space/page queries are
    // debounced and resolved server-side; the page tag filter and the favorites
    // filter run client-side.
    const [spaceQuery, setSpaceQuery] = useState("")
    const [pageQuery, setPageQuery] = useState("")
    const [favQuery, setFavQuery] = useState("")
    const [selectedTags, setSelectedTags] = useState<string[]>([])
    const debouncedSpaceQuery = useDebounce(spaceQuery, { wait: 400 })
    const debouncedPageQuery = useDebounce(pageQuery, { wait: 400 })
    const [spacesLoading, setSpacesLoading] = useState(true)
    const [pagesLoading, setPagesLoading] = useState(true)

    // Content (block-level) search — cross-space full-text search over
    // page block contents, debounced and resolved server-side.
    const [contentQuery, setContentQuery] = useState("")
    const debouncedContentQuery = useDebounce(contentQuery, { wait: 400 })
    const [blockResults, setBlockResults] = useState<BlockSummary[]>([])
    const [contentLoading, setContentLoading] = useState(false)

    // Update current hour every minute to adapt to time changes
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentHour(new Date().getHours())
        }, 60000)
        return () => clearInterval(timer)
    }, [])

    useEffect(() => {
        const refresh = () => setFlag(value => value + 1)
        const unsubscribers = [
            service.changes.subscribe("space.created", refresh),
            service.changes.subscribe("space.updated", refresh),
            service.changes.subscribe("space.deleted", refresh),
            service.changes.subscribe("space.archived", refresh),
            service.changes.subscribe("space.unarchived", refresh),
            service.changes.subscribe("space.favorite.changed", refresh),
            service.changes.subscribe("page.created", refresh),
            service.changes.subscribe("page.updated", refresh),
            service.changes.subscribe("page.deleted", refresh),
            service.changes.subscribe("page.trashed", refresh),
            service.changes.subscribe("page.restoredFromTrash", refresh),
            service.changes.subscribe("page.favorite.changed", refresh),
        ]
        return () => unsubscribers.forEach(unsubscribe => unsubscribe())
    }, [service])

    const isMorning = currentHour >= 5 && currentHour < 12
    const isAfternoon = currentHour >= 12 && currentHour < 18

    const getGreeting = () => {
        if (isMorning) return t("home.greeting.morning") || "Good morning"
        if (isAfternoon) return t("home.greeting.afternoon") || "Good afternoon"
        return t("home.greeting.evening") || "Good evening"
    }

    // Notion favors an emoji-like symbol next to the greeting rather than a
    // colored icon tile. We keep the lucide icon but render it larger and
    // without a colored plate so it feels closer to a page emoji.
    const getGreetingIcon = () => {
        if (isMorning) return <Sun className="h-8 w-8 text-amber-500" strokeWidth={1.6} />
        if (isAfternoon) return <Sunset className="h-8 w-8 text-orange-500" strokeWidth={1.6} />
        return <Moon className="h-8 w-8 text-indigo-400" strokeWidth={1.6} />
    }

    // Team spaces + favorites load once (and on manual refresh via `flag`).
    useEffect(() => {
        setLoading(true)
        Promise.all([
            service.spaces.querySpaces({ template: false, pageSize: 8, type: 'COLLABORATION' }),
            service.pages.queryFavoritePages({ pageSize: 12 })
        ]).then(([teamResult, favoritesResult]) => {
            setTeamSpaces(teamResult.records)
            setFavoritePages(favoritesResult.records)
        }).finally(() => {
            setLoading(false)
        })
    }, [flag, service])

    // Recent spaces — name search resolved server-side; fetch a wider set while
    // searching so matches beyond the first few are reachable.
    useEffect(() => {
        setSpacesLoading(true)
        const searching = debouncedSpaceQuery.trim().length > 0
        service.spaces.querySpaces({
            template: false,
            pageSize: searching ? 12 : 8,
            ...(searching ? { searchValue: debouncedSpaceQuery.trim() } : {}),
        }).then((result) => {
            setRecentSpaces(result.records)
        }).catch(() => {
            setRecentSpaces([])
        }).finally(() => {
            setSpacesLoading(false)
        })
    }, [debouncedSpaceQuery, flag, service])

    // Recent pages — title search resolved server-side. Fetch a wider candidate
    // pool so the client-side tag filter has enough rows to match against.
    useEffect(() => {
        setPagesLoading(true)
        const searching = debouncedPageQuery.trim().length > 0
        service.pages.queryRecentPages({
            pageSize: 20,
            ...(searching ? { searchValue: debouncedPageQuery.trim() } : {}),
        }).then((result) => {
            setRecentPages(result.records)
        }).catch(() => {
            setRecentPages([])
        }).finally(() => {
            setPagesLoading(false)
        })
    }, [debouncedPageQuery, flag, service])

    // Block-level content search — uses Redis RediSearch (SEARCH_BLOCKS) for
    // fast full-text retrieval across all spaces. Falls back to MySQL LIKE
    // automatically on the backend when Redis is unavailable.
    // Title blocks are excluded since they duplicate the page-title search.
    useEffect(() => {
        const kw = debouncedContentQuery.trim()
        if (!kw) {
            setBlockResults([])
            setContentLoading(false)
            return
        }
        setContentLoading(true)
        service.relations.searchBlocks({ keyword: kw })
            .then((records) => {
                setBlockResults(records.filter((block) => block.type !== 'title' && block.text))
            })
            .catch(() => setBlockResults([]))
            .finally(() => setContentLoading(false))
    }, [debouncedContentQuery, service])

    const contentSearching = debouncedContentQuery.trim().length > 0

    // Pages edited within the last 7 days — small confidence-building stat.
    const weekEditedCount = recentPages.filter((page) => {
        if (page.updateTime == null) return false
        try {
            const updatedAt = typeof page.updateTime === "number" ? new Date(page.updateTime) : parseISO(page.updateTime)
            return Date.now() - updatedAt.getTime() < 7 * 24 * 60 * 60 * 1000
        } catch {
            return false
        }
    }).length

    // Distinct tags across the loaded recent pages — drives the filter chips.
    const availableTags = useMemo(() => {
        const set = new Set<string>()
        recentPages.forEach((page) => {
            (page.tags || []).forEach((tg) => {
                if (tg) set.add(tg)
            })
        })
        return Array.from(set)
    }, [recentPages])

    // Client-side tag filter (OR: keep pages carrying any selected tag). The
    // title search is applied server-side, so `recentPages` already reflects it.
    const filteredPages = useMemo(() => {
        if (selectedTags.length === 0) return recentPages
        return recentPages.filter((page) =>
            Array.isArray(page.tags) && page.tags.some((tag) => selectedTags.includes(tag))
        )
    }, [recentPages, selectedTags])

    // Favorites load in one shot, so title matching runs client-side with no
    // debounce — and lets the tab keep the same search-first row rhythm as
    // the other tabs.
    const filteredFavorites = useMemo(() => {
        const q = favQuery.trim().toLowerCase()
        if (!q) return favoritePages
        return favoritePages.filter((page) => page.title.toLowerCase().includes(q))
    }, [favoritePages, favQuery])

    const spaceSearching = debouncedSpaceQuery.trim().length > 0
    const pageSearching = debouncedPageQuery.trim().length > 0
    const favSearching = favQuery.trim().length > 0

    // Spaces tab rows — recent and team spaces merged into one flat list,
    // deduped by id. While searching, only the server-side matches show.
    const spaceRows = useMemo(() => {
        const seen = new Set<string>()
        const rows: { space: Space; isTeam: boolean }[] = []
        recentSpaces.forEach((space) => {
            if (seen.has(space.id)) return
            seen.add(space.id)
            rows.push({ space, isTeam: space.type === "COLLABORATION" })
        })
        if (!spaceSearching) {
            teamSpaces.forEach((space) => {
                if (seen.has(space.id)) return
                seen.add(space.id)
                rows.push({ space, isTeam: true })
            })
        }
        return rows
    }, [recentSpaces, teamSpaces, spaceSearching])

    // Keep the default tab view tidy (top 12); show every match while filtering.
    const displayedPages = useMemo(() => {
        const active = pageSearching || selectedTags.length > 0
        return active ? filteredPages : filteredPages.slice(0, 12)
    }, [filteredPages, pageSearching, selectedTags.length])

    const toggleTag = useCallback((tag: string) => {
        setSelectedTags((prev) =>
            prev.includes(tag) ? prev.filter((tg) => tg !== tag) : [...prev, tag]
        )
    }, [])

    // Create a fresh page in the user's personal space, then open it.
    const handleNewPage = async (pageType?: ResolvedPageType) => {
        if (creatingPage) return
        setCreatingPage(true)
        try {
            const personal = await service.spaces.getPersonalSpace()
            const spaceId = personal.id
            const page = await createPageByType({
                service,
                spaceId,
                parentId: "0",
                pageType,
                locale: i18n?.language,
                translate: (key, fallback) => t(key, fallback),
            })
            navigator.go({ to: `/space-detail/${spaceId}/page/edit/${page.id}` })
        } catch (err) {
            console.error("Error creating page:", err)
        } finally {
            setCreatingPage(false)
        }
    }

    // Compact metric tile with a colored icon chip.
    const StatCard: React.FC<{ label: string; value: React.ReactNode; hint?: string; icon: React.ReactNode; hue: number }> = ({ label, value, hint, icon, hue }) => (
        <Card className="group relative overflow-hidden border-border/60 shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:border-border">
            <span
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: "hsl(" + hue + " 70% 62% / 0.7)" }}
            />
            <CardContent className="flex items-center gap-3 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center" style={chipStyle(hue)}>
                    {icon}
                </span>
                <div className="min-w-0">
                    <div className="text-xs font-medium text-muted-foreground">{label}</div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-xl font-semibold tracking-tight">{value}</span>
                        {hint && <span className="text-[11px] text-muted-foreground/70">{hint}</span>}
                    </div>
                </div>
            </CardContent>
        </Card>
    )

    // Right-rail section card with a compact header.
    const RailCard: React.FC<{
        title: string
        count?: number
        icon?: React.ReactNode
        hue?: number
        action?: React.ReactNode
        children: React.ReactNode
    }> = ({ title, count, icon, hue, action, children }) => (
        <Card className="border-border/60 shadow-none transition-colors hover:border-border">
            <div className="flex items-center justify-between px-4 pb-1.5 pt-3.5">
                <div className="flex items-center gap-2">
                    {icon && hue != null && (
                        <span className="flex h-5 w-5 items-center justify-center" style={chipStyle(hue)}>{icon}</span>
                    )}
                    <span className="text-sm font-semibold">{title}</span>
                    {count != null && count > 0 && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{count}</span>
                    )}
                </div>
                {action}
            </div>
            <div className="px-1.5 pb-2">{children}</div>
        </Card>
    )

    const rowClass = "group/row flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 transition-colors hover:bg-muted/60"
    const iconChipClass = "flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground"

    return (
        <div className="h-full overflow-auto bg-background">
            <style>{".home-hscroll::-webkit-scrollbar{display:none}.home-hscroll{scrollbar-width:none;-ms-overflow-style:none}@keyframes knHomeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}.kn-home-in{animation:knHomeIn .45s cubic-bezier(.22,1,.36,1) both}.kn-home-in-2{animation-delay:.07s}.kn-home-in-3{animation-delay:.14s}@media (prefers-reduced-motion: reduce){.kn-home-in{animation:none}}"}</style>
            <div className="mx-auto flex w-full max-w-[1120px] flex-col px-5 pb-16 pt-10 md:px-8">
                {/* Greeting + primary actions */}
                <header className="kn-home-in flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                    <div>
                        <h1 className="text-[26px] font-semibold leading-tight tracking-tight md:text-[30px]">
                            {getGreeting()}{userInfo?.name ? "，" + userInfo.name : ""}
                        </h1>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {format(new Date(), "EEEE, MMMM d")}
                            <span className="mx-2 text-muted-foreground/40">·</span>
                            {t("home.week-stat", { count: weekEditedCount })}
                        </p>
                        <span
                            className="mt-3 block h-[3px] w-12 rounded-full"
                            style={{ background: "hsl(212 90% 62%)" }}
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <CreatePageTypeMenu onCreate={handleNewPage} disabled={creatingPage}>
                            <span data-tour="home-new-page">
                                <Button size="sm" variant="outline" disabled={creatingPage}>
                                    {creatingPage
                                        ? <span className="mr-1.5 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                        : <span className="mr-1.5 flex h-5 w-5 items-center justify-center" style={chipStyle(212)}><FilePlus className="h-4 w-4" /></span>}
                                    {t("home.new-page") || "New Page"}
                                </Button>
                            </span>
                        </CreatePageTypeMenu>
                        <CreateSpaceDlg
                            trigger={
                                <Button size="sm" variant="outline" data-tour="home-new-space">
                                    <span className="mr-1.5 flex h-5 w-5 items-center justify-center" style={chipStyle(168)}><FolderPlus className="h-4 w-4" /></span>
                                    {t("home.create-space") || "New Space"}
                                </Button>
                            }
                            callBack={() => setFlag(f => f + 1)}
                        />
                        <Button size="sm" variant="outline" onClick={() => navigator.go({ to: "/all-spaces" })} data-tour="home-all-spaces">
                            <span className="mr-1.5 flex h-5 w-5 items-center justify-center" style={chipStyle(28)}><LayoutGrid className="h-4 w-4" /></span>
                            {t("home.all-spaces") || "All Spaces"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => event.emit(TOGGLE_AI_ASSISTANT)} data-tour="home-ai">
                            <span className="mr-1.5 flex h-5 w-5 items-center justify-center" style={chipStyle(276)}><Sparkles className="h-4 w-4" /></span>
                            {t("home.ai-assistant") || "AI Assistant"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setGraphOpen(true)}>
                            <span className="mr-1.5 flex h-5 w-5 items-center justify-center" style={chipStyle(200)}><Network className="h-4 w-4" /></span>
                            {t("home.relation-graph") || "Relation Graph"}
                        </Button>
                    </div>
                </header>

                {/* Overview strip */}
                <div className="kn-home-in kn-home-in-2 mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <StatCard label={t("home.recent-pages")} value={recentPages.length} icon={<FileText className="h-5 w-5" />} hue={212} />
                    <StatCard label={t("home.rs")} value={spaceRows.length} hint={teamSpaces.length > 0 ? teamSpaces.length + " " + t("home.team-badge") : undefined} icon={<LayoutGrid className="h-5 w-5" />} hue={28} />
                    <StatCard label={t("home.favorites")} value={favoritePages.length} icon={<Star className="h-5 w-5" />} hue={42} />
                    <StatCard label={t("home.stat-week")} value={weekEditedCount} icon={<Sparkles className="h-5 w-5" />} hue={276} />
                </div>

                {/* Content: main feed + right rail */}
                <div className="kn-home-in kn-home-in-3 mt-5 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
                    <Card className="border-border/60 shadow-none transition-colors hover:border-border">
                        <Tabs value={activeTab} onValueChange={setActiveTab}>
                            <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
                                <TabsList className="h-8 gap-1 bg-transparent p-0">
                                    <TabsTrigger
                                        value="recent"
                                        className="h-7 gap-1.5 rounded-md px-2.5 text-xs font-medium data-[state=active]:bg-muted data-[state=active]:shadow-none"
                                    >
                                        {t("home.recent-pages")}
                                        {displayedPages.length > 0 && (
                                            <span className="text-[11px] text-muted-foreground/70">{displayedPages.length}</span>
                                        )}
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="content"
                                        className="h-7 gap-1.5 rounded-md px-2.5 text-xs font-medium data-[state=active]:bg-muted data-[state=active]:shadow-none"
                                    >
                                        {t("home.content-search")}
                                        {blockResults.length > 0 && (
                                            <span className="text-[11px] text-muted-foreground/70">{blockResults.length}</span>
                                        )}
                                    </TabsTrigger>
                                </TabsList>
                            </div>

                            {/* Recent pages */}
                            <TabsContent value="recent" className="m-0 flex flex-col gap-2 px-4 pb-4 pt-1">
                                <Input
                                    className="h-8 text-[13px]"
                                    icon={<SearchIcon className="h-3.5 w-3.5" />}
                                    placeholder={t("home.search-pages", "Search pages...")}
                                    value={pageQuery}
                                    onChange={(e) => setPageQuery(e.target.value)}
                                    aria-label={t("home.search-pages", "Search pages...")}
                                />
                                {availableTags.length > 0 && (
                                    <div className="home-hscroll -mx-1 flex items-center gap-1.5 overflow-x-auto px-1">
                                        <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                                        {availableTags.map((tag) => {
                                            const active = selectedTags.includes(tag)
                                            return (
                                                <button
                                                    key={tag}
                                                    type="button"
                                                    onClick={() => toggleTag(tag)}
                                                    className={cn(
                                                        "shrink-0 rounded-full border border-transparent px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                                                        active ? "" : "hover:brightness-125"
                                                    )}
                                                    style={active
                                                        ? { backgroundColor: "hsl(" + tagHue(tag) + " 70% 58% / 0.32)", color: "hsl(" + tagHue(tag) + " 80% 84%)" }
                                                        : { backgroundColor: "hsl(" + tagHue(tag) + " 70% 58% / 0.13)", color: "hsl(" + tagHue(tag) + " 62% 72%)" }}
                                                >
                                                    {tag}
                                                </button>
                                            )
                                        })}
                                        {selectedTags.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setSelectedTags([])}
                                                className="flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                                            >
                                                <X className="h-3 w-3" />
                                                {t("home.clear-tags", "Clear")}
                                            </button>
                                        )}
                                    </div>
                                )}
                                {pagesLoading ? (
                                    <div className="flex flex-col">
                                        {[...Array(isMobile ? 4 : 6)].map((_, index) => (
                                            <div key={index} className="flex items-center gap-3 px-2.5 py-2">
                                                <Skeleton className="h-7 w-7 rounded-md" />
                                                <Skeleton className="h-4 w-1/2" />
                                                <Skeleton className="ml-auto h-3 w-16" />
                                            </div>
                                        ))}
                                    </div>
                                ) : displayedPages.length === 0 ? (
                                    pageSearching || selectedTags.length > 0 ? (
                                        <EmptyBlock icon={<SearchIcon className="h-5 w-5" />} title={t("home.no-page-match", "No matching pages")} />
                                    ) : (
                                        <EmptyBlock icon={<Book className="h-5 w-5" />} title={t("home.no-recent-pages")} desc={t("home.no-recent-pages-hint")} />
                                    )
                                ) : (
                                    <PagePreviewProvider>
                                        <ul className="flex flex-col">
                                            {displayedPages.map((page: any) => (
                                                <PagePreviewCard
                                                    key={page.id}
                                                    pageId={page.id}
                                                    title={page.title}
                                                    spaceName={page.spaceName}
                                                    icon={page.icon}
                                                    pageType={page.pageType}
                                                    disabled={isMobile}
                                                    onOpenPage={() => navigator.go({ to: "/space-detail/" + page.spaceId + "/page/edit/" + page.id })}
                                                >
                                                    <li
                                                        onClick={() => navigator.go({ to: "/space-detail/" + page.spaceId + "/page/edit/" + page.id })}
                                                        className={rowClass}
                                                    >
                                                        <span className={iconChipClass}>
                                                            {page.icon?.icon ? <PageItemIcon icon={page.icon} size={16} /> : <FileText className="h-4 w-4" />}
                                                        </span>
                                                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/90 group-hover/row:text-foreground">
                                                            {page.title || t("home.untitled")}
                                                        </span>
                                                        {Array.isArray(page.tags) && page.tags.length > 0 && (
                                                            <span className="hidden shrink-0 items-center gap-1 md:flex">
                                                                {page.tags.slice(0, 2).map((tg: string) => (
                                                                    <span key={tg} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{tg}</span>
                                                                ))}
                                                            </span>
                                                        )}
                                                        <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                                                            {relativeTime(page.updateTime) || t("home.last-update")}
                                                        </span>
                                                    </li>
                                                </PagePreviewCard>
                                            ))}
                                        </ul>
                                    </PagePreviewProvider>
                                )}
                            </TabsContent>

                            {/* Content search */}
                            <TabsContent value="content" className="m-0 flex flex-col gap-2 px-4 pb-4 pt-1">
                                <Input
                                    className="h-8 text-[13px]"
                                    icon={<SearchIcon className="h-3.5 w-3.5" />}
                                    placeholder={t("home.search-content", "Search content...")}
                                    value={contentQuery}
                                    onChange={(e) => setContentQuery(e.target.value)}
                                    aria-label={t("home.search-content", "Search content...")}
                                />
                                {contentLoading ? (
                                    <div className="flex flex-col">
                                        {[...Array(isMobile ? 4 : 6)].map((_, index) => (
                                            <div key={index} className="flex items-center gap-3 px-2.5 py-2">
                                                <Skeleton className="h-7 w-7 rounded-md" />
                                                <div className="flex-1">
                                                    <Skeleton className="h-4 w-3/5" />
                                                    <Skeleton className="mt-1.5 h-3 w-1/4" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : blockResults.length === 0 ? (
                                    contentSearching ? (
                                        <EmptyBlock icon={<SearchIcon className="h-5 w-5" />} title={t("home.no-content-match", "No matching content")} />
                                    ) : (
                                        <EmptyBlock icon={<AlignLeft className="h-5 w-5" />} title={t("home.content-search")} desc={t("home.content-empty", "Type to search across all page content")} />
                                    )
                                ) : (
                                    <ul className="flex flex-col">
                                        {blockResults.map((block: any) => (
                                            <li
                                                key={block.id}
                                                onClick={() => navigator.go({ to: "/space-detail/" + block.spaceId + "/page/edit/" + block.pageId })}
                                                className={cn(rowClass, "items-start")}
                                            >
                                                <span className={iconChipClass}><AlignLeft className="h-4 w-4" /></span>
                                                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                    <span className="truncate text-sm text-foreground/90 group-hover/row:text-foreground">
                                                        <Highlighted text={makeSnippet(block.text, debouncedContentQuery.trim())} keyword={debouncedContentQuery.trim()} />
                                                    </span>
                                                    {(block.pageTitle || block.spaceName) && (
                                                        <span className="truncate text-xs text-muted-foreground">
                                                            {block.pageTitle}
                                                            {block.pageTitle && block.spaceName && <span className="text-muted-foreground/40"> · </span>}
                                                            {block.spaceName}
                                                        </span>
                                                    )}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </TabsContent>
                        </Tabs>
                    </Card>

                    {/* Right rail */}
                    <div className="flex flex-col gap-4">
                        <RailCard
                            title={t("home.rs")}
                            count={spaceRows.length}
                            icon={<LayoutGrid className="h-3.5 w-3.5" />}
                            hue={28}
                            action={
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                                    onClick={() => navigator.go({ to: "/all-spaces" })}
                                >
                                    {t("home.all")}
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </Button>
                            }
                        >
                            {(spacesLoading || loading) ? (
                                <div className="flex flex-col">
                                    {[...Array(4)].map((_, index) => (
                                        <div key={index} className="flex items-center gap-3 px-2.5 py-2">
                                            <Skeleton className="h-7 w-7 rounded-md" />
                                            <Skeleton className="h-4 w-1/2" />
                                        </div>
                                    ))}
                                </div>
                            ) : spaceRows.length === 0 ? (
                                <EmptyBlock icon={<Box className="h-5 w-5" />} title={t("home.no-spaces")} desc={t("home.no-spaces-hint")} />
                            ) : (
                                <ul className="flex flex-col">
                                    {spaceRows.slice(0, 5).map(({ space, isTeam }) => {
                                        const icon = asPageIcon(space.icon)
                                        return (
                                            <li
                                                key={space.id}
                                                onClick={() => navigator.go({ to: isTeam ? "/space-detail/" + space.id + "/home" : "/space-detail/" + space.id })}
                                                className={rowClass}
                                            >
                                                <span className="flex h-7 w-7 shrink-0 items-center justify-center" style={colorChipStyle(spaceAccent(space.id))}>
                                                    {icon ? <PageItemIcon icon={icon} size={16} /> : isTeam ? <Users className="h-4 w-4" /> : <Box className="h-4 w-4" />}
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-medium text-foreground/90">{space.name}</span>
                                                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                                        {isTeam && space.memberCount ? space.memberCount + " members" : relativeTime(space.updateTime)}
                                                    </span>
                                                </span>
                                                {isTeam && (
                                                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                                        {t("home.team-badge")}
                                                    </span>
                                                )}
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                        </RailCard>

                        <RailCard title={t("home.favorites")} count={filteredFavorites.length} icon={<Star className="h-3.5 w-3.5" />} hue={42}>
                            {loading ? (
                                <div className="flex flex-col">
                                    {[...Array(3)].map((_, index) => (
                                        <div key={index} className="flex items-center gap-3 px-2.5 py-2">
                                            <Skeleton className="h-7 w-7 rounded-md" />
                                            <Skeleton className="h-4 w-1/2" />
                                        </div>
                                    ))}
                                </div>
                            ) : filteredFavorites.length === 0 ? (
                                <EmptyBlock icon={<Star className="h-5 w-5" />} title={t("home.no-favorites")} desc={t("home.no-favorites-hint")} />
                            ) : (
                                <ul className="flex flex-col">
                                    {filteredFavorites.slice(0, 5).map((data: any) => (
                                        <PagePreviewCard
                                            key={data.id}
                                            pageId={data.id}
                                            title={data.title}
                                            spaceName={data.spaceName}
                                            icon={data.icon}
                                            pageType={data.pageType}
                                            disabled={isMobile}
                                            onOpenPage={() => navigator.go({ to: "/space-detail/" + data.spaceId + "/page/edit/" + data.id })}
                                        >
                                            <li
                                                className={rowClass}
                                                onClick={() => navigator.go({ to: "/space-detail/" + data.spaceId + "/page/edit/" + data.id })}
                                            >
                                                <span className={iconChipClass}>
                                                    {data.icon?.icon ? <PageItemIcon icon={data.icon} size={16} /> : <FileText className="h-4 w-4" />}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/90">{data.title}</span>
                                                <Star className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
                                            </li>
                                        </PagePreviewCard>
                                    ))}
                                </ul>
                            )}
                        </RailCard>
                    </div>
                </div>
            </div>

            {/* Relation graph — lazily created inside a dialog. */}
            <Dialog open={graphOpen} onOpenChange={setGraphOpen}>
                <DialogContent className="flex h-[80vh] max-w-[min(1100px,92vw)] flex-col gap-0 p-0">
                    <DialogHeader className="border-b px-4 py-3 text-left">
                        <DialogTitle>{t("home.relation-graph")}</DialogTitle>
                    </DialogHeader>
                    <div className="min-h-0 flex-1">
                        {graphOpen && <SpaceGraph onNavigate={() => setGraphOpen(false)} />}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

// Compact, centered empty state used across sections.
const EmptyBlock: React.FC<{
    icon: React.ReactNode
    title: string
    desc?: string
    action?: React.ReactNode
}> = ({ icon, title, desc, action }) => (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 py-8 text-center">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted/60 text-muted-foreground">
            {icon}
        </div>
        <div className="flex flex-col items-center gap-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {desc && <p className="text-xs text-muted-foreground/70">{desc}</p>}
        </div>
        {action}
    </div>
)
