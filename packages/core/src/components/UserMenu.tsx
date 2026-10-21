import {
    APIS,
    ENTITLEMENT_CODES,
    GlobalState,
    clearContextSensitiveClientState,
    getRefreshToken,
    notifyContextChanged,
    signOut,
    useApi,
    useEntitlements,
    useNavigator,
    useSpacePageService,
    useSelector,
    useTranslation,
    useUploadFile,
} from "@kn/common";
import { ChevronRight, Clock, Crown, LayoutDashboard, Loader2, LogOut, Settings, UserRoundPlus } from "@kn/icon";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Avatar,
    AvatarFallback,
    AvatarImage,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    cn,
    toast,
} from "@kn/ui";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { readSignInHistory, type SignInHistory } from "../auth/last-sign-in";
import { SettingDlg } from "./settings/SeetingDlg";
import { PlanBadge } from "./subscription/PlanBadge";
import { UpgradeDialog } from "./subscription/UpgradeDialog";

export interface UserMenuProps {
    /** Mobile drawer trigger uses the plain avatar. */
    isMobile?: boolean;
    /** Invoked before an action navigates away, so a host drawer can close. */
    onNavigate?: () => void;
}

const MENU_ITEM_CLASS =
    "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm [&_svg]:h-4 [&_svg]:w-4";

const formatSignInTime = (timestamp: number, locale: string): string => {
    try {
        return new Intl.DateTimeFormat(locale || "zh-CN", {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(new Date(timestamp));
    } catch {
        return new Date(timestamp).toLocaleString();
    }
};

/**
 * Account menu at the bottom of the app rail.
 *
 * Everything here used to be a placeholder: the plan badge was the literal
 * string “Free”, the last-login line was a fixed 2024 date, and three of the
 * four menu entries did nothing. This component wires the entries to real
 * behaviour and keeps the destructive action behind a confirmation.
 */
export const UserMenu: React.FC<UserMenuProps> = ({ isMobile = false, onNavigate }) => {
    const { userInfo } = useSelector((state: GlobalState) => state);
    const { usePath } = useUploadFile();
    const navigator = useNavigator();
    const spaceService = useSpacePageService();
    const { t, i18n } = useTranslation();
    const { planCode, loading: entitlementsLoading, hasFeature } = useEntitlements();

    const [menuOpen, setMenuOpen] = useState(false);
    const [signIn, setSignIn] = useState<SignInHistory>({});
    const [openingPersonalSpace, setOpeningPersonalSpace] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsKey, setSettingsKey] = useState<string | undefined>(undefined);
    const [upgradeOpen, setUpgradeOpen] = useState(false);
    const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    // The menu is the only consumer, so the timestamps are read when it opens
    // (after a sign-in the record is already there; a failed read hides the line).
    useEffect(() => {
        if (!menuOpen) return;
        let active = true;
        // The login form may have been filled with the e-mail while `GET /me`
        // exposes the canonical account (or vice versa), so try both.
        void readSignInHistory([userInfo?.account, userInfo?.email])
            .then(history => {
                if (active) setSignIn(history);
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [menuOpen, userInfo?.account, userInfo?.email]);

    const displayName = userInfo?.name || userInfo?.realName || userInfo?.account || "";
    const accountLine = userInfo?.account || userInfo?.email || "";
    const initials = (displayName || userInfo?.account || "U").slice(0, 2).toUpperCase();

    const signInLabel = useMemo(() => {
        const locale = i18n.language || i18n.resolvedLanguage || "zh-CN";
        if (signIn.previousSignInAt) {
            return t("userMenu.lastSignIn", {
                time: formatSignInTime(signIn.previousSignInAt, locale),
            });
        }
        if (signIn.lastSignInAt) {
            return t("userMenu.currentSignIn", {
                time: formatSignInTime(signIn.lastSignInAt, locale),
            });
        }
        return "";
    }, [signIn, i18n.language, i18n.resolvedLanguage, t]);

    const openSettings = useCallback(
        (key?: string) => {
            // Defer past the dropdown's close animation (it steals focus), then
            // open the dialog before letting a host drawer close itself: the
            // drawer may unmount this component, dialog included.
            window.setTimeout(() => {
                setSettingsKey(key);
                setSettingsOpen(true);
                window.setTimeout(() => onNavigate?.(), 0);
            }, 0);
        },
        [onNavigate],
    );

    const handlePersonalSpace = useCallback(async () => {
        if (openingPersonalSpace) return;
        onNavigate?.();
        setOpeningPersonalSpace(true);
        try {
            const space = await spaceService.spaces.getPersonalSpace();
            if (!space?.id) throw new Error("Personal space is unavailable");
            navigator.go({ to: `/space-detail/${space.id}` });
        } catch {
            toast.error(t("userMenu.personalSpaceFailed"));
        } finally {
            setOpeningPersonalSpace(false);
        }
    }, [navigator, onNavigate, openingPersonalSpace, spaceService, t]);

    const handleInviteCollaborators = useCallback(() => {
        // Inviting people into a workspace requires the team collaboration
        // entitlement (FREE does not have it). Point the user at the plan panel
        // instead of dropping them on an invitation form the backend rejects.
        // While entitlements are still loading the entry is disabled, so a FREE
        // user can never be routed to the member panel by mistake.
        if (entitlementsLoading) return;
        const canCollaborate =
            hasFeature(ENTITLEMENT_CODES.COLLABORATION_TEAM) ||
            hasFeature(ENTITLEMENT_CODES.COLLABORATION_GUEST);
        if (!canCollaborate) {
            toast.info(t("userMenu.inviteRequiresPro"));
            openSettings("Subscription");
            return;
        }
        openSettings("Member");
    }, [entitlementsLoading, hasFeature, openSettings, t]);

    const handleUpgrade = useCallback(() => {
        // The dropdown closes on select; wait a tick before opening the dialog
        // so its close animation does not steal focus from the redeem form.
        window.setTimeout(() => setUpgradeOpen(true), 0);
    }, []);

    // Always offer a plan entry: FREE opens the redeem/trial dialog, paid plans
    // go to the subscription panel where the current plan is managed.
    const handlePlanAction = useCallback(() => {
        if (planCode === "FREE") {
            handleUpgrade();
        } else {
            openSettings("Subscription");
        }
    }, [handleUpgrade, openSettings, planCode]);

    const handleLogout = useCallback(() => {
        if (loggingOut) return;
        setLoggingOut(true);
        onNavigate?.();
        // Revoke the server session first, then wipe every local trace of the
        // sign-in (tokens, remembered account, remembered desktop credentials).
        void useApi(APIS.LOGOUT, undefined, { refreshToken: getRefreshToken() || "" })
            .catch(() => undefined)
            .finally(() => {
                clearContextSensitiveClientState();
                notifyContextChanged("");
                void signOut()
                    .catch(() => undefined)
                    .finally(() => {
                        window.location.href = "/login";
                        // If navigation is blocked (e.g. an embedded host), do
                        // not leave every later "log out" click latched.
                        setLoggingOut(false);
                    });
            });
    }, [loggingOut, onNavigate]);

    return (
        <>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className={cn(
                            "rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                            isMobile
                                ? "flex h-11 w-11 items-center justify-center"
                                : "kn-rail-control flex h-11 w-11 items-center justify-center lg:h-8 lg:w-8",
                        )}
                        aria-label={t("userMenu.trigger")}
                    >
                        <Avatar
                            className={cn(
                                "transition-colors",
                                isMobile ? "h-8 w-8 border-2" : "kn-rail-avatar h-8 w-8",
                            )}
                        >
                            <AvatarImage src={usePath(userInfo?.avatar as string)} alt={displayName} />
                            <AvatarFallback className="text-[10px] font-medium">{initials}</AvatarFallback>
                        </Avatar>
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    side="right"
                    align="end"
                    sideOffset={10}
                    className="w-60 rounded-xl border-border/60 p-1.5 shadow-lg"
                >
                    <DropdownMenuLabel className="p-2.5 font-normal">
                        <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                    <span className="truncate text-sm font-semibold text-foreground">
                                        {displayName}
                                    </span>
                                    <PlanBadge className="h-4 shrink-0 px-1.5 text-[10px] font-normal" />
                                </div>
                                {accountLine && (
                                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                        {accountLine}
                                    </div>
                                )}
                            </div>
                            <Avatar className="h-10 w-10 shrink-0 ring-1 ring-border/60">
                                <AvatarImage src={usePath(userInfo?.avatar as string)} alt={displayName} />
                                <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
                            </Avatar>
                        </div>
                        {signInLabel && (
                            <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <Clock className="h-3 w-3 shrink-0" />
                                <span className="truncate">{signInLabel}</span>
                            </div>
                        )}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="my-1" />
                    <DropdownMenuItem
                        onSelect={handlePlanAction}
                        className={cn(
                            "mb-1 flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-sm font-medium",
                            "border-[hsl(212_90%_62%/0.28)] bg-[hsl(212_90%_62%/0.10)] text-[hsl(212_90%_62%)]",
                            "focus:border-[hsl(212_90%_62%/0.45)] focus:bg-[hsl(212_90%_62%/0.16)] focus:text-[hsl(212_90%_62%)]",
                        )}
                    >
                        <Crown className="h-4 w-4" />
                        <span className="flex-1 text-left">
                            {planCode === "FREE" ? t("userMenu.upgradePlan") : t("userMenu.managePlan")}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={() => void handlePersonalSpace()}
                        disabled={openingPersonalSpace}
                        className={MENU_ITEM_CLASS}
                    >
                        {openingPersonalSpace ? (
                            <Loader2 className="animate-spin text-muted-foreground" />
                        ) : (
                            <LayoutDashboard className="text-muted-foreground" />
                        )}
                        <span>{t("userMenu.personalSpace")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={handleInviteCollaborators}
                        disabled={entitlementsLoading}
                        className={MENU_ITEM_CLASS}
                    >
                        <UserRoundPlus className="text-muted-foreground" />
                        <span>{t("userMenu.inviteCollaborators")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => openSettings()} className={MENU_ITEM_CLASS}>
                        <Settings className="text-muted-foreground" />
                        <span>{t("userMenu.settings")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="my-1" />
                    <DropdownMenuItem
                        onSelect={() => window.setTimeout(() => setConfirmLogoutOpen(true), 0)}
                        className={cn(
                            MENU_ITEM_CLASS,
                            "text-destructive focus:bg-destructive/10 focus:text-destructive",
                        )}
                    >
                        <LogOut />
                        <span>{t("userMenu.logout")}</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Outside the dropdown: its content unmounts when the menu closes. */}
            <AlertDialog
                open={confirmLogoutOpen}
                onOpenChange={next => {
                    setConfirmLogoutOpen(next);
                    // ESC can dismiss the dialog while the sign-out request is
                    // still pending; let the user try again instead of latching.
                    if (!next) setLoggingOut(false);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("userMenu.logoutTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("userMenu.logoutDesc")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={loggingOut}>
                            {t("userMenu.logoutCancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={loggingOut}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={event => {
                                // Keep the dialog (and its loading state) visible
                                // until the sign-out actually navigates away.
                                event.preventDefault();
                                handleLogout();
                            }}
                        >
                            {loggingOut ? t("userMenu.loggingOut") : t("userMenu.logoutConfirm")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Dialogs live outside the dropdown: its content unmounts on close. */}
            <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
            {/* One controlled settings dialog serves every deep link from the menu. */}
            <SettingDlg open={settingsOpen} onOpenChange={setSettingsOpen} initialKey={settingsKey} />
        </>
    );
};
