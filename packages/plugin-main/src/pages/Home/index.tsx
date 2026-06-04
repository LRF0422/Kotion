import { APIS } from "../../api";
import { CardList } from "../components/CardList";
import { Button, Card, CardContent, EmptyState, Skeleton, cn, useIsMobile } from "@kn/ui";
import { useApi, useNavigator } from "@kn/common";
import { Space } from "../../model/Space";
import { BanIcon, Book, Box, Clock, LayoutTemplate, Moon, Plus, Star, Sun, Sunset } from "@kn/icon";
import React, { useEffect, useState } from "react";
import { CreateSpaceDlg } from "../components/SpaceForm";
import { useTranslation } from "@kn/common";
import { format, parseISO, formatDistanceToNow } from "@kn/ui";


export const Home: React.FC = () => {

    const isMobile = useIsMobile()
    const [recentSpaces, setRecentSpaces] = useState<Space[]>([])
    const [recentPages, setRecentPages] = useState<any[]>([])
    const [favoritePages, setFavoritePages] = useState<any[]>([])
    const [flag, setFlag] = useState(0)
    const [loading, setLoading] = useState(true)
    const [currentHour, setCurrentHour] = useState(new Date().getHours())
    const navigator = useNavigator()
    const { t } = useTranslation()

    // Update current hour every minute to adapt to time changes
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentHour(new Date().getHours())
        }, 60000)
        return () => clearInterval(timer)
    }, [])

    const getGreeting = () => {
        if (currentHour >= 5 && currentHour < 12) {
            return t("home.greeting.morning") || "Good Morning"
        } else if (currentHour >= 12 && currentHour < 18) {
            return t("home.greeting.afternoon") || "Good Afternoon"
        } else {
            return t("home.greeting.evening") || "Good Evening"
        }
    }

    const getGreetingIcon = () => {
        if (currentHour >= 5 && currentHour < 12) {
            return <Sun className="h-8 w-8 text-yellow-500 animate-slow-spin" />
        } else if (currentHour >= 12 && currentHour < 18) {
            return <Sunset className="h-8 w-8 text-orange-500" />
        } else {
            return <Moon className="h-8 w-8 text-indigo-400" />
        }
    }

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

    return (
        <div className={cn(
            "flex justify-center pb-6 pt-2  overflow-auto h-full",
            isMobile && "px-4"
        )}>
            <style>{`
                @keyframes slow-spin {
                    from {
                        transform: rotate(0deg);
                    }
                    to {
                        transform: rotate(360deg);
                    }
                }
                .animate-slow-spin {
                    animation: slow-spin 4s linear infinite;
                }
            `}</style>
            <div className={cn(
                "flex flex-col gap-6 w-full",
                !isMobile && "max-w-[800px]"
            )}>
                {/* Greeting Section */}
                <div className={cn(
                    "flex items-center justify-center gap-4",
                    isMobile ? "py-4 flex-col" : "py-6"
                )}>
                    <div className={cn(
                        "rounded-xl",
                        isMobile ? "p-2" : "p-3"
                    )}>
                        {getGreetingIcon()}
                    </div>
                    <div className={cn(
                        "font-semibold tracking-tight",
                        isMobile ? "text-xl" : "text-2xl"
                    )}>{getGreeting()}</div>
                </div>

                {/* Recent Spaces Section */}
                <div className="flex flex-col gap-3">
                    <div className={cn(
                        "flex items-center",
                        isMobile ? "flex-col gap-2" : "justify-between"
                    )}>
                        <div className="flex items-center gap-2">
                            <Clock size={14} className="text-muted-foreground" />
                            <span className="font-medium text-sm">{t("home.rs") || "Recent Spaces"}</span>
                            <Button
                                variant="link"
                                size="sm"
                                className="text-xs text-muted-foreground px-2"
                                onClick={() => navigator.go({ to: '/all-spaces' })}
                            >
                                {t("home.all") || "View All"}
                            </Button>
                        </div>
                        <CreateSpaceDlg
                            trigger={
                                <Button size="sm" variant="outline" className="gap-1.5 h-8">
                                    <Plus className="w-3.5 h-3.5" />
                                    {t("home.create-space") || "Create Space"}
                                </Button>
                            }
                            callBack={() => setFlag(f => f + 1)}
                        />
                    </div>
                    {loading ? (
                        <div className={cn(
                            "grid gap-4 w-full",
                            isMobile ? "grid-cols-2" : "grid-cols-4"
                        )}>
                            {[...Array(isMobile ? 2 : 4)].map((_, index) => (
                                <div key={index} className="flex flex-col gap-2">
                                    <Skeleton className={cn(
                                        "w-full rounded-lg",
                                        isMobile ? "h-[140px]" : "h-[180px]"
                                    )} />
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-3 w-1/2" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <CardList
                            data={recentSpaces}
                            className={cn(
                                "hover:shadow-md transition-shadow",
                                isMobile ? "h-[100px]" : "h-[120px]"
                            )}
                            containerClassName={isMobile ? "grid-cols-2" : "grid-cols-4"}
                            emptyProps={{
                                icon: <Box className="h-5 w-5" />,
                                title: t("home.no-spaces") || "No spaces yet",
                                desc: t("home.no-spaces-hint") || "Create a space to get started",
                                button: <CreateSpaceDlg trigger={<Button size="sm" variant="outline" className="mt-1 gap-1.5 h-7 text-xs"><Plus className="w-3 h-3" />{t("home.create-space") || "Create Space"}</Button>} />
                            }}
                            icon={(data: any) => data.icon?.icon}
                            config={{
                                name: 'name',
                                desc: 'updateTime',
                            }}
                            descFormatter={(data: any) => {
                                if (!data.updateTime) return ''
                                try {
                                    return formatDistanceToNow(parseISO(data.updateTime), { addSuffix: true })
                                } catch {
                                    return data.updateTime
                                }
                            }}
                            onClick={(data: any) => {
                                navigator.go({
                                    to: `/space-detail/${data.id}`
                                })
                            }}
                        />
                    )}
                </div>

                {/* Recent Pages Section */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <Clock size={14} className="text-muted-foreground" />
                        <span className="font-medium text-sm">{t("home.recent-pages") || "Recent Pages"}</span>
                    </div>
                    {loading ? (
                        <div className={cn(
                            "grid gap-4 w-full",
                            isMobile ? "grid-cols-2" : "grid-cols-4"
                        )}>
                            {[...Array(isMobile ? 4 : 8)].map((_, index) => (
                                <div key={index} className="flex flex-col gap-2">
                                    <Skeleton className={cn(
                                        "w-full rounded-lg",
                                        isMobile ? "h-[60px]" : "h-[80px]"
                                    )} />
                                    <Skeleton className="h-4 w-3/4" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <CardList
                            data={recentPages}
                            className="hover:shadow-md transition-shadow"
                            containerClassName={isMobile ? "grid-cols-2" : "grid-cols-4"}
                            emptyProps={{
                                icon: <Book className="h-5 w-5" />,
                                title: t("home.no-recent-pages") || "No recent pages",
                                desc: t("home.no-recent-pages-hint") || "Pages you visit will appear here"
                            }}
                            config={{ name: 'title' }}
                            icon={(data: any) => data.icon?.icon || <Box className="h-5 w-5 text-muted-foreground" />}
                            onClick={(data: any) => {
                                navigator.go({
                                    to: `/space-detail/${data.spaceId}/page/edit/${data.id}`
                                })
                            }}
                            footer={(data: any) => (
                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
                                    <Clock className="h-3 w-3" />
                                    <span className={isMobile ? "truncate" : ""}>
                                        {(() => {
                                            const timeStr = data.updateTime ? (() => {
                                                try {
                                                    return formatDistanceToNow(parseISO(data.updateTime), { addSuffix: true });
                                                } catch {
                                                    return format(parseISO(data.updateTime), 'MM/dd/yyyy');
                                                }
                                            })() : '';
                                            return data.updateBy ? `Updated by ${data.updateBy}${timeStr ? ' · ' + timeStr : ''}` : timeStr || 'Last update';
                                        })()}
                                    </span>
                                </div>
                            )}
                        />
                    )}
                </div>

                {/* Favorite Pages Section */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <Star size={14} className="text-muted-foreground" />
                        <span className="font-medium text-sm">{t("home.favorites") || "Favorite Pages"}</span>
                    </div>
                    {loading ? (
                        <div className="flex flex-col">
                            {[...Array(5)].map((_, index) => (
                                <div key={index} className="flex items-center gap-3 py-2">
                                    <Skeleton className="h-4 w-4 rounded" />
                                    <Skeleton className="h-4 flex-1 max-w-[40%]" />
                                    <Skeleton className="h-3 w-20" />
                                </div>
                            ))}
                        </div>
                    ) : favoritePages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <Star className="h-5 w-5 text-muted-foreground/40 mb-2" />
                            <p className="text-sm text-muted-foreground">
                                {t("home.no-favorites") || "No favorite pages yet"}
                            </p>
                            <p className="text-xs text-muted-foreground/70 mt-1">
                                {t("home.no-favorites-hint") || "Star pages to add them here"}
                            </p>
                        </div>
                    ) : (
                        <ul className="flex flex-col divide-y divide-border/60">
                            {favoritePages.map((data: any) => (
                                <li
                                    key={data.id}
                                    className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-md cursor-pointer hover:bg-muted/60 transition-colors"
                                    onClick={() => {
                                        navigator.go({
                                            to: `/space-detail/${data.spaceId}/page/edit/${data.id}`
                                        })
                                    }}
                                >
                                    <span className="flex h-5 w-5 items-center justify-center text-base shrink-0">
                                        {data.icon?.icon || <Box className="h-4 w-4 text-muted-foreground" />}
                                    </span>
                                    <span className="flex-1 truncate text-sm">{data.title}</span>
                                    {data.updateTime && (
                                        <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                                            <Clock className="h-3 w-3" />
                                            {(() => {
                                                try {
                                                    return formatDistanceToNow(parseISO(data.updateTime), { addSuffix: true });
                                                } catch {
                                                    return format(parseISO(data.updateTime), 'MM/dd/yyyy');
                                                }
                                            })()}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Learning Section */}
                <div className="flex flex-col gap-3 mb-2">
                    <div className="flex items-center gap-2">
                        <Book size={14} className="text-muted-foreground" />
                        <span className="font-medium text-sm">{t("home.learning") || "Learn Knowledge"}</span>
                    </div>
                    <Card className="border-dashed bg-muted/30">
                        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                            <div className="p-3 rounded-full bg-muted mb-3">
                                <BanIcon className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {t("home.coming-soon-desc") || "This feature is coming soon, stay tuned!"}
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}