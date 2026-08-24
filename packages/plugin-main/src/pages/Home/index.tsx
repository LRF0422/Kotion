import { APIS } from "../../api";
import { Button, Card, CardContent, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger, cn, useIsMobile } from "@kn/ui";
import { useApi, useNavigator, useSelector, GlobalState, event, TOGGLE_AI_ASSISTANT, useDebounce } from "@kn/common";
import { Space } from "../../model/Space";
import { ArrowRight, BanIcon, Book, Box, FileText, FilePlus, FolderPlus, LayoutGrid, Moon, Network, Plus, SearchIcon, Sparkles, Star, Sun, Sunset, Tag, Users, X, AlignLeft } from "@kn/icon";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CreateSpaceDlg } from "../components/SpaceForm";
import { PageItemIcon } from "../SpaceDetail/components/PageItemIcon";
import { PagePreviewCard, PagePreviewProvider } from "./PagePreviewCard";
import { SpaceGraph } from "../SpaceGraph";
import { useTranslation } from "@kn/common";
import { format, parseISO, formatDistanceToNow } from "@kn/ui";


// Chip tint used by the hero quick actions — a soft translucent fill plus a
// matching foreground so the icon carries the only color on the page.
const hueStyles = (hue: number) => ({
    chip: {
        backgroundColor: `hsl(${hue} 70% 55% / 0.14)`,
        color: `hsl(${hue} 60% 48%)`,
    } as React.CSSProperties,
})

const relativeTime = (value?: string): string => {
    if (!value) return ""
    try {
        return formatDistanceToNow(parseISO(value), { addSuffix: true })
    } catch {
        try {
            return format(parseISO(value), "MM/dd/yyyy")
        } catch {
            return value
        }
    }
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
    const [recentPages, setRecentPages] = useState<any[]>([])
    const [favoritePages, setFavoritePages] = useState<any[]>([])
    const [flag, setFlag] = useState(0)
    const [loading, setLoading] = useState(true)
    const [creatingPage, setCreatingPage] = useState(false)
    const [graphOpen, setGraphOpen] = useState(false)
    const [activeTab, setActiveTab] = useState("recent")
    const [currentHour, setCurrentHour] = useState(new Date().getHours())
    const navigator = useNavigator()
    const { t } = useTranslation()
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
    const [blockResults, setBlockResults] = useState<any[]>([])
    const [contentLoading, setContentLoading] = useState(false)

    // Update current hour every minute to adapt to time changes
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentHour(new Date().getHours())
        }, 60000)
        return () => clearInterval(timer)
    }, [])

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
            useApi(APIS.QUERY_SPACE, { template: false, pageSize: 8, type: 'COLLABORATION' }),
            useApi(APIS.QUERY_FAVORITE, { pageSize: 12 })
        ]).then(([teamRes, favoritesRes]) => {
            setTeamSpaces(teamRes.data.records || [])
            const favData = favoritesRes?.data
            setFavoritePages(Array.isArray(favData) ? favData : (favData?.records || []))
        }).finally(() => {
            setLoading(false)
        })
    }, [flag])

    // Recent spaces — name search resolved server-side; fetch a wider set while
    // searching so matches beyond the first few are reachable.
    useEffect(() => {
        setSpacesLoading(true)
        const searching = debouncedSpaceQuery.trim().length > 0
        useApi(APIS.QUERY_SPACE, {
            template: false,
            pageSize: searching ? 12 : 8,
            ...(searching ? { searchValue: debouncedSpaceQuery.trim() } : {}),
        }).then((res) => {
            setRecentSpaces(res.data.records || [])
        }).catch(() => {
            setRecentSpaces([])
        }).finally(() => {
            setSpacesLoading(false)
        })
    }, [debouncedSpaceQuery, flag])

    // Recent pages — title search resolved server-side. Fetch a wider candidate
    // pool so the client-side tag filter has enough rows to match against.
    useEffect(() => {
        setPagesLoading(true)
        const searching = debouncedPageQuery.trim().length > 0
        useApi(APIS.QUERY_RECENT_PAGE, {
            pageSize: 20,
            ...(searching ? { searchValue: debouncedPageQuery.trim() } : {}),
        }).then((res) => {
            setRecentPages(res.data.records || [])
        }).catch(() => {
            setRecentPages([])
        }).finally(() => {
            setPagesLoading(false)
        })
    }, [debouncedPageQuery, flag])

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
        useApi(APIS.SEARCH_BLOCKS, { keyword: kw })
            .then((res) => {
                const records = (res?.data || []).filter((b: any) => b.type !== 'title' && b.text)
                setBlockResults(records)
            })
            .catch(() => setBlockResults([]))
            .finally(() => setContentLoading(false))
    }, [debouncedContentQuery])

    const contentSearching = debouncedContentQuery.trim().length > 0

    // Pages edited within the last 7 days — small confidence-building stat.
    const weekEditedCount = recentPages.filter((p: any) => {
        if (!p.updateTime) return false
        try {
            return Date.now() - parseISO(p.updateTime).getTime() < 7 * 24 * 60 * 60 * 1000
        } catch {
            return false
        }
    }).length

    // Distinct tags across the loaded recent pages — drives the filter chips.
    const availableTags = useMemo(() => {
        const set = new Set<string>()
        recentPages.forEach((p: any) => {
            (p.tags || []).forEach((tg: string) => {
                if (tg) set.add(tg)
            })
        })
        return Array.from(set)
    }, [recentPages])

    // Client-side tag filter (OR: keep pages carrying any selected tag). The
    // title search is applied server-side, so `recentPages` already reflects it.
    const filteredPages = useMemo(() => {
        if (selectedTags.length === 0) return recentPages
        return recentPages.filter((p: any) =>
            Array.isArray(p.tags) && p.tags.some((tg: string) => selectedTags.includes(tg))
        )
    }, [recentPages, selectedTags])

    // Favorites load in one shot, so title matching runs client-side with no
    // debounce — and lets the tab keep the same search-first row rhythm as
    // the other tabs.
    const filteredFavorites = useMemo(() => {
        const q = favQuery.trim().toLowerCase()
        if (!q) return favoritePages
        return favoritePages.filter((p: any) => (p.title || "").toLowerCase().includes(q))
    }, [favoritePages, favQuery])

    const spaceSearching = debouncedSpaceQuery.trim().length > 0
    const pageSearching = debouncedPageQuery.trim().length > 0
    const favSearching = favQuery.trim().length > 0

    // Spaces tab rows — recent and team spaces merged into one flat list,
    // deduped by id. While searching, only the server-side matches show.
    const spaceRows = useMemo(() => {
        const seen = new Set<string>()
        const rows: { space: any; isTeam: boolean }[] = []
        recentSpaces.forEach((space: any) => {
            if (seen.has(space.id)) return
            seen.add(space.id)
            rows.push({ space, isTeam: space.type === "COLLABORATION" })
        })
        if (!spaceSearching) {
            teamSpaces.forEach((space: any) => {
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
    const handleNewPage = async () => {
        if (creatingPage) return
        setCreatingPage(true)
        try {
            const personal = await useApi(APIS.PERSONAL_SPACE)
            const spaceId = personal.data.id
            const res = await useApi(APIS.CREATE_OR_SAVE_PAGE, null, {
                spaceId,
                parentId: "0",
                title: "Untitled",
            })
            navigator.go({ to: `/space-detail/${spaceId}/page/edit/${res.data.id}` })
        } catch (err) {
            console.error("Error creating page:", err)
        } finally {
            setCreatingPage(false)
        }
    }

    // Reusable quick-action button used in the hero. Notion-style: borderless,
    // subtle hover, chip icon carries the only color.
    const QuickAction: React.FC<{
        icon: React.ReactNode
        label: string
        hue: number
        onClick?: () => void
        loading?: boolean
        dataTour?: string
    }> = ({ icon, label, hue, onClick, loading: btnLoading, dataTour }) => {
        const styles = hueStyles(hue)
        return (
            <button
                type="button"
                onClick={onClick}
                disabled={btnLoading}
                data-tour={dataTour}
                className={cn(
                    "group inline-flex items-center gap-2 rounded-md px-2.5 py-1.5",
                    "text-left transition-colors duration-150",
                    "hover:bg-muted/60 active:bg-muted",
                    "disabled:opacity-60 disabled:cursor-not-allowed",
                    isMobile && "flex-1 justify-center"
                )}
            >
                <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                    style={styles.chip}
                >
                    {icon}
                </span>
                {!isMobile && <span className="text-[13px] font-medium text-foreground/80 group-hover:text-foreground truncate">{label}</span>}
            </button>
        )
    }

    // Small uppercase section header used above every content block. Kept as
    // a local helper so the whole page shares identical spacing/typography.
    const SectionHeader: React.FC<{
        title: string
        action?: React.ReactNode
    }> = ({ title, action }) => (
        <div className="flex items-center justify-between px-1">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
                {title}
            </h2>
            {action}
        </div>
    )

    return (
        <div className={cn(
            "flex justify-center pb-16 pt-2 overflow-auto h-full",
            isMobile && "px-4"
        )}>
            <style>{`
                @keyframes home-fade-up {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .home-fade-up { animation: home-fade-up 0.35s ease both; }
                /* Hide horizontal scrollbar on the recent-visited row while keeping it scrollable. */
                .home-hscroll::-webkit-scrollbar { display: none; }
                .home-hscroll { scrollbar-width: none; -ms-overflow-style: none; }
            `}</style>
            <div className={cn(
                "flex flex-col w-full",
                isMobile ? "gap-8" : "gap-10",
                !isMobile && "max-w-[860px]"
            )}>
                {/* Greeting — echoes the Notion page header: emoji-like icon,
                    large soft title, muted meta line beneath. */}
                <div className={cn(
                    "home-fade-up shrink-0",
                    isMobile ? "mt-6" : "mt-14"
                )}>
                    <div className="flex items-center gap-4">
                        <div className="shrink-0">
                            {getGreetingIcon()}
                        </div>
                        <div className="flex flex-col">
                            <h1 className={cn(
                                "font-semibold tracking-tight leading-tight",
                                isMobile ? "text-2xl" : "text-[34px]"
                            )}>
                                {getGreeting()}{userInfo?.name ? `, ${userInfo.name}` : ""}
                            </h1>
                            <p className="mt-1 text-[13px] text-muted-foreground">
                                {format(new Date(), "EEEE, MMMM d")}
                                {weekEditedCount > 0 && (
                                    <>
                                        <span className="mx-2 text-muted-foreground/40">·</span>
                                        <span className="text-foreground/70">
                                            {t("home.week-stat", { n: weekEditedCount })}
                                        </span>
                                    </>
                                )}
                            </p>
                        </div>
                    </div>

                    {/* Quick actions — flat, borderless pills. */}
                    <div className={cn(
                        "mt-5 flex gap-1",
                        isMobile ? "flex-row" : "flex-wrap",
                        !isMobile && "-ml-2.5"
                    )}>
                        <QuickAction
                            icon={creatingPage
                                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                : <FilePlus className="h-4 w-4" />}
                            label={t("home.new-page") || "New Page"}
                            hue={245}
                            onClick={handleNewPage}
                            loading={creatingPage}
                            dataTour="home-new-page"
                        />
                        <CreateSpaceDlg
                            trigger={
                                // Wrapper must mirror the other direct flex children so all
                                // four actions share width equally on mobile (flex-1 + flex
                                // lets the inner button stretch to fill this item).
                                <div className={cn(isMobile && "flex flex-1")} data-tour="home-new-space">
                                    <QuickAction
                                        icon={<FolderPlus className="h-4 w-4" />}
                                        label={t("home.create-space") || "New Space"}
                                        hue={168}
                                    />
                                </div>
                            }
                            callBack={() => setFlag(f => f + 1)}
                        />
                        <QuickAction
                            icon={<LayoutGrid className="h-4 w-4" />}
                            label={t("home.all-spaces") || "All Spaces"}
                            hue={25}
                            onClick={() => navigator.go({ to: "/all-spaces" })}
                            dataTour="home-all-spaces"
                        />
                        <QuickAction
                            icon={<Sparkles className="h-4 w-4" />}
                            label={t("home.ai-assistant") || "AI Assistant"}
                            hue={290}
                            onClick={() => event.emit(TOGGLE_AI_ASSISTANT)}
                            dataTour="home-ai"
                        />
                        <QuickAction
                            icon={<Network className="h-4 w-4" />}
                            label={t("home.relation-graph") || "Relation Graph"}
                            hue={190}
                            onClick={() => setGraphOpen(true)}
                        />
                    </div>
                </div>

                {/* Recent / Spaces / Favorites — merged into a single tabbed
                    block of flat list rows so the home stays dense and
                    scannable. */}
                <section className="flex flex-col shrink-0">
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <div className="flex items-center justify-between px-1">
                            <TabsList className="h-8 gap-1 bg-transparent p-0">
                                <TabsTrigger
                                    value="recent"
                                    className="h-7 gap-1.5 rounded-md px-2.5 text-[12px] font-medium data-[state=active]:bg-muted data-[state=active]:shadow-none"
                                >
                                    {t("home.recent-pages") || "Recent Pages"}
                                    {displayedPages.length > 0 && (
                                        <span className="text-[11px] text-muted-foreground/70">{displayedPages.length}</span>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger
                                    value="spaces"
                                    className="h-7 gap-1.5 rounded-md px-2.5 text-[12px] font-medium data-[state=active]:bg-muted data-[state=active]:shadow-none"
                                >
                                    {t("home.rs") || "Spaces"}
                                    {spaceRows.length > 0 && (
                                        <span className="text-[11px] text-muted-foreground/70">{spaceRows.length}</span>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger
                                    value="favorites"
                                    className="h-7 gap-1.5 rounded-md px-2.5 text-[12px] font-medium data-[state=active]:bg-muted data-[state=active]:shadow-none"
                                >
                                    {t("home.favorites") || "Favorites"}
                                    {filteredFavorites.length > 0 && (
                                        <span className="text-[11px] text-muted-foreground/70">{filteredFavorites.length}</span>
                                    )}
                                </TabsTrigger>
                                <TabsTrigger
                                    value="content"
                                    className="h-7 gap-1.5 rounded-md px-2.5 text-[12px] font-medium data-[state=active]:bg-muted data-[state=active]:shadow-none"
                                >
                                    {t("home.content-search") || "Content"}
                                    {blockResults.length > 0 && (
                                        <span className="text-[11px] text-muted-foreground/70">{blockResults.length}</span>
                                    )}
                                </TabsTrigger>
                            </TabsList>
                            {activeTab === "spaces" && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 gap-1 px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                                    onClick={() => navigator.go({ to: "/all-spaces" })}
                                >
                                    {t("home.all") || "View all"}
                                    <ArrowRight className="h-3 w-3" />
                                </Button>
                            )}
                        </div>

                        {/* Spaces — recent + team merged into flat list rows; a
                        tiny "Team" pill marks collaboration spaces. */}
                        <TabsContent value="spaces" className="mt-3 flex flex-col gap-2">
                            <div className="px-1">
                                <Input
                                    className="h-8 max-w-xs text-[13px]"
                                    icon={<SearchIcon className="h-3.5 w-3.5" />}
                                    placeholder={t("home.search-spaces", "Search spaces...")}
                                    value={spaceQuery}
                                    onChange={(e) => setSpaceQuery(e.target.value)}
                                    aria-label={t("home.search-spaces", "Search spaces...")}
                                />
                            </div>
                            {(spacesLoading || loading) ? (
                                <div className="flex flex-col">
                                    {[...Array(isMobile ? 4 : 5)].map((_, index) => (
                                        <div key={index} className="flex items-center gap-3 px-2 py-2">
                                            <Skeleton className="h-6 w-6 rounded-md" />
                                            <Skeleton className="h-4 flex-1 max-w-[50%]" />
                                            <Skeleton className="h-3 w-16" />
                                        </div>
                                    ))}
                                </div>
                            ) : spaceRows.length === 0 ? (
                                spaceSearching ? (
                                    <EmptyBlock
                                        icon={<SearchIcon className="h-5 w-5" />}
                                        title={t("home.no-space-match", "No matching spaces")}
                                    />
                                ) : (
                                    <EmptyBlock
                                        icon={<Box className="h-5 w-5" />}
                                        title={t("home.no-spaces") || "No spaces yet"}
                                        desc={t("home.no-spaces-hint") || "Create a space to get started"}
                                        action={
                                            <CreateSpaceDlg
                                                trigger={
                                                    <Button size="sm" variant="outline" className="mt-2 gap-1.5 h-8 text-xs">
                                                        <Plus className="w-3.5 h-3.5" />{t("home.create-space") || "New Space"}
                                                    </Button>
                                                }
                                                callBack={() => setFlag(f => f + 1)}
                                            />
                                        }
                                    />
                                )
                            ) : (
                                <ul className="flex flex-col">
                                    {spaceRows.map(({ space, isTeam }) => {
                                        return (
                                            <li
                                                key={space.id}
                                                onClick={() => navigator.go({ to: isTeam ? `/space-detail/${space.id}/home` : `/space-detail/${space.id}` })}
                                                className={cn(
                                                    "group flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5",
                                                    "transition-colors duration-100 hover:bg-muted/60"
                                                )}
                                            >
                                                <span className="flex h-6 w-6 shrink-0 items-center justify-center leading-none text-muted-foreground">
                                                    {space.icon?.icon
                                                        ? <PageItemIcon icon={space.icon} size={16} />
                                                        : isTeam
                                                            ? <Users className="h-4 w-4" />
                                                            : <Box className="h-4 w-4" />}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-foreground/90 group-hover:text-foreground">
                                                    {space.name}
                                                </span>
                                                {isTeam && (
                                                    <span className="shrink-0 rounded bg-muted/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                                        {t("home.team-badge") || "Team"}
                                                    </span>
                                                )}
                                                <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:flex">
                                                    {isTeam && space.memberCount ? `${space.memberCount} members` : relativeTime(space.updateTime)}
                                                </span>
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                        </TabsContent>

                        {/* Recent Pages — Notion-style flat list rows: no card, no
                        border, just a hover surface, an emoji-style icon and a
                        right-aligned timestamp. */}
                        <TabsContent value="recent" className="mt-3 flex flex-col gap-2">
                            <div className="flex flex-col gap-2 px-1">
                                <Input
                                    className="h-8 max-w-xs text-[13px]"
                                    icon={<SearchIcon className="h-3.5 w-3.5" />}
                                    placeholder={t("home.search-pages", "Search pages...")}
                                    value={pageQuery}
                                    onChange={(e) => setPageQuery(e.target.value)}
                                    aria-label={t("home.search-pages", "Search pages...")}
                                />
                                {availableTags.length > 0 && (
                                    <div className="home-hscroll -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
                                        <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                                        {availableTags.map((tag) => {
                                            const active = selectedTags.includes(tag)
                                            return (
                                                <button
                                                    key={tag}
                                                    type="button"
                                                    onClick={() => toggleTag(tag)}
                                                    className={cn(
                                                        "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                                                        active
                                                            ? "bg-primary text-primary-foreground"
                                                            : "bg-muted/60 text-muted-foreground hover:bg-muted"
                                                    )}
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
                            </div>
                            {pagesLoading ? (
                                <div className="flex flex-col">
                                    {[...Array(isMobile ? 4 : 5)].map((_, index) => (
                                        <div key={index} className="flex items-center gap-3 px-2 py-2">
                                            <Skeleton className="h-6 w-6 rounded-md" />
                                            <Skeleton className="h-4 flex-1 max-w-[50%]" />
                                            <Skeleton className="h-3 w-16" />
                                        </div>
                                    ))}
                                </div>
                            ) : displayedPages.length === 0 ? (
                                (pageSearching || selectedTags.length > 0) ? (
                                    <EmptyBlock
                                        icon={<SearchIcon className="h-5 w-5" />}
                                        title={t("home.no-page-match", "No matching pages")}
                                    />
                                ) : (
                                    <EmptyBlock
                                        icon={<Book className="h-5 w-5" />}
                                        title={t("home.no-recent-pages") || "No recent pages"}
                                        desc={t("home.no-recent-pages-hint") || "Pages you visit will appear here"}
                                    />
                                )
                            ) : (
                                <PagePreviewProvider>
                                    <ul className="flex flex-col">
                                        {displayedPages.map((page: any) => {
                                            return (
                                                // Hover shows an editor-rendered preview card (desktop only —
                                                // hover cards don't fit touch interaction).
                                                <PagePreviewCard
                                                    key={page.id}
                                                    pageId={page.id}
                                                    title={page.title}
                                                    spaceName={page.spaceName}
                                                    icon={page.icon}
                                                    disabled={isMobile}
                                                    onOpenPage={() => navigator.go({ to: `/space-detail/${page.spaceId}/page/edit/${page.id}` })}
                                                >
                                                    <li
                                                        onClick={() => navigator.go({ to: `/space-detail/${page.spaceId}/page/edit/${page.id}` })}
                                                        className={cn(
                                                            "group flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5",
                                                            "transition-colors duration-100 hover:bg-muted/60"
                                                        )}
                                                    >
                                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center leading-none text-muted-foreground">
                                                            {page.icon?.icon ? <PageItemIcon icon={page.icon} size={16} /> : <FileText className="h-4 w-4" />}
                                                        </span>
                                                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-foreground/90 group-hover:text-foreground">
                                                            {page.title || "Untitled"}
                                                        </span>
                                                        {Array.isArray(page.tags) && page.tags.length > 0 && (
                                                            <span className="hidden shrink-0 items-center gap-1 md:flex">
                                                                {page.tags.slice(0, 2).map((tg: string) => (
                                                                    <span
                                                                        key={tg}
                                                                        className="rounded bg-muted/70 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                                                    >
                                                                        {tg}
                                                                    </span>
                                                                ))}
                                                            </span>
                                                        )}
                                                        <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground sm:flex">
                                                            {page.updateBy && (
                                                                <span className="max-w-[120px] truncate text-foreground/50">
                                                                    {page.updateBy}
                                                                </span>
                                                            )}
                                                            {page.updateBy && page.updateTime && (
                                                                <span className="text-muted-foreground/40">·</span>
                                                            )}
                                                            <span>
                                                                {relativeTime(page.updateTime) || (t("home.last-update") || "Last update")}
                                                            </span>
                                                        </span>
                                                    </li>
                                                </PagePreviewCard>
                                            )
                                        })}
                                    </ul>
                                </PagePreviewProvider>
                            )}
                        </TabsContent>

                        {/* Favorite Pages — mirrors the recent-pages list layout so
                        every tab reads with the same rhythm. */}
                        <TabsContent value="favorites" className="mt-3 flex flex-col gap-2">
                            <div className="px-1">
                                <Input
                                    className="h-8 max-w-xs text-[13px]"
                                    icon={<SearchIcon className="h-3.5 w-3.5" />}
                                    placeholder={t("home.search-pages", "Search pages...")}
                                    value={favQuery}
                                    onChange={(e) => setFavQuery(e.target.value)}
                                    aria-label={t("home.search-pages", "Search pages...")}
                                />
                            </div>
                            {loading ? (
                                <div className="flex flex-col">
                                    {[...Array(3)].map((_, index) => (
                                        <div key={index} className="flex items-center gap-3 px-2 py-2">
                                            <Skeleton className="h-6 w-6 rounded-md" />
                                            <Skeleton className="h-4 flex-1 max-w-[40%]" />
                                            <Skeleton className="h-3 w-20" />
                                        </div>
                                    ))}
                                </div>
                            ) : filteredFavorites.length === 0 ? (
                                favSearching ? (
                                    <EmptyBlock
                                        icon={<SearchIcon className="h-5 w-5" />}
                                        title={t("home.no-page-match", "No matching pages")}
                                    />
                                ) : (
                                    <EmptyBlock
                                        icon={<Star className="h-5 w-5" />}
                                        title={t("home.no-favorites") || "No favorite pages yet"}
                                        desc={t("home.no-favorites-hint") || "Star pages to add them here"}
                                    />
                                )
                            ) : (
                                <PagePreviewProvider>
                                    <ul className="flex flex-col">
                                        {filteredFavorites.map((data: any) => {
                                            return (
                                                // Same hover preview as the recent list (desktop only).
                                                <PagePreviewCard
                                                    key={data.id}
                                                    pageId={data.id}
                                                    title={data.title}
                                                    spaceName={data.spaceName}
                                                    icon={data.icon}
                                                    disabled={isMobile}
                                                    onOpenPage={() => navigator.go({ to: `/space-detail/${data.spaceId}/page/edit/${data.id}` })}
                                                >
                                                    <li
                                                        className="group flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors duration-100 hover:bg-muted/60"
                                                        onClick={() => navigator.go({ to: `/space-detail/${data.spaceId}/page/edit/${data.id}` })}
                                                    >
                                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center leading-none text-muted-foreground">
                                                            {data.icon?.icon ? <PageItemIcon icon={data.icon} size={16} /> : <FileText className="h-4 w-4" />}
                                                        </span>
                                                        <span className="flex-1 truncate text-[13.5px] font-medium text-foreground/90 group-hover:text-foreground">
                                                            {data.title}
                                                        </span>
                                                        {data.updateTime && (
                                                            <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground sm:flex">
                                                                <Star className="h-3 w-3 text-amber-400/80" />
                                                                {relativeTime(data.updateTime)}
                                                            </span>
                                                        )}
                                                    </li>
                                                </PagePreviewCard>
                                            )
                                        })}
                                    </ul>
                                </PagePreviewProvider>
                            )}
                        </TabsContent>

                        {/* Content Search — block-level full-text search across all
                        spaces. Each hit shows a highlighted snippet with the
                        containing page title and space name. */}
                        <TabsContent value="content" className="mt-3 flex flex-col gap-2">
                            <div className="px-1">
                                <Input
                                    className="h-8 max-w-xs text-[13px]"
                                    icon={<SearchIcon className="h-3.5 w-3.5" />}
                                    placeholder={t("home.search-content", "Search content...")}
                                    value={contentQuery}
                                    onChange={(e) => setContentQuery(e.target.value)}
                                    aria-label={t("home.search-content", "Search content...")}
                                />
                            </div>
                            {contentLoading ? (
                                <div className="flex flex-col">
                                    {[...Array(isMobile ? 4 : 5)].map((_, index) => (
                                        <div key={index} className="flex items-center gap-3 px-2 py-2">
                                            <Skeleton className="h-6 w-6 rounded-md" />
                                            <div className="flex-1">
                                                <Skeleton className="h-4 max-w-[60%]" />
                                                <Skeleton className="mt-1 h-3 w-[30%]" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : blockResults.length === 0 ? (
                                contentSearching ? (
                                    <EmptyBlock
                                        icon={<SearchIcon className="h-5 w-5" />}
                                        title={t("home.no-content-match", "No matching content")}
                                    />
                                ) : (
                                    <EmptyBlock
                                        icon={<AlignLeft className="h-5 w-5" />}
                                        title={t("home.content-search") || "Content Search"}
                                        desc={t("home.content-empty", "Type to search across all page content")}
                                    />
                                )
                            ) : (
                                <ul className="flex flex-col">
                                    {blockResults.map((block: any) => (
                                        <li
                                            key={block.id}
                                            onClick={() => navigator.go({ to: `/space-detail/${block.spaceId}/page/edit/${block.pageId}` })}
                                            className={cn(
                                                "group flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5",
                                                "transition-colors duration-100 hover:bg-muted/60"
                                            )}
                                        >
                                            <span className="flex h-6 w-6 shrink-0 items-center justify-center leading-none text-muted-foreground">
                                                <AlignLeft className="h-4 w-4" />
                                            </span>
                                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                <span className="truncate text-[13.5px] text-foreground/90 group-hover:text-foreground">
                                                    <Highlighted text={makeSnippet(block.text, debouncedContentQuery.trim())} keyword={debouncedContentQuery.trim()} />
                                                </span>
                                                {(block.pageTitle || block.spaceName) && (
                                                    <span className="truncate text-[11px] text-muted-foreground">
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
                </section>

                {/* Learn Knowledge — muted callout in a dashed frame, kept
                    intentionally quiet so it never competes with the content. */}
                <section className="flex flex-col gap-2 shrink-0">
                    <SectionHeader title={t("home.learning") || "Learn"} />
                    <Card className="border-dashed border-border/60 bg-transparent shadow-none">
                        <CardContent className="flex items-center gap-3 py-4">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60">
                                <BanIcon className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <p className="text-[13px] text-muted-foreground">
                                {t("home.coming-soon-desc") || "This feature is coming soon, stay tuned!"}
                            </p>
                        </CardContent>
                    </Card>
                </section>
            </div>

            {/* Relation graph — rendered lazily inside a large dialog so the
                d3 simulation only spins up when the user actually opens it. */}
            <Dialog open={graphOpen} onOpenChange={setGraphOpen}>
                <DialogContent className="flex h-[80vh] max-w-[min(1100px,92vw)] flex-col gap-0 p-0">
                    <DialogHeader className="border-b px-4 py-3 text-left">
                        <DialogTitle>{t("home.relation-graph") || "Relation Graph"}</DialogTitle>
                    </DialogHeader>
                    <div className="min-h-0 flex-1">
                        {graphOpen && (
                            <SpaceGraph onNavigate={() => setGraphOpen(false)} />
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}


// Compact, centered empty state used across sections. Kept borderless and
// airy so it inherits the Notion aesthetic of the surrounding sections.
const EmptyBlock: React.FC<{
    icon: React.ReactNode
    title: string
    desc?: string
    action?: React.ReactNode
}> = ({ icon, title, desc, action }) => (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-muted/10 py-8 text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
            {icon}
        </div>
        <p className="text-[13px] font-medium">{title}</p>
        {desc && <p className="mt-1 text-[11px] text-muted-foreground">{desc}</p>}
        {action}
    </div>
)
