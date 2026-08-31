import React, { useCallback, useMemo, useState } from "react";
import {
    cn,
    Sheet,
    SheetContent,
    SheetTitle,
    Avatar,
    AvatarFallback,
    AvatarImage,
    ModeToggle,
} from "@kn/ui";
import { Home, LayoutGrid, Sparkles, User, Settings, Power } from "@kn/icon";
import {
    useLocation,
    useNavigator,
    useSelector,
    GlobalState,
    useUploadFile,
    APIS,
    clearContextSensitiveClientState,
    clearTokens,
    getRefreshToken,
    notifyContextChanged,
    useApi,
    event,
    TOGGLE_AI_ASSISTANT,
    useTranslation,
} from "@kn/common";
import { SettingDlg } from "../settings/SeetingDlg";
import { LanguageToggle } from "../../locales/LanguageToggle";

interface TabItem {
    key: string;
    label: string;
    icon: React.ReactNode;
    /** Route prefixes that mark this tab active. */
    match: string[];
    onPress: () => void;
}

const TabButton: React.FC<{ item: TabItem; active: boolean }> = ({ item, active }) => (
    <button
        onClick={item.onPress}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        className={cn(
            "flex h-full min-w-0 flex-col items-center justify-center gap-0.5",
            "transition-colors active:scale-95",
            active ? "text-primary" : "text-muted-foreground"
        )}
    >
        <span className="flex h-6 w-6 items-center justify-center">{item.icon}</span>
        <span className="max-w-full truncate text-[10px] font-medium leading-none">
            {item.label}
        </span>
    </button>
);

/**
 * Persistent bottom navigation for mobile. Replaces shoving the desktop icon
 * rail into a hamburger drawer. Rendered only on mobile by the Layout.
 */
export const MobileTabBar: React.FC = () => {
    const { t } = useTranslation();
    const navigator = useNavigator();
    const location = useLocation();
    const { userInfo } = useSelector((state: GlobalState) => state);
    const { usePath } = useUploadFile();
    const [profileOpen, setProfileOpen] = useState(false);

    const go = useCallback(
        (to: string) => navigator.go({ to }),
        [navigator]
    );

    const handleLogout = useCallback(() => {
        void useApi(APIS.LOGOUT, undefined, { refreshToken: getRefreshToken() || '' })
            .catch(() => undefined).finally(() => {
            clearContextSensitiveClientState();
            clearTokens();
            notifyContextChanged("");
            window.location.href = "/login";
        });
    }, []);

    const items: TabItem[] = useMemo(
        () => [
            {
                key: "home",
                label: t("mobileTabBar.home"),
                icon: <Home className="h-5 w-5" />,
                match: ["/home", "/"],
                onPress: () => go("/home"),
            },
            {
                key: "spaces",
                label: t("mobileTabBar.spaces"),
                icon: <LayoutGrid className="h-5 w-5" />,
                match: ["/all-spaces", "/spaces", "/space-detail"],
                onPress: () => go("/all-spaces"),
            },
            {
                key: "ai",
                label: t("mobileTabBar.ai"),
                icon: <Sparkles className="h-5 w-5" />,
                match: [],
                onPress: () => event.emit(TOGGLE_AI_ASSISTANT),
            },
            {
                key: "me",
                label: t("mobileTabBar.me"),
                icon: (
                    <Avatar className="h-6 w-6">
                        <AvatarImage src={usePath(userInfo?.avatar as string)} />
                        <AvatarFallback className="text-[10px]">
                            {userInfo?.account?.slice(0, 2).toUpperCase() || <User className="h-4 w-4" />}
                        </AvatarFallback>
                    </Avatar>
                ),
                match: [],
                onPress: () => setProfileOpen(true),
            },
        ],
        [go, usePath, userInfo, t]
    );

    const isActive = useCallback(
        (item: TabItem) =>
            item.match.some(
                (p) =>
                    location.pathname === p ||
                    (p !== "/" && location.pathname.startsWith(p))
            ),
        [location.pathname]
    );

    return (
        <>
            <nav
                aria-label={t("mobileTabBar.nav")}
                className={cn(
                    "shrink-0 border-t bg-background/95 backdrop-blur",
                    "pb-safe"
                )}
            >
                <div className="grid h-14 grid-cols-4">
                    {items.map((item) => (
                        <TabButton key={item.key} item={item} active={isActive(item)} />
                    ))}
                </div>
            </nav>

            {/* "我的" profile sheet */}
            <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
                <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
                    <SheetTitle className="sr-only">{t("mobileTabBar.profileCenter")}</SheetTitle>
                    <div className="flex items-center gap-3 py-2">
                        <Avatar className="h-12 w-12">
                            <AvatarImage src={usePath(userInfo?.avatar as string)} />
                            <AvatarFallback>
                                {userInfo?.account?.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                            <div className="truncate font-semibold">{userInfo?.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                                {userInfo?.account}
                            </div>
                        </div>
                    </div>

                    <div className="mt-2 flex flex-col">
                        <SettingDlg>
                            <button className="flex h-12 w-full items-center gap-3 rounded-lg px-2 text-sm hover:bg-muted">
                                <Settings className="h-5 w-5" />
                                <span>{t("mobileTabBar.settings")}</span>
                            </button>
                        </SettingDlg>

                        <div className="flex h-12 w-full items-center justify-between gap-3 rounded-lg px-2 text-sm">
                            <span>{t("mobileTabBar.appearanceLanguage")}</span>
                            <div className="flex items-center gap-2">
                                <ModeToggle />
                                <LanguageToggle />
                            </div>
                        </div>

                        <button
                            onClick={handleLogout}
                            className="flex h-12 w-full items-center gap-3 rounded-lg px-2 text-sm text-destructive hover:bg-destructive/10"
                        >
                            <Power className="h-5 w-5" />
                            <span>{t("mobileTabBar.logout")}</span>
                        </button>
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
};

export default MobileTabBar;
