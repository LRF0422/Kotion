import { APIS } from "../../api";
import { CardList } from "../components/CardList";
import { Button, Card, CardContent, EmptyState, Skeleton, cn, useIsMobile } from "@kn/ui";
import { useApi } from "@kn/core";
import { useNavigator } from "@kn/core";
import { Space } from "../../model/Space";
import { BanIcon, Book, Box, Clock, LayoutTemplate, Moon, Plus, Sun, Sunset, UserCircle } from "@kn/icon";
import React, { useEffect, useState } from "react";
import { CreateSpaceDlg } from "../components/SpaceForm";
import { useTranslation } from "@kn/common";
import { SpaceHub } from "../SpaceHub";


export const Home: React.FC = () => {

    const isMobile = useIsMobile()
    const [recentSpaces, setRecentSpaces] = useState<Space[]>([])
    const [recentPages, setRecentPages] = useState<any[]>([])
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
            useApi(APIS.QUERY_RECENT_PAGE, { pageSize: 8 })
        ]).then(([spacesRes, pagesRes]) => {
            setRecentSpaces(spacesRes.data.records || [])
            setRecentPages(pagesRes.data.records || [])
        }).finally(() => {
            setLoading(false)
        })
    }, [flag])

    return (
        <div className={cn(
            "flex justify-center pb-6 pt-2 overflow-auto h-full",
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
                            <SpaceHub>
                                <Button variant="link" size="sm" className="text-xs text-muted-foreground px-2">
                                    {t("home.all") || "View All"}
                                </Button>
                            </SpaceHub>
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
                                isMobile ? "h-[140px]" : "h-[180px]"
                            )}
                            containerClassName={isMobile ? "grid-cols-2" : "grid-cols-4"}
                            emptyProps={{
                                button: <CreateSpaceDlg trigger={<Button>{t("home.create-space") || "Create Space"}</Button>} />
                            }}
                            config={{
                                cover: 'cover',
                            }}
                            onClick={(data: any) => {
                                navigator.go({
                                    to: `/space-detail/${data.id}`
                                })
                            }}
                            footer={(data: any) => (
                                <div className="text-sm mt-2 space-y-0.5">
                                    <div className="flex items-center gap-1.5 font-medium">
                                        <span>{data.icon?.icon}</span>
                                        <span className="truncate">{data.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <UserCircle className="h-3 w-3" />
                                        <span className={isMobile ? "truncate" : ""}>Last update by Leong</span>
                                    </div>
                                </div>
                            )}
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
                            config={{ name: 'title' }}
                            icon={(data: any) => data.icon?.icon || <Box className="text-muted-foreground" />}
                            onClick={(data: any) => {
                                navigator.go({
                                    to: `/space-detail/${data.spaceId}/page/${data.id}`
                                })
                            }}
                        />
                    )}
                </div>

                {/* Collaboration Spaces Section */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <LayoutTemplate size={14} className="text-muted-foreground" />
                        <span className="font-medium text-sm">{t("home.collaboration") || "Collaboration Spaces"}</span>
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

                {/* Learning Section */}
                <div className="flex flex-col gap-3">
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