import { APIS } from "../../api";
import { CardList } from "../components/CardList";
import { Button, EmptyState, Skeleton } from "@kn/ui";
import { useApi, useService } from "@kn/core";
import { useNavigator } from "@kn/core";
import { Space } from "../../model/Space";
import { BanIcon, Book, Box, Clock, LayoutTemplate, Moon, Plus, Sun, Sunset, UserCircle } from "@kn/icon";
import React, { useEffect, useState } from "react";
import { CreateSpaceDlg } from "../components/SpaceForm";
import { useTranslation } from "@kn/common";
import { SpaceHub } from "../SpaceHub";


export const Home: React.FC = () => {

    const [recentSpaces, setRecentSpaces] = useState<Space[]>([])
    const [recentPages, setRecentPages] = useState([])
    const [flag, setFlag] = useState(0)
    const [loading, setLoading] = useState(true)
    const [currentHour, setCurrentHour] = useState(new Date().getHours())
    const navigator = useNavigator()
    const { t, i18n } = useTranslation()

    // Update current hour every minute to adapt to time changes
    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentHour(new Date().getHours())
        }, 60000) // Update every minute
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
            // Morning: Sun icon with warm yellow color
            return <Sun className="h-8 w-8 text-yellow-500" />
        } else if (currentHour >= 12 && currentHour < 18) {
            // Afternoon: Sunset icon with orange color
            return <Sunset className="h-8 w-8 text-orange-500" />
        } else {
            // Evening/Night: Moon icon with blue-purple color
            return <Moon className="h-8 w-8 text-indigo-400" />
        }
    }


    useEffect(() => {
        setLoading(true)
        Promise.all([
            useApi(APIS.QUERY_SPACE, { template: false, pageSize: 4 }),
            useApi(APIS.QUERY_RECENT_PAGE, { pageSize: 8 })
        ]).then(([spacesRes, pagesRes]) => {
            setRecentSpaces(spacesRes.data.records)
            setRecentPages(pagesRes.data.records)
        }).finally(() => {
            setLoading(false)
        })
    }, [flag])


    return <div className="flex justify-center pb-4">
        <div className="w-[800px] flex flex-col gap-4">
            <div className="flex items-center justify-center h-[100px] gap-3">
                {getGreetingIcon()}
                <div className="scroll-m-20 text-2xl font-semibold tracking-tight">{getGreeting()}</div>
            </div>
            <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1 py-1 font-light text-xs">
                        <Clock size={12} />
                        <div className=" font-bold">{t("home.rs")}</div>
                        <SpaceHub>
                            <a href="#" className=" underline ml-2 italic">{t("home.all")}</a>
                        </SpaceHub>
                    </div>
                    <CreateSpaceDlg
                        trigger={<Button size="sm" variant="ghost" className="flex flex-row gap-1"><Plus className="w-4 h-4" />{t("home.create-space")}</Button>}
                        callBack={() => setFlag(f => f + 1)}
                    />
                </div>
                {loading ? (
                    <div className="grid gap-4 w-full grid-cols-4">
                        {[...Array(4)].map((_, index) => (
                            <div key={index} className="flex flex-col gap-2">
                                <Skeleton className="h-[250px] w-full rounded-lg" />
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-3 w-1/2" />
                            </div>
                        ))}
                    </div>
                ) : (
                    <CardList
                        data={recentSpaces}
                        className="h-[250px]"
                        emptyProps={{
                            button: <CreateSpaceDlg trigger={<Button>{t("home.create-space")}</Button>} />
                        }}
                        config={{
                            // desc: 'description',
                            cover: 'cover',
                            // name: 'name'
                        }}
                        // icon={(data) => data?.icon?.icon || data.name}
                        onClick={(data: any) => {
                            navigator.go({
                                to: `/space-detail/${data.id}`
                            })
                        }}
                        footer={(data: any) => <div className="text-sm mt-1">
                            <div className="flex flex-row items-center gap-1">
                                {data.icon.icon} {data.name}
                            </div>
                            <a className="flex flex-row items-center italic gap-1 underline  text-gray-500">
                                <UserCircle className="h-3 w-3" />Last update by Leong
                            </a>
                        </div>}
                    />
                )}
            </div>
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1 py-1 font-light text-xs">
                    <Clock size={12} />
                    <div className=" font-bold">从最近的页面开始</div>
                </div>
                {loading ? (
                    <div className="grid gap-4 w-full grid-cols-4">
                        {[...Array(8)].map((_, index) => (
                            <div key={index} className="flex flex-col gap-2">
                                <Skeleton className="h-[100px] w-full rounded-lg" />
                                <Skeleton className="h-4 w-3/4" />
                            </div>
                        ))}
                    </div>
                ) : (
                    <CardList
                        data={recentPages}
                        config={{ name: 'title' }}
                        icon={(data: any) => data.icon?.icon || <Box />}
                        onClick={(data: any) => {
                            navigator.go({
                                to: `/space-detail/${data.spaceId}/page/${data.id}`
                            })
                        }}
                    />
                )}
            </div>
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1 py-1 font-light text-xs">
                    <LayoutTemplate size={12} />
                    <div className=" font-bold">协作空间</div>
                </div>
                <EmptyState
                    title=""
                    className="max-w-none"
                    description="功能暂未开放，敬请期待"
                    icons={[BanIcon]}
                />
            </div>
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1 py-1 font-light text-xs">
                    <Book size={12} />
                    <div className=" font-bold">学习如何使用Knowledge</div>
                </div>
                <EmptyState
                    title=""
                    className="max-w-none"
                    description="功能暂未开放，敬请期待"
                    icons={[BanIcon]}
                />
            </div>
        </div>
    </div>
}