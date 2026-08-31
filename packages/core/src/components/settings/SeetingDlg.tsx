import { Avatar, AvatarFallback, AvatarImage } from "@kn/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@kn/ui";
import { DialogTrigger } from "@kn/ui";
import { ScrollArea } from "@kn/ui";
import { Badge } from "@kn/ui";
import { cn } from "@kn/ui";
import { useResponsive } from "@kn/ui";
import { GlobalState } from "@kn/common";
import { useSafeState } from "@kn/common";
import {
    UserCircle,
    Settings,
    UserCog,
    Puzzle,
    Zap,
    Compass,
    ChevronLeft,
} from "@kn/icon";
import React, { PropsWithChildren, useContext, useMemo, Suspense, useEffect } from "react";
import {
    useSelector,
    AppContext,
    PluginSettingsConfig,
    getTourRegistry,
    event,
    START_TOUR,
    WELCOME_TOUR_ID,
} from "@kn/common";
import { useUploadFile, useTranslation } from "@kn/common";
import { MyAccount } from "./components/MyAccount";
import { MySetting } from "./components/MySetting";
import { Member } from "./components/Member";
import { SkillManager } from "../Skills";

interface PluginSettingsWithMeta extends PluginSettingsConfig {
    pluginName: string;
}

type NavItem = {
    id: string;
    label: string;
    icon: React.ReactNode;
    /** 选中后切换到的内容 key（与 onClick 二选一）。 */
    contentKey?: string;
    /** 直接执行的动作（如重新引导）。 */
    onClick?: () => void;
};

type NavGroup = {
    id: string;
    label?: string;
    items: NavItem[];
};

const LoadingSpinner: React.FC = () => (
    <div className="flex h-32 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
);

export const SettingDlg: React.FC<PropsWithChildren> = ({ children }) => {
    const { userInfo } = useSelector((state: GlobalState) => state);
    const [currentKey, setCurrentKey] = useSafeState<string>("MyAccount");
    const [open, setOpen] = useSafeState<boolean>(false);
    // 移动端：是否处于「详情」视图（false 时显示导航列表）。
    const [mobileDetail, setMobileDetail] = useSafeState<boolean>(false);
    const { usePath } = useUploadFile();
    const { pluginManager } = useContext(AppContext);
    const { isMobile } = useResponsive();
    const { t } = useTranslation();

    // 弹窗每次打开都回到默认页 + 列表视图。
    useEffect(() => {
        if (open) {
            setCurrentKey("MyAccount");
            setMobileDetail(false);
        }
    }, [open]);

    // 重新查看新手引导：关闭设置弹窗后，重置并启动 welcome tour。
    const replayOnboarding = () => {
        setOpen(false);
        setTimeout(() => {
            getTourRegistry()
                .reset(WELCOME_TOUR_ID)
                .finally(() => {
                    event.emit(START_TOUR, WELCOME_TOUR_ID);
                });
        }, 250);
    };

    const pluginSettings: PluginSettingsWithMeta[] = useMemo(() => {
        return (pluginManager?.resolvePluginSettings() as PluginSettingsWithMeta[]) || [];
    }, [pluginManager?.plugins]);

    // 导航分组（已清理死链接、去重账号入口；通知/语言并入「偏好设置」）。
    const navGroups: NavGroup[] = useMemo(() => {
        const groups: NavGroup[] = [
            {
                id: "account",
                label: t("settings.nav.account"),
                items: [
                    { id: "MyAccount", label: t("settings.nav.myAccount"), icon: <UserCircle />, contentKey: "MyAccount" },
                    { id: "MySetting", label: t("settings.nav.preferences"), icon: <Settings />, contentKey: "MySetting" },
                    { id: "MySkills", label: t("settings.nav.skills"), icon: <Zap />, contentKey: "MySkills" },
                ],
            },
            {
                id: "workspace",
                label: t("settings.nav.workspace"),
                items: [{ id: "Member", label: t("settings.nav.members"), icon: <UserCog />, contentKey: "Member" }],
            },
        ];

        if (pluginSettings.length > 0) {
            groups.push({
                id: "plugins",
                label: t("settings.nav.plugins"),
                items: pluginSettings.map((p) => ({
                    id: p.key,
                    label: p.label,
                    icon: p.icon || <Puzzle />,
                    contentKey: p.key,
                })),
            });
        }

        groups.push({
            id: "other",
            items: [{ id: "onboarding", label: t("settings.nav.replayOnboarding"), icon: <Compass />, onClick: replayOnboarding }],
        });

        return groups;
    }, [pluginSettings, t]);

    // 当前内容的标题/描述（用于内容区头部与移动端详情头）。
    const meta = useMemo(() => {
        const plugin = pluginSettings.find((p) => p.key === currentKey);
        if (plugin) return { title: plugin.label, description: plugin.description };
        switch (currentKey) {
            case "MyAccount":
                return { title: t("settings.account.title"), description: t("settings.account.desc") };
            case "MySetting":
                return { title: t("settings.preferences.title"), description: t("settings.preferences.desc") };
            case "Member":
                return { title: t("settings.members.title"), description: t("settings.members.desc") };
            case "MySkills":
                return { title: t("settings.skills.title"), description: t("settings.skills.desc") };
            default:
                return { title: t("settings.title"), description: "" };
        }
    }, [currentKey, pluginSettings, t]);

    const isSkills = currentKey === "MySkills";

    const renderContentBody = () => {
        const plugin = pluginSettings.find((p) => p.key === currentKey);
        if (plugin) {
            const Component = plugin.component;
            return (
                <Suspense fallback={<LoadingSpinner />}>
                    <Component pluginKey={plugin.key} />
                </Suspense>
            );
        }
        switch (currentKey) {
            case "MySetting":
                return <MySetting />;
            case "Member":
                return <Member />;
            case "MySkills":
                return <SkillManager />;
            case "MyAccount":
            default:
                return <MyAccount />;
        }
    };

    const selectItem = (item: NavItem) => {
        if (item.onClick) {
            item.onClick();
            return;
        }
        if (item.contentKey) {
            setCurrentKey(item.contentKey);
            setMobileDetail(true);
        }
    };

    // —— 侧边栏导航 ——（用 JSX 值而非内部组件，避免每次 render 重挂导致输入框失焦）
    const sidebarNav = (
        <nav className="space-y-5">
            {/* 账号迷你卡片 */}
            <button
                onClick={() => selectItem({ id: "MyAccount", label: "", icon: null, contentKey: "MyAccount" })}
                className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                    currentKey === "MyAccount" && !isMobile ? "bg-accent" : "hover:bg-accent/60",
                )}
            >
                <Avatar className="h-8 w-8">
                    <AvatarImage src={usePath(userInfo?.avatar as string)} />
                    <AvatarFallback className="bg-muted text-xs font-medium">
                        {userInfo?.account?.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{userInfo?.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{userInfo?.account}</div>
                </div>
                <Badge variant="secondary" className="shrink-0 px-1.5 text-[10px] font-normal">
                    {t("settings.planFree")}
                </Badge>
            </button>

            {navGroups.map((group) => (
                <div key={group.id} className="space-y-0.5">
                    {group.label && (
                        <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                            {group.label}
                        </div>
                    )}
                    {group.items.map((item) => {
                        const active = !isMobile && item.contentKey === currentKey;
                        return (
                            <button
                                key={item.id}
                                onClick={() => selectItem(item)}
                                className={cn(
                                    "group flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors lg:min-h-0",
                                    active
                                        ? "bg-accent font-medium text-foreground"
                                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                                )}
                            >
                                <span className="flex h-4 w-4 shrink-0 items-center justify-center [&_svg]:h-4 [&_svg]:w-4">
                                    {item.icon}
                                </span>
                                <span className="flex-1 truncate text-left">{item.label}</span>
                            </button>
                        );
                    })}
                </div>
            ))}
        </nav>
    );

    // —— 内容区 ——（函数返回 JSX，避免内部组件每次 render 重挂）
    const renderContent = (showHeader = true) => {
        if (isSkills) {
            // 技能管理自带完整布局，铺满内容区。
            return <div className="min-h-0 flex-1">{renderContentBody()}</div>;
        }
        return (
            <ScrollArea className="min-h-0 flex-1">
                <div className="px-5 py-6 md:px-8">
                    {showHeader && (
                        <div className="mx-auto mb-6 w-full max-w-2xl space-y-0.5">
                            <h2 className="text-lg font-semibold text-foreground">{meta.title}</h2>
                            {meta.description && (
                                <p className="text-sm text-muted-foreground">{meta.description}</p>
                            )}
                        </div>
                    )}
                    {renderContentBody()}
                </div>
            </ScrollArea>
        );
    };

    // —— 移动端布局：列表 ↔ 详情 ——
    const MobileBody = (
        <div className="flex h-full flex-col">
            {!mobileDetail ? (
                <>
                    <DialogHeader className="border-b px-4 py-3 text-left">
                        <DialogTitle className="text-base font-semibold">{t("settings.title")}</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="flex-1">
                        <div className="p-3">{sidebarNav}</div>
                    </ScrollArea>
                </>
            ) : (
                <>
                    <DialogHeader className="flex-row items-center gap-1 space-y-0 border-b px-2 py-2.5 text-left">
                        <button
                            onClick={() => setMobileDetail(false)}
                            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
                            aria-label={t("settings.back")}
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </button>
                        <DialogTitle className="text-base font-semibold">{meta.title}</DialogTitle>
                    </DialogHeader>
                    <div className="flex min-h-0 flex-1 flex-col">{renderContent(false)}</div>
                </>
            )}
        </div>
    );

    // —— 桌面/平板布局：左右分栏 ——
    // 用 flex（交叉轴 stretch 给到确定高度），grid 单行会被内容撑高导致 ScrollArea 失效。
    const DesktopBody = (
        <div className="flex h-full">
            <div className="flex w-[232px] min-h-0 shrink-0 flex-col border-r bg-muted/30">
                <DialogHeader className="px-4 pb-2 pt-4 text-left">
                    <DialogTitle className="px-2 text-base font-semibold">{t("settings.title")}</DialogTitle>
                </DialogHeader>
                <ScrollArea className="flex-1">
                    <div className="p-3 pt-2">{sidebarNav}</div>
                </ScrollArea>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">{renderContent()}</div>
        </div>
    );

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent
                aria-describedby={undefined}
                className={cn(
                    // 覆盖 DialogContent 默认的 grid/gap/padding，改为 flex 列布局，
                    // 让内部 body 拿到确定高度（否则 grid auto 行会按内容撑高，ScrollArea 失效）。
                    "flex flex-col gap-0 overflow-hidden p-0",
                    "h-[100dvh] max-w-full rounded-none border-0 pt-safe pb-safe",
                    "md:h-[660px] md:max-w-[920px] md:rounded-xl md:border",
                )}
            >
                {isMobile ? MobileBody : DesktopBody}
            </DialogContent>
        </Dialog>
    );
};
