import { useNavigator } from "../hooks/use-navigator";
import { Blocks, LayoutDashboard, Power, Settings, UserRoundPlus } from "@kn/icon";
import React, { useContext, useEffect, useMemo, useState, useCallback, memo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider, useIsMobile } from "@kn/ui";
import { useLocation } from "react-router-dom";
import { cn } from "@kn/ui";
import { useSelector } from "@kn/common";
import { GlobalState } from "../store/GlobalState";
import { Avatar, AvatarFallback, AvatarImage } from "@kn/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@kn/ui";
import { Badge } from "@kn/ui";
import { Separator } from "@kn/ui";
import { SettingDlg } from "./settings/SeetingDlg";
import { ModeToggle } from "@kn/ui";
import { AppContext, SiderMenuItemProps } from "@kn/common";
import { event } from "@kn/common";
import { useUploadFile } from "../hooks";
import { LanguageToggle } from "../locales/LanguageToggle";
import { MessageBox } from "./MessageBox";

// Memoized menu item component for better performance
interface MenuItemProps {
    item: SiderMenuItemProps;
    isActive: boolean;
    onClick: () => void;
    isMobile?: boolean;
}

const MenuItem = memo<MenuItemProps>(({ item, isActive, onClick, isMobile }) => {
    // Mobile layout with text labels
    if (isMobile) {
        return (
            <button
                onClick={onClick}
                className={cn(
                    "w-full rounded-lg flex items-center gap-3 px-4 py-3 cursor-pointer",
                    "hover:bg-muted transition-all duration-200 ease-in-out",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "active:scale-[0.98]",
                    isActive && "bg-muted shadow-sm",
                    item.className
                )}
                aria-label={typeof item.name === 'string' ? item.name : item.key}
                aria-current={isActive ? 'page' : undefined}
            >
                <span className="flex-shrink-0">{item.icon}</span>
                <span className="text-sm font-medium">{item.name}</span>
            </button>
        );
    }

    // Desktop layout with tooltip
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    onClick={onClick}
                    className={cn(
                        "rounded-md flex items-center justify-center p-2 cursor-pointer",
                        "hover:bg-muted transition-all duration-200 ease-in-out",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        "active:scale-95",
                        isActive && "bg-muted shadow-sm",
                        item.className
                    )}
                    aria-label={typeof item.name === 'string' ? item.name : item.key}
                    aria-current={isActive ? 'page' : undefined}
                >
                    {item.icon}
                </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
                {item.name}
            </TooltipContent>
        </Tooltip>
    );
});

MenuItem.displayName = 'MenuItem';



export const SiderMenu: React.FC<{ size?: 'default' | 'md' | 'mini'; onItemClick?: () => void }> = ({ size = 'default', onItemClick }) => {

    const isMobile = useIsMobile()
    const navigator = useNavigator()
    const location = useLocation()
    const { userInfo } = useSelector((state: GlobalState) => state)
    const { pluginManager } = useContext(AppContext)
    const [flag, setFlag] = useState(0)
    const { usePath } = useUploadFile()

    // Memoized handlers for better performance
    const handleLogout = useCallback(() => {
        localStorage.removeItem("knowledge-token")
        window.location.href = '/login'
    }, [])

    const handleGoToPersonalSpace = useCallback(() => {
        // TODO: Implement personal space navigation
        // useApi(APIS.PERSONAL_SPACE).then((res) => {
        //     navigator.go({
        //         to: `/space-detail/${res.data.id}`
        //     })
        // })
    }, []);

    // Handle plugin refresh events
    useEffect(() => {
        const handleRefresh = () => setFlag(f => f + 1);
        event.on("REFRESH_PLUSINS", handleRefresh);
        return () => {
            event.off("REFRESH_PLUSINS", handleRefresh);
        }
    }, [])


    // Memoized menus construction
    const menus: SiderMenuItemProps[] = useMemo(() => {
        const pluginMenus = pluginManager?.resloveMenus() || [];

        return [
            ...pluginMenus as SiderMenuItemProps[],
            {
                name: 'Shop',
                icon: <Blocks className="h-5 w-5" id="welcome-title" />,
                key: '/plugin-hub',
                attachTabs: true,
                id: '/plugin-hub',
            },
            {
                name: 'Message',
                icon: <MessageBox />,
                key: '/message',
                attachTabs: true,
                id: '/message',
                onClick: () => { }
            },
            {
                name: 'Setting',
                icon: <SettingDlg>
                    <button className="flex items-center justify-center" aria-label="Settings">
                        <Settings className="h-5 w-5" />
                    </button>
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
                    <DropdownMenuTrigger asChild>
                        <button
                            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            aria-label="User menu"
                        >
                            <Avatar className="h-9 w-9 border-2 hover:border-primary transition-colors">
                                <AvatarImage src={usePath(userInfo?.avatar as string)} />
                                <AvatarFallback className="text-xs font-medium">{userInfo?.account?.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" className="w-[220px]" sideOffset={8}>
                        <DropdownMenuLabel className="p-3">
                            <div className="flex flex-row gap-3 items-start justify-between">
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold flex gap-2 items-center text-sm">
                                        <span className="truncate">{userInfo?.name}</span>
                                        <Badge variant="secondary" className="h-4 text-xs px-1.5">Free</Badge>
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                                        {userInfo?.account}
                                    </div>
                                </div>
                                <Avatar className="h-10 w-10 flex-shrink-0">
                                    <AvatarImage src={usePath(userInfo?.avatar as string)} />
                                    <AvatarFallback className="text-xs">{userInfo?.account?.slice(0, 2).toUpperCase()}</AvatarFallback>
                                </Avatar>
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-2">
                                上次登录时间 2024年9月14日
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="flex flex-row items-center gap-2 cursor-pointer"
                            onClick={handleGoToPersonalSpace}
                        >
                            <LayoutDashboard className="h-4 w-4" />
                            <span>个人空间</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex flex-row items-center gap-2 cursor-pointer">
                            <UserRoundPlus className="h-4 w-4" />
                            <span>邀请协作者</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex flex-row items-center gap-2 cursor-pointer">
                            <Settings className="h-4 w-4" />
                            <span>设置</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            className="flex flex-row items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                            onClick={handleLogout}
                        >
                            <Power className="h-4 w-4" />
                            <span>注销账号</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>,
                key: '/user-info',
                attachTabs: false,
                id: '/user-info',
                isGroup: true,
                onClick: () => { }
            }
        ]
    }, [pluginManager?.plugins, flag, userInfo, usePath, handleLogout, handleGoToPersonalSpace])

    // Memoized click handler
    const handleMenuClick = useCallback((item: SiderMenuItemProps) => {
        if (item.onClick) {
            item.onClick(item);
        } else if (item.id && !item.isGroup) {
            navigator.go({ to: item.id });
        }
        // Call onItemClick callback if provided (for mobile drawer close)
        onItemClick?.();
    }, [navigator, onItemClick]);

    return (
        <TooltipProvider delayDuration={300}>
            <nav
                className={cn(
                    "flex flex-col gap-3 py-2",
                    isMobile ? "items-stretch px-2" : "items-center"
                )}
                aria-label="Main navigation"
            >
                {/* Main menu items */}
                <div className={cn(
                    "flex flex-col gap-2",
                    isMobile ? "items-stretch" : "items-center"
                )}>
                    {menus.map((item, index) => {
                        const isActive = location.pathname === item.id || location.pathname.startsWith(item.id + '/');
                        return (
                            <MenuItem
                                key={item.key || index}
                                item={item}
                                isActive={isActive}
                                onClick={() => handleMenuClick(item)}
                                isMobile={isMobile}
                            />
                        );
                    })}
                </div>

                {/* Utility controls separator */}
                <Separator className={isMobile ? "my-2" : "w-8 my-1"} />

                {/* Utility controls */}
                <div className={cn(
                    "flex gap-2",
                    isMobile ? "flex-row justify-center" : "flex-col items-center"
                )}>
                    <ModeToggle />
                    <LanguageToggle />
                </div>
            </nav>
        </TooltipProvider>
    );
}