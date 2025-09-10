import { APIS } from "../../api";
import { CardList } from "../components/CardList";
import { Button, EmptyState } from "@kn/ui";
import { useApi, useService } from "@kn/core";
import { useNavigator } from "@kn/core";
import { Space as KSpace } from "../../model/Space";
import { BanIcon, Book, Box, Clock, LayoutTemplate, Plus, UserCircle } from "@kn/icon";
import React, { useEffect, useState } from "react";
import { CreateSpaceDlg } from "../components/SpaceForm";
import { useTranslation } from "@kn/common";


export const Home: React.FC = () => {

    const [recentSpaces, setRecentSpaces] = useState<KSpace[]>([])
    const [recentPages, setRecentPages] = useState([])
    const [flag, setFlag] = useState(0)
    const navigator = useNavigator()
    const { t, i18n } = useTranslation()


    useEffect(() => {
        useApi(APIS.QUERY_SPACE, { template: false, pageSize: 4 }).then(res => {
            setRecentSpaces(res.data.records)
        })
    }, [flag])

    useEffect(() => {
        useApi(APIS.QUERY_RECENT_PAGE, { pageSize: 8 }).then(res => {
            setRecentPages(res.data.records)
        })
    }, [])


    return <div className="flex justify-center pb-4">
        <div className="w-[800px] flex flex-col gap-4">
            <div className=" flex items-center justify-center h-[100px]">
                <div className="scroll-m-20 text-2xl font-semibold tracking-tight">{t("home.title")}</div>
            </div>
            <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1 py-1 font-light text-xs">
                        <Clock size={12} />
                        <div className=" font-bold">{t("home.rs")}</div>
                        <a href="#" className=" underline ml-2 italic">{t("home.all")}</a>
                    </div>
                    <CreateSpaceDlg
                        trigger={<Button size="sm" variant="ghost" className="flex flex-row gap-1"><Plus className="w-4 h-4" />{t("home.create-space")}</Button>}
                        callBack={() => setFlag(f => f + 1)}
                    />
                </div>
                <CardList
                    data={recentSpaces}
                    className="h-[200px]"
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
            </div>
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1 py-1 font-light text-xs">
                    <Clock size={12} />
                    <div className=" font-bold">从最近的页面开始</div>
                </div>
                <CardList
                    data={recentPages}
                    config={{ name: 'title' }}
                    icon={(data: any) => data.icon?.icon || <Box />}
                    onClick={(data: any) => {
                        navigator.go({
                            to: `/space-detail/${data.spaceId}/page/${data.id}`
                        })
                    }}
                    footer={() => <div className="text-sm italic text-gray-500">
                        <a className="flex flex-row items-center gap-1 underline">
                            <UserCircle className="h-3 w-3" />Last update by Leong
                        </a>
                        <div className="flex flex-row items-center gap-1">
                            <Clock className="h-3 w-3" />At 2024年8月19日
                        </div>
                    </div>}
                />
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