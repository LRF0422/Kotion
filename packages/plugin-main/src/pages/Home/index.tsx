import { APIS } from "../../api";
import { Button, Card, CardContent, Skeleton, cn, useIsMobile } from "@kn/ui";
import { useApi, useNavigator, useSelector, GlobalState, event, TOGGLE_AI_ASSISTANT } from "@kn/common";
import { Space } from "../../model/Space";
import { ArrowRight, BanIcon, Book, Box, Clock, FilePlus, FolderPlus, LayoutGrid, Moon, Plus, Sparkles, Star, Sun, Sunset } from "@kn/icon";
import React, { useEffect, useState } from "react";
import { CreateSpaceDlg } from "../components/SpaceForm";
import { useTranslation } from "@kn/common";
import { format, parseISO, formatDistanceToNow } from "@kn/ui";


// A curated palette of pleasant hues. Each space/page gets a deterministic
// color derived from its id so the home stays colorful but consistent.
const HUE_PALETTE = [245, 262, 290, 330, 350, 25, 40, 150, 168, 190, 215]

const pickHue = (key?: string): number => {
    if (!key) return HUE_PALETTE[0]
    let hash = 0
    for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) | 0
    }
    return HUE_PALETTE[Math.abs(hash) % HUE_PALETTE.length]
}

// Notion-style: flat surfaces, color lives only in the small icon chip.
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


export const Home: React.FC = () => {

    const isMobile = useIsMobile()
    const [recentSpaces, setRecentSpaces] = useState<Space[]>([])
    const [recentPages, setRecentPages] = useState<any[]>([])
    const [favoritePages, setFavoritePages] = useState<any[]>([])
    const [flag, setFlag] = useState(0)
    const [loading, setLoading] = useState(true)
    const [creatingPage, setCreatingPage] = useState(false)
    const [currentHour, setCurrentHour] = useState(new Date().getHours())
    const navigator = useNavigator()
    const { t } = useTranslation()
    const { userInfo } = useSelector((state: GlobalState) => state)

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
        if (isMorning) return t("home.greeting.morning") || "Good Morning"
        if (isAfternoon) return t("home.greeting.afternoon") || "Good Afternoon"
        return t("home.greeting.evening") || "Good Evening"
    }

    const getGreetingIcon = () => {
        if (isMorning) return <Sun className="h-6 w-6 text-amber-500" />
        if (isAfternoon) return <Sunset className="h-6 w-6 text-orange-500" />
        return <Moon className="h-6 w-6 text-indigo-400" />
    }

    // Small tinted square behind the time-of-day icon — the only color in the header.
    const heroIconBg = isMorning
        ? "bg-amber-500/10"
        : isAfternoon
            ? "bg-orange-500/10"
            : "bg-indigo-500/10"

    useEffect(() => {
        setLoading(true)
        Promise.all([
            useApi(APIS.QUERY_SPACE, { template: false, pageSize: 4 }),
            useApi(APIS.QUERY_RECENT_PAGE, { pageSize: 8 }),
            useApi(APIS.QUERY_FAVORITE, { pageSize: 8 })
        ]).then(([spacesRes, pagesRes, favoritesRes]) => {
            setRecentSpaces(spacesRes.data.records || [])
            setRecentPages(pagesRes.data.records || [])
            const favData = favoritesRes?.data
            setFavoritePages(Array.isArray(favData) ? favData : (favData?.records || []))
        }).finally(() => {
            setLoading(false)
        })
    }, [flag])

    // Pages edited within the last 7 days — small confidence-building stat.
    const weekEditedCount = recentPages.filter((p: any) => {
        if (!p.updateTime) return false
        try {
            return Date.now() - parseISO(p.updateTime).getTime() < 7 * 24 * 60 * 60 * 1000
        } catch {
            return false
        }
    }).length

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
                content: JSON.stringify({
                    type: "doc",
                    content: [
                        {
                            type: "title",
                            content: [
                                {
                                    type: "heading",
                                    content: [{ type: "text", text: "Untitled" }],
                                },
                            ],
                        },
                    ],
                }),
            })
            navigator.go({ to: `/space-detail/${spaceId}/page/edit/${res.data.id}` })
        } catch (err) {
            console.error("Error creating page:", err)
        } finally {
            setCreatingPage(false)
        }
    }

    // Reusable quick-action button used in the hero.
    const QuickAction: React.FC<{
        icon: React.ReactNode
        label: string
        hue: number
        onClick?: () => void
        loading?: boolean
    }> = ({ icon, label, hue, onClick, loading: btnLoading }) => {
        const styles = hueStyles(hue)
        return (
            <button
                type="button"
                onClick={onClick}
                disabled={btnLoading}
                className={cn(
                    "group flex items-center gap-2.5 rounded-md border border-border/60 bg-transparent px-3 py-2",
                    "text-left transition-colors duration-150 hover:bg-muted/60",
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
                {!isMobile && <span className="text-sm font-medium truncate">{label}</span>}
            </button>
        )
    }

    return (
        <div className={cn(
            "flex justify-center pb-10 pt-2 overflow-auto h-full",
            isMobile && "px-4"
        )}>
            <style>{`
                @keyframes home-fade-up {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .home-fade-up { animation: home-fade-up 0.35s ease both; }
            `}</style>
            <div className={cn(
                "flex flex-col gap-9 w-full",
                !isMobile && "max-w-[800px]"
            )}>
                {/* Greeting */}
                <div className={cn(
                    "home-fade-up shrink-0",
                    isMobile ? "mt-4" : "mt-8"
                )}>
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                            heroIconBg
                        )}>
                            {getGreetingIcon()}
                        </div>
                        <div className="flex flex-col">
                            <h1 className={cn(
                                "font-semibold tracking-tight",
                                isMobile ? "text-2xl" : "text-3xl"
                            )}>
                                {getGreeting()}{userInfo?.name ? `, ${userInfo.name}` : ""}
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                {format(new Date(), "EEEE, MMMM d")}
                                {weekEditedCount > 0 && (
                                    <>
                                        {" · "}
                                        <span className="text-foreground/70">
                                            {t("home.week-stat", { n: weekEditedCount })}
                                        </span>
                                    </>
                                )}
                            </p>
                        </div>
                    </div>

                    {/* Quick actions */}
                    <div className={cn(
                        "mt-4 flex gap-2",
                        isMobile ? "flex-row" : "flex-wrap"
                    )}>
                        <QuickAction
                            icon={creatingPage
                                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                : <FilePlus className="h-4 w-4" />}
                            label={t("home.new-page") || "New Page"}
                            hue={245}
                            onClick={handleNewPage}
                            loading={creatingPage}
                        />
                        <CreateSpaceDlg
                            trigger={
                                <div>
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
                        />
                        <QuickAction
                            icon={<Sparkles className="h-4 w-4" />}
                            label={t("home.ai-assistant") || "AI Assistant"}
                            hue={290}
                            onClick={() => event.emit(TOGGLE_AI_ASSISTANT)}
                        />
                    </div>
                </div>

                {/* Recent Spaces */}
                <section className="flex flex-col gap-3.5 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Clock size={14} className="text-muted-foreground" />
                            <h2 className="text-sm font-medium text-muted-foreground">{t("home.rs") || "Recent Spaces"}</h2>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => navigator.go({ to: "/all-spaces" })}
                        >
                            {t("home.all") || "View All"}
                            <ArrowRight className="h-3 w-3" />
                        </Button>
                    </div>
                    {loading ? (
                        <div className="grid gap-3 w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                            {[...Array(isMobile ? 2 : 4)].map((_, index) => (
                                <Skeleton key={index} className={cn("w-full rounded-lg", isMobile ? "h-[120px]" : "h-[128px]")} />
                            ))}
                        </div>
                    ) : recentSpaces.length === 0 ? (
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
                    ) : (
                        <div className="grid gap-3 w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                            {recentSpaces.map((space: any) => {
                                const hue = pickHue(space.id)
                                const styles = hueStyles(hue)
                                return (
                                    <button
                                        key={space.id}
                                        type="button"
                                        onClick={() => navigator.go({ to: `/space-detail/${space.id}` })}
                                        className={cn(
                                            "group relative flex flex-col items-start overflow-hidden rounded-lg border border-border/60 bg-card p-4 text-left",
                                            "transition-colors duration-150 hover:bg-muted/50",
                                            isMobile ? "h-[120px]" : "h-[128px]"
                                        )}
                                    >
                                        <span
                                            className="flex h-10 w-10 items-center justify-center rounded-lg text-2xl leading-none"
                                            style={styles.chip}
                                        >
                                            {space.icon?.icon || <Box className="h-5 w-5" />}
                                        </span>
                                        <div className="mt-auto w-full">
                                            <p className="truncate text-sm font-medium">{space.name}</p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {relativeTime(space.updateTime)}
                                            </p>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </section>

                {/* Recent Pages */}
                <section className="flex flex-col gap-3.5 shrink-0">
                    <div className="flex items-center gap-2">
                        <Clock size={14} className="text-muted-foreground" />
                        <h2 className="text-sm font-medium text-muted-foreground">{t("home.recent-pages") || "Recent Pages"}</h2>
                    </div>
                    {loading ? (
                        <div className="grid gap-3 w-full grid-cols-1 md:grid-cols-2">
                            {[...Array(isMobile ? 4 : 6)].map((_, index) => (
                                <Skeleton key={index} className="w-full h-[60px] rounded-lg" />
                            ))}
                        </div>
                    ) : recentPages.length === 0 ? (
                        <EmptyBlock
                            icon={<Book className="h-5 w-5" />}
                            title={t("home.no-recent-pages") || "No recent pages"}
                            desc={t("home.no-recent-pages-hint") || "Pages you visit will appear here"}
                        />
                    ) : (
                        <div className="grid gap-3 w-full grid-cols-1 md:grid-cols-2">
                            {recentPages.map((page: any) => {
                                const hue = pickHue(page.id)
                                const styles = hueStyles(hue)
                                return (
                                    <button
                                        key={page.id}
                                        type="button"
                                        onClick={() => navigator.go({ to: `/space-detail/${page.spaceId}/page/edit/${page.id}` })}
                                        className={cn(
                                            "group flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3 text-left",
                                            "transition-colors duration-150 hover:bg-muted/50"
                                        )}
                                    >
                                        <span
                                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg leading-none"
                                            style={styles.chip}
                                        >
                                            {page.icon?.icon || <Box className="h-4 w-4" />}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">{page.title || "Untitled"}</p>
                                            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                                                <Clock className="h-3 w-3 shrink-0" />
                                                <span className="truncate">
                                                    {page.updateBy
                                                        ? `${page.updateBy}${page.updateTime ? " · " + relativeTime(page.updateTime) : ""}`
                                                        : (relativeTime(page.updateTime) || (t("home.last-update") || "Last update"))}
                                                </span>
                                            </p>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </section>

                {/* Favorite Pages */}
                <section className="flex flex-col gap-3.5 shrink-0">
                    <div className="flex items-center gap-2">
                        <Star size={14} className="text-amber-500" />
                        <h2 className="text-sm font-medium text-muted-foreground">{t("home.favorites") || "Favorite Pages"}</h2>
                    </div>
                    {loading ? (
                        <div className="flex flex-col gap-1">
                            {[...Array(3)].map((_, index) => (
                                <div key={index} className="flex items-center gap-3 py-2">
                                    <Skeleton className="h-8 w-8 rounded-lg" />
                                    <Skeleton className="h-4 flex-1 max-w-[40%]" />
                                    <Skeleton className="h-3 w-20" />
                                </div>
                            ))}
                        </div>
                    ) : favoritePages.length === 0 ? (
                        <EmptyBlock
                            icon={<Star className="h-5 w-5" />}
                            title={t("home.no-favorites") || "No favorite pages yet"}
                            desc={t("home.no-favorites-hint") || "Star pages to add them here"}
                        />
                    ) : (
                        <ul className="flex flex-col gap-1">
                            {favoritePages.map((data: any) => {
                                const hue = pickHue(data.id)
                                const styles = hueStyles(hue)
                                return (
                                    <li
                                        key={data.id}
                                        className="flex items-center gap-3 rounded-md px-2 py-1.5 cursor-pointer transition-colors hover:bg-muted/60"
                                        onClick={() => navigator.go({ to: `/space-detail/${data.spaceId}/page/edit/${data.id}` })}
                                    >
                                        <span
                                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-base leading-none"
                                            style={styles.chip}
                                        >
                                            {data.icon?.icon || <Box className="h-4 w-4" />}
                                        </span>
                                        <span className="flex-1 truncate text-sm font-medium">{data.title}</span>
                                        {data.updateTime && (
                                            <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                                                <Clock className="h-3 w-3" />
                                                {relativeTime(data.updateTime)}
                                            </span>
                                        )}
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </section>

                {/* Learn Knowledge */}
                <section className="flex flex-col gap-3.5 shrink-0">
                    <div className="flex items-center gap-2">
                        <Book size={14} className="text-muted-foreground" />
                        <h2 className="text-sm font-medium text-muted-foreground">{t("home.learning") || "Learn Knowledge"}</h2>
                    </div>
                    <Card className="border-dashed bg-muted/20">
                        <CardContent className="flex items-center gap-3 py-4">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                                <BanIcon className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {t("home.coming-soon-desc") || "This feature is coming soon, stay tuned!"}
                            </p>
                        </CardContent>
                    </Card>
                </section>
            </div>
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
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-10 text-center">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {icon}
        </div>
        <p className="text-sm font-medium">{title}</p>
        {desc && <p className="mt-1 text-xs text-muted-foreground">{desc}</p>}
        {action}
    </div>
)
