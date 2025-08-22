import { useNavigator } from "../hooks/use-navigator";
import { Blocks, Inbox, LayoutDashboard, MessageCircleCodeIcon, Power, Settings, UserRoundPlus } from "@kn/icon";
import React, { useContext, useEffect, useMemo, useState } from "react";
import { Empty } from "@kn/ui";
import { useLocation } from "react-router-dom";
import { cn } from "@kn/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@kn/ui";
import { useSelector } from "react-redux";
import { GlobalState } from "../store/GlobalState";
import { Avatar, AvatarFallback, AvatarImage } from "@kn/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@kn/ui";
import { Badge } from "@kn/ui";
import { useApi } from "../hooks/use-api";
import { APIS } from "../api";
import { Separator } from "@kn/ui";
import { SettingDlg } from "./settings/SeetingDlg";
import { ModeToggle } from "@kn/ui";
import { AppContext, SiderMenuItemProps } from "@kn/common";
import { event } from "@kn/common";
import { useUploadFile } from "../hooks";
import { LanguageToggle } from "../locales/LanguageToggle";



export const SiderMenu: React.FC<{ size?: 'default' | 'md' | 'mini' }> = ({ size = 'default' }) => {

    const navigator = useNavigator()
    const location = useLocation()
    const { userInfo } = useSelector((state: GlobalState) => state)
    const { pluginManager } = useContext(AppContext)
    const [flag, setFlag] = useState(0)
    const { usePath } = useUploadFile()

    const handleLogout = () => {
        localStorage.removeItem("knowledge-token")
        navigator.go({
            to: '/login'
        })
    }

    const handleGoToPersonalSpace = () => {
        // useApi(APIS.PERSONAL_SPACE).then((res) => {
        //     navigator.go({
        //         to: `/space-detail/${res.data.id}`
        //     })
        // })
    }

    useEffect(() => {
        event.on("REFRESH_PLUSINS", () => {
            setFlag(f => f + 1)
        })
    }, [])


    const menus: SiderMenuItemProps[] = useMemo(() => {
        return [
            ...pluginManager?.resloveMenus() as SiderMenuItemProps[],
            {
                name: 'Message',
                icon: <Popover>
                    <PopoverTrigger><Inbox className="h-5 w-5" /></PopoverTrigger>
                    <PopoverContent side="right" align="start" className="p-1 w-[250px] h-max-[400px]" sideOffset={10}>
                        <div className="flex flex-row gap-1 items-center font-bold p-2">
                            <MessageCircleCodeIcon className="h-5 w-5" />
                            消息盒子
                        </div>
                        <Separator />
                        <div className="flex flex-col gap-2 text-sm p-2">
                            <div>
                                <div>系统消息</div>
                                <Empty className="border-none text-gray-500" title="没有系统消息" />
                            </div>
                            <div>
                                <div>协作邀请</div>
                                <Empty className="border-none text-gray-500" title="都看完啦！" desc="你将在这里收到页面协作邀请" />
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>,
                key: '/message',
                attachTabs: true,
                id: '/message',
                onClick: () => { }
            },
            {
                name: 'Shop',
                icon: <Blocks className="h-5 w-5" />,
                key: '/plugin-hub',
                attachTabs: true,
                id: '/plugin-hub',
            },
            {
                name: 'Setting',
                icon: <SettingDlg>
                    <Settings className="h-5 w-5" />
                </SettingDlg>,
                key: '/setting',
                attachTabs: true,
                id: '/setting',
                isGroup: true,
                onClick: () => { }
            },
            {
                name: 'UserInfo',
                icon: <DropdownMenu>
                    <DropdownMenuTrigger>
                        <Avatar className="h-9 w-9 border">
                            <AvatarImage src={usePath(userInfo?.avatar as string)} />
                            <AvatarFallback>{userInfo?.account}</AvatarFallback>
                        </Avatar>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="w-[200px]">
                        <DropdownMenuLabel className="text-gray-500 italic flex flex-col items-center">
                            <div className="flex flex-row gap-1 items-center justify-between w-full">
                                <div >
                                    <div className=" font-bold flex gap-2 items-center">
                                        {userInfo?.name} <Badge className="h-4">Free</Badge>
                                    </div>
                                    <div>
                                        {userInfo?.account}
                                    </div>
                                </div>
                                <Avatar className="h-9 w-9">
                                    <AvatarImage src={usePath(userInfo?.avatar as string)} />
                                    <AvatarFallback>{userInfo?.account}</AvatarFallback>
                                </Avatar>
                            </div>
                            <div className="text-xs w-full">
                                上次登录时间 2024年9月14日
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="flex flex-row items-center gap-1" onClick={handleGoToPersonalSpace}><LayoutDashboard className="h-4 w-4" />个人空间</DropdownMenuItem>
                        <DropdownMenuItem className="flex flex-row items-center gap-1"><UserRoundPlus className="h-4 w-4" />邀请协作者</DropdownMenuItem>
                        <DropdownMenuItem className="flex flex-row items-center gap-1"><Settings className="h-4 w-4" />设置</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="flex flex-row items-center gap-1" onClick={handleLogout}> <Power className="h-4 w-4" />注销账号</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>,
                key: '/setting',
                attachTabs: true,
                id: '/setting',
                isGroup: true,
                onClick: () => {
                }
            }
        ]
    }, [pluginManager?.plugins])

    return <div className="flex flex-col items-center gap-4">
        {
            menus.map((it, index) => (
                <div key={index} onClick={() => {
                    if (it.onClick) {
                        it.onClick(it)
                    } else {
                        navigator.go({
                            to: it.id
                        })
                    }
                }} className={cn("rounded-sm flex items-center justify-center p-2 cursor-pointer hover:bg-muted transition-all duration-300", location.pathname === it.id ? " bg-muted" : "", it.className)}>
                    {it.icon}
                </div>
            ))
        }
        <ModeToggle />
        <LanguageToggle />
    </div>
}