import { Avatar, AvatarFallback, AvatarImage } from "@kn/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@kn/ui";
import { TreeView } from "@kn/ui";
import { TreeViewElement } from "@kn/ui";
import { Badge } from "@kn/ui";
import { ScrollArea } from "@kn/ui";
import { Separator } from "@kn/ui";
import { cn } from "@kn/ui";
import { GlobalState } from "../../store/GlobalState";
import { useSafeState } from "ahooks";
import { UserCircle, Settings, Bell, Globe, ArrowUpCircle, UserCog, Group, Import, Puzzle, ChevronRight } from "@kn/icon";
import React, { PropsWithChildren, useContext, useMemo, Suspense } from "react";
import { useSelector, AppContext, PluginSettingsConfig } from "@kn/common";
import { MyAccount } from "./components/MyAccount";
import { MySetting } from "./components/MySetting";
import { Member } from "./components/Member";
import { useUploadFile } from "../../hooks";

interface PluginSettingsWithMeta extends PluginSettingsConfig {
    pluginName: string;
}

// Settings section header component
const SectionHeader: React.FC<{ title: string; description?: string }> = ({ title, description }) => (
    <div className="mb-6">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
    </div>
);

// Plugin settings wrapper with loading state
const PluginSettingsLoader: React.FC<{ config: PluginSettingsWithMeta }> = ({ config }) => {
    const Component = config.component;
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        }>
            <div className="space-y-4">
                <SectionHeader
                    title={config.label}
                    description={config.description}
                />
                <Component />
            </div>
        </Suspense>
    );
};

export const SettingDlg: React.FC<PropsWithChildren> = ({ children }) => {
    const { userInfo } = useSelector((state: GlobalState) => state);
    const [currentKey, setCurrentKey] = useSafeState<string>('MyAccount');
    const { usePath } = useUploadFile();
    const { pluginManager } = useContext(AppContext);

    // Get all plugin settings dynamically
    const pluginSettings = useMemo(() => {
        return pluginManager?.resolvePluginSettings() || [];
    }, [pluginManager?.plugins]);

    const render = () => {
        // Check if it's a plugin settings key
        const pluginSetting = pluginSettings.find(p => p.key === currentKey);
        if (pluginSetting) {
            return <PluginSettingsLoader config={pluginSetting} />;
        }

        // Built-in settings
        switch (currentKey) {
            case 'MyAccount':
                return (
                    <div className="space-y-4">
                        <SectionHeader title="我的账号" description="管理您的个人信息和账号设置" />
                        <MyAccount />
                    </div>
                );
            case 'MySetting':
                return (
                    <div className="space-y-4">
                        <SectionHeader title="我的设置" description="自定义您的偏好设置" />
                        <MySetting />
                    </div>
                );
            case 'Member':
                return (
                    <div className="space-y-4">
                        <SectionHeader title="人员管理" description="管理工作空间成员和权限" />
                        <Member />
                    </div>
                );
            default:
                return (
                    <div className="space-y-4">
                        <SectionHeader title="我的账号" description="管理您的个人信息和账号设置" />
                        <MyAccount />
                    </div>
                );
        }
    };

    // Navigation item component
    const NavItem: React.FC<{
        id: string;
        label: string;
        icon: React.ReactNode;
        isActive: boolean;
        onClick: () => void;
        className?: string;
    }> = ({ id, label, icon, isActive, onClick, className }) => (
        <button
            onClick={onClick}
            className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200",
                "hover:bg-accent/50",
                isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground",
                className
            )}
        >
            <span className="flex-shrink-0">{icon}</span>
            <span className="flex-1 text-left truncate">{label}</span>
            {isActive && <ChevronRight className="h-4 w-4 flex-shrink-0" />}
        </button>
    );

    // Build plugin settings tree items
    const pluginSettingsItems: TreeViewElement[] = useMemo(() => {
        if (pluginSettings.length === 0) return [];

        return [{
            id: 'plugins',
            name: '插件设置',
            isGroup: true,
            children: pluginSettings.map(plugin => ({
                id: plugin.key,
                name: plugin.label,
                icon: plugin.icon || <Puzzle className="h-4 w-4" />,
                onClick: () => setCurrentKey(plugin.key)
            }))
        }];
    }, [pluginSettings]);

    const settingItems: TreeViewElement[] = [
        {
            id: 'account',
            name: '账号',
            isGroup: true,
            children: [
                {
                    id: 'MyAccount',
                    name: "我的账号",
                    customerRender: (
                        <div
                            onClick={() => setCurrentKey('MyAccount')}
                            className={cn(
                                "flex items-center gap-3 p-3 mx-1 mb-2 rounded-xl border transition-all duration-200 cursor-pointer",
                                currentKey === 'MyAccount'
                                    ? "bg-primary/5 border-primary/30 shadow-sm"
                                    : "bg-card border-border hover:bg-accent/50 hover:border-accent"
                            )}
                        >
                            <Avatar className="h-10 w-10 ring-2 ring-primary/20 ring-offset-2 ring-offset-background">
                                <AvatarImage src={usePath(userInfo?.avatar as string)} />
                                <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                                    {userInfo?.account?.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col flex-1 min-w-0">
                                <div className="font-semibold text-sm truncate text-foreground">{userInfo?.name}</div>
                                <div className="text-xs text-muted-foreground truncate">{userInfo?.account}</div>
                            </div>
                            <Badge variant="secondary" className="text-[10px] px-2 py-0.5 h-5 font-medium">Free</Badge>
                        </div>
                    )
                },
                {
                    id: 'accounrDetail',
                    name: "账号信息",
                    icon: <UserCircle className="h-4 w-4" />,
                    onClick: () => setCurrentKey("MyAccount")
                },
                {
                    id: 'settings',
                    name: "偏好设置",
                    icon: <Settings className="h-4 w-4" />,
                    onClick: () => setCurrentKey("MySetting")
                },
                {
                    id: 'notifaction',
                    name: "通知设置",
                    icon: <Bell className="h-4 w-4" />
                },
                {
                    id: 'language',
                    name: "语言设置",
                    icon: <Globe className="h-4 w-4" />
                }
            ]
        },
        {
            id: 'workspaces',
            name: '工作空间',
            isGroup: true,
            children: [
                {
                    id: 'upgrade',
                    name: '升级方案',
                    icon: <ArrowUpCircle className="h-4 w-4" />,
                    className: 'text-primary font-medium hover:text-primary'
                },
                {
                    id: 'member',
                    name: '人员管理',
                    icon: <UserCog className="h-4 w-4" />,
                    onClick: () => setCurrentKey("Member")
                },
                {
                    id: 'spaces',
                    name: "空间设置",
                    icon: <Group className="h-4 w-4" />
                },
                {
                    id: 'import',
                    name: '数据导入',
                    icon: <Import className="h-4 w-4" />
                }
            ]
        },
        ...pluginSettingsItems
    ];

    return (
        <Dialog>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="p-0 max-w-[1000px] h-[720px] gap-0 overflow-hidden">
                <DialogHeader className="px-6 py-4 border-b bg-muted/30">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <Settings className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <DialogTitle className="text-lg font-semibold">设置</DialogTitle>
                            <DialogDescription className="text-sm text-muted-foreground">
                                管理您的账号、工作空间和插件设置
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>
                <div className="grid grid-cols-[280px_1fr] h-[calc(100%-81px)]">
                    <div className="border-r bg-muted/20">
                        <ScrollArea className="h-full">
                            <div className="p-4">
                                <TreeView
                                    size="sm"
                                    elements={settingItems}
                                />
                                {pluginSettings.length > 0 && (
                                    <>
                                        <Separator className="my-3" />
                                        <div className="px-2 py-1">
                                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                                已安装插件 ({pluginSettings.length})
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                    <ScrollArea className="h-[500px]">
                        <div className="p-8">
                            {render()}
                        </div>
                    </ScrollArea>
                </div>
            </DialogContent>
        </Dialog>
    );
}