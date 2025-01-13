import { useNavigator } from "../../hooks/use-navigator";
import { CalendarCheck2, Inbox, LayoutDashboard, LayoutGrid, MessageCircleCodeIcon, PanelBottom, Power, Settings, ShoppingBag, UserRoundPlus } from "@repo/icon";
import React, { ReactNode } from "react";
import { Empty, EmptyProps } from "@repo/ui";
import { useLocation } from "react-router-dom";
import { cn } from "@repo/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui";
import { useSelector } from "react-redux";
import { GlobalState } from "../../store/GlobalState";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@repo/ui";
import { Badge } from "@repo/ui";
import { useApi } from "../../hooks/use-api";
import { APIS } from "../../api";
import { Separator } from "@repo/ui";
import { SettingDlg } from "./settings/SeetingDlg";
import { ModeToggle } from "@repo/ui";


export interface SiderMenuItemProps {
    name: ReactNode,
    key: string,
    icon: ReactNode,
    attachTabs?: boolean,
    id: string,
    isSelectable?: boolean,
    children?: SiderMenuItemProps[]
    indicator?: boolean,
    isGroup?: boolean,
    className?: string,
    onClick?: (item?: any) => void;
    emptyProps?: EmptyProps
    actions?: ReactNode[]
    customerRender?: ReactNode
    height?: number
}

export interface SiderMenuProps {
    menus: SiderMenuItemProps[]
    size?: 'default' | 'md' | 'mini'
}

export const SiderMenu: React.FC<{ size?: 'default' | 'md' | 'mini' }> = ({ size = 'default' }) => {

    const navigator = useNavigator()
    const location = useLocation()
    const { userInfo } = useSelector((state: GlobalState) => state)

    const handleLogout = () => {
        localStorage.removeItem("knowledge-token")
        navigator.go({
            to: '/login'
        })
    }

    const handleGoToPersonalSpace = () => {
        useApi(APIS.PERSONAL_SPACE).then((res) => {
            navigator.go({
                to: `/space-detail/${res.data.id}`
            })
        })
    }




    const menus: SiderMenuItemProps[] = [
        {
            name: 'Home',
            icon: <LayoutGrid className="h-5 w-5" />,
            key: '/home',
            attachTabs: true,
            id: '/home',
            onClick: () => {
                navigator.go({
                    to: "/home"
                })
            }
        },
        {
            name: 'Journals',
            icon: <CalendarCheck2 className="h-5 w-5" />,
            key: '/journals',
            attachTabs: true,
            id: '/journals',
            onClick: () => {
                navigator.go({
                    to: "/journals"
                })
            }
        },
        {
            name: 'Templates',
            icon: <PanelBottom className="h-5 w-5" />,
            key: '/spaces',
            attachTabs: true,
            id: '/spaces',
            onClick: () => {
                navigator.go({
                    to: "/spaces"
                })
            }
        },
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
        },
        {
            name: 'Shop',
            icon: <ShoppingBag className="h-5 w-5" />,
            key: '/plugin',
            attachTabs: true,
            id: '/plugin',
            onClick: () => {
                navigator.go({
                    to: "/plugin"
                })
            }
        },
        {
            name: 'Setting',
            icon: <SettingDlg>
                <Settings className="h-5 w-5" />
            </SettingDlg>,
            key: '/setting',
            attachTabs: true,
            id: '/setting',
            isGroup: true
        },
        {
            name: 'UserInfo',
            icon: <DropdownMenu>
                <DropdownMenuTrigger>
                    <Avatar className="h-9 w-9">
                        <AvatarImage src={`http://www.simple-platform.cn:88/knowledge-resource/oss/endpoint/download?fileName=${userInfo?.avatar}`} />
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
                                <AvatarImage src={`http://www.simple-platform.cn:88/knowledge-resource/oss/endpoint/download?fileName=${userInfo?.avatar}`} />
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
            className: 'hover:bg-white',
            key: '/setting',
            attachTabs: true,
            id: '/setting',
            isGroup: true
        }
    ]

    return <div className="flex flex-col items-center gap-4">
        {
            menus.map((it, index) => (
                <div key={index} onClick={() => {
                    it.onClick && it.onClick(it)
                }} className={cn("rounded-sm flex items-center justify-center p-2 cursor-pointer hover:bg-muted transition-all duration-300", location.pathname === it.id ? " bg-muted" : "", it.className)}>
                    {it.icon}
                </div>
            ))
        }
        <ModeToggle />
    </div>
}