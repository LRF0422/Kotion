import {
    APIS,
    AssignableOrganizationRole,
    ContextVO,
    GlobalState,
    OrganizationMember,
    OrganizationRole,
    clearContextSensitiveClientState,
    clearTokens,
    getRefreshToken,
    normalizeTokenResponse,
    notifyContextChanged,
    saveTokens,
    useApi,
    useSelector,
    useTranslation,
    useUploadFile,
} from "@kn/common";
import { Building2, Check, Copy, Crown, LogOut, MoreHorizontal, Plus, Search, Shield, Users } from "@kn/icon";
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
    Badge,
    Button,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    Empty,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Separator,
    cn,
    toast,
} from "@kn/ui";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { SettingsPanel, SettingsSection } from "./primitives";

const roleOptions: AssignableOrganizationRole[] = ["ORG_ADMIN", "ORG_MEMBER", "ORG_GUEST"];

export const Member: React.FC = () => {
    const { t } = useTranslation();
    const userInfo = useSelector((state: GlobalState) => state.userInfo);
    const currentContext = useSelector((state: GlobalState) => state.currentContext);
    const availableContexts = useSelector((state: GlobalState) => state.availableContexts);
    const { usePath } = useUploadFile();
    const memberRequestRef = useRef(0);
    const [members, setMembers] = useState<OrganizationMember[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [memberError, setMemberError] = useState("");
    const [switchingId, setSwitchingId] = useState<string>();
    const [organizationName, setOrganizationName] = useState("");
    const [creating, setCreating] = useState(false);
    const [search, setSearch] = useState("");
    const [inviteAccount, setInviteAccount] = useState("");
    const [inviteRole, setInviteRole] = useState<AssignableOrganizationRole>("ORG_MEMBER");
    const [inviting, setInviting] = useState(false);
    const [invitation, setInvitation] = useState<{ token: string; expiresAt: string }>();
    const [copied, setCopied] = useState(false);
    const configuredWebOrigin = (import.meta as any).env?.VITE_WEB_APP_URL as string | undefined;
    const publicAppOrigin = (configuredWebOrigin || ((window as any).api ? "https://kotion.top:888" : window.location.origin)).replace(/\/$/, "");

    const isTeam = currentContext?.type === "TEAM";
    const role = currentContext?.memberRole;
    const isManager = role === "ORG_OWNER" || role === "ORG_ADMIN";
    const canInvite = isManager;
    const canUpdate = isManager;
    const canRemove = isManager;

    const loadMembers = async () => {
        if (!currentContext || currentContext.type !== "TEAM") {
            memberRequestRef.current += 1;
            setMembers([]);
            setMemberError("");
            setLoadingMembers(false);
            return;
        }
        const requestContextId = currentContext.id;
        const requestId = ++memberRequestRef.current;
        setLoadingMembers(true);
        setMemberError("");
        try {
            const res = await useApi(APIS.GET_ORGANIZATION_MEMBERS, { contextId: requestContextId });
            if (requestId === memberRequestRef.current) setMembers(res.data ?? []);
        } catch (error: any) {
            if (requestId === memberRequestRef.current) {
                setMembers([]);
                setMemberError(error?.response?.data?.msg || error?.message || t("settings.members.loadFailed"));
            }
        } finally {
            if (requestId === memberRequestRef.current) setLoadingMembers(false);
        }
    };

    useEffect(() => {
        setSearch("");
        setInviteAccount("");
        setInvitation(undefined);
        void loadMembers();
    }, [currentContext?.id]);

    const switchContext = async (context: ContextVO) => {
        if (context.id === currentContext?.id) return;
        setSwitchingId(context.id);
        try {
            const res = await useApi(APIS.SWITCH_CONTEXT, { contextId: context.id }, {
                refreshToken: getRefreshToken() || "",
            });
            const tokens = normalizeTokenResponse(res.data);
            if (!tokens.accessToken || !tokens.refreshToken) throw new Error("Missing context tokens");
            saveTokens(tokens.accessToken, tokens.refreshToken);
            clearContextSensitiveClientState();
            notifyContextChanged(context.id);
            window.location.assign("/");
        } finally {
            setSwitchingId(undefined);
        }
    };

    const createOrganization = async () => {
        const name = organizationName.trim();
        if (!name) return;
        setCreating(true);
        try {
            const res = await useApi(APIS.CREATE_ORGANIZATION, undefined, { name });
            setOrganizationName("");
            toast.success(t("settings.members.organizationCreated"));
            await switchContext(res.data);
        } finally {
            setCreating(false);
        }
    };

    const invite = async () => {
        const account = inviteAccount.trim();
        if (!currentContext || !account) return;
        setInviting(true);
        try {
            const res = await useApi(APIS.INVITE_ORGANIZATION_MEMBER, { contextId: currentContext.id }, { account, role: inviteRole });
            setInvitation(res.data);
            setInviteAccount("");
            toast.success(t("settings.members.inviteSent"));
            await loadMembers();
        } finally {
            setInviting(false);
        }
    };

    const updateRole = async (member: OrganizationMember, nextRole: AssignableOrganizationRole) => {
        if (!currentContext || member.memberRole === nextRole) return;
        await useApi(APIS.UPDATE_ORGANIZATION_MEMBER_ROLE, { contextId: currentContext.id, memberId: member.id }, { role: nextRole });
        toast.success(t("settings.members.roleUpdated"));
        await loadMembers();
    };

    const removeMember = async (member: OrganizationMember) => {
        if (!currentContext || !window.confirm(t("settings.members.removeConfirm", { account: member.account }))) return;
        await useApi(APIS.REMOVE_ORGANIZATION_MEMBER, { contextId: currentContext.id, memberId: member.id });
        toast.success(t("settings.members.memberRemoved"));
        await loadMembers();
    };

    const leaveOrganization = async () => {
        if (!currentContext || !window.confirm(t("settings.members.leaveConfirm", { name: currentContext.name }))) return;
        await useApi(APIS.LEAVE_ORGANIZATION, { contextId: currentContext.id });
        clearContextSensitiveClientState();
        clearTokens();
        notifyContextChanged("");
        window.location.assign("/login");
    };

    const copyInvitationLink = async () => {
        if (!invitation) return;
        const inviteUrl = `${publicAppOrigin}/organization-invite/${invitation.token}`;
        try {
            await navigator.clipboard.writeText(inviteUrl);
            setCopied(true);
            toast.success(t("settings.members.linkCopied"));
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error(t("settings.members.copyFailed"));
        }
    };

    const filteredMembers = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return members;
        return members.filter(member =>
            [member.account, member.name, member.displayName].some(value => value?.toLowerCase().includes(query)),
        );
    }, [members, search]);

    return (
        <SettingsPanel>
            <SettingsSection title={t("settings.members.contextTitle")} description={t("settings.members.contextDesc")} bare>
                <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
                    <div className="divide-y divide-border/60">
                        {availableContexts.map(context => {
                            const active = context.id === currentContext?.id;
                            return (
                                <button
                                    type="button"
                                    key={context.id}
                                    onClick={() => void switchContext(context)}
                                    disabled={active || Boolean(switchingId)}
                                    className={cn("flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60 disabled:cursor-default", active && "bg-accent")}
                                >
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted"><Building2 className="h-4 w-4" /></span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium">{context.name}</span>
                                        <span className="block text-xs text-muted-foreground">{context.type === "TEAM" ? t("settings.members.organization") : t("settings.members.personal")}</span>
                                    </span>
                                    {active ? <Badge variant="secondary">{t("settings.members.current")}</Badge> : switchingId === context.id ? <span className="text-xs text-muted-foreground">{t("settings.members.switching")}</span> : null}
                                </button>
                            );
                        })}
                    </div>
                    <Separator />
                    <div className="flex flex-col gap-2 p-4 md:flex-row">
                        <Input value={organizationName} maxLength={100} onChange={event => setOrganizationName(event.target.value)} placeholder={t("settings.members.organizationName")} className="h-11 lg:h-9" />
                        <Button onClick={createOrganization} disabled={creating || !organizationName.trim()} className="h-11 gap-2 lg:h-9">
                            <Plus className="h-4 w-4" />{creating ? t("settings.members.creating") : t("settings.members.createOrganization")}
                        </Button>
                    </div>
                </div>
            </SettingsSection>

            {isTeam ? (
                <>
                    {canInvite && (
                        <SettingsSection title={t("settings.members.inviteTitle")} description={t("settings.members.exactAccountInviteDesc")} bare>
                            <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
                                <div className="grid gap-2 md:grid-cols-[1fr_160px_auto]">
                                    <Input value={inviteAccount} onChange={event => setInviteAccount(event.target.value)} placeholder={t("settings.members.accountPlaceholder")} className="h-11 lg:h-9" />
                                    <Select value={inviteRole} onValueChange={value => setInviteRole(value as AssignableOrganizationRole)}>
                                        <SelectTrigger className="h-11 lg:h-9"><SelectValue /></SelectTrigger>
                                        <SelectContent>{roleOptions.map(option => <SelectItem key={option} value={option}>{roleLabel(option, t)}</SelectItem>)}</SelectContent>
                                    </Select>
                                    <Button onClick={invite} disabled={inviting || !inviteAccount.trim()} className="h-11 lg:h-9">{inviting ? t("settings.members.inviting") : t("settings.members.inviteBtn")}</Button>
                                </div>
                                {invitation && (
                                    <div className="rounded-lg border bg-muted/40 p-3">
                                        <div className="flex items-center gap-2">
                                            <code className="min-w-0 flex-1 truncate text-xs">{`${publicAppOrigin}/organization-invite/${invitation.token}`}</code>
                                            <Button variant="outline" onClick={copyInvitationLink} className="h-11 gap-1.5">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? t("settings.members.copied") : t("settings.members.copyLink")}</Button>
                                        </div>
                                        <p className="mt-2 text-xs text-muted-foreground">{t("settings.members.expiresAt", { value: invitation.expiresAt })}</p>
                                    </div>
                                )}
                            </div>
                        </SettingsSection>
                    )}

                    <SettingsSection
                        title={t("settings.members.teamTitle")}
                        description={t("settings.members.teamDesc")}
                        action={<Badge variant="secondary">{t("settings.members.count", { n: members.length })}</Badge>}
                        bare
                    >
                        <div className="space-y-3">
                            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder={t("settings.members.search")} className="h-11 pl-9 lg:h-9" /></div>
                            {loadingMembers ? (
                                <div className="rounded-xl border py-10 text-center text-sm text-muted-foreground">{t("settings.members.loading")}</div>
                            ) : memberError ? (
                                <div className="rounded-xl border border-destructive/30 p-6 text-center">
                                    <p className="text-sm text-destructive">{memberError}</p>
                                    <Button variant="outline" className="mt-4 h-11" onClick={() => void loadMembers()}>{t("settings.members.retry")}</Button>
                                </div>
                            ) : filteredMembers.length ? (
                                <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card">
                                    {filteredMembers.map(member => (
                                        <MemberRow
                                            key={member.id}
                                            member={member}
                                            currentUserId={userInfo?.id}
                                            canUpdate={canUpdate}
                                            canRemove={canRemove}
                                            onRoleChange={updateRole}
                                            onRemove={removeMember}
                                            usePath={usePath}
                                            t={t}
                                        />
                                    ))}
                                </div>
                            ) : <div className="rounded-xl border py-8"><Empty title={t("settings.members.emptyMembers")} desc={t("settings.members.emptyMembersDesc")} /></div>}
                        </div>
                    </SettingsSection>

                    {role !== "ORG_OWNER" && (
                        <SettingsSection title={t("settings.members.leaveTitle")} description={t("settings.members.leaveDesc")} bare>
                            <Button variant="destructive" onClick={leaveOrganization} className="h-11 gap-2"><LogOut className="h-4 w-4" />{t("settings.members.leaveOrganization")}</Button>
                        </SettingsSection>
                    )}
                </>
            ) : (
                <div className="rounded-xl border border-dashed py-10"><Empty title={t("settings.members.personalTitle")} desc={t("settings.members.personalDesc")} /></div>
            )}
        </SettingsPanel>
    );
};

const MemberRow: React.FC<{
    member: OrganizationMember;
    currentUserId?: string;
    canUpdate: boolean;
    canRemove: boolean;
    onRoleChange: (member: OrganizationMember, role: AssignableOrganizationRole) => void;
    onRemove: (member: OrganizationMember) => void;
    usePath: (path: string) => string;
    t: (key: string, options?: any) => string;
}> = ({ member, currentUserId, canUpdate, canRemove, onRoleChange, onRemove, usePath, t }) => {
    const isOwner = member.memberRole === "ORG_OWNER";
    const isSelf = member.userId === currentUserId;
    return (
        <div className="group flex min-h-14 items-center gap-3 px-4 py-3">
            <Avatar className="h-9 w-9"><AvatarImage src={usePath(member.avatar || '')} /><AvatarFallback>{(member.displayName || member.name || member.account || "U").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5"><span className="truncate text-sm font-medium">{member.displayName || member.name || member.account}</span><RoleBadge role={member.memberRole} t={t} />{member.status === 0 && <Badge variant="outline">{t("settings.members.pending")}</Badge>}{member.status === 2 && <Badge variant="outline">{t("settings.members.suspended")}</Badge>}</div>
                <div className="truncate text-xs text-muted-foreground">{member.account}</div>
            </div>
            {!isOwner && !isSelf && (canUpdate || canRemove) && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-11 w-11 lg:h-9 lg:w-9" aria-label={t("settings.members.memberActions")}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {canUpdate && roleOptions.map(option => <DropdownMenuItem key={option} disabled={member.memberRole === option} onClick={() => onRoleChange(member, option)}>{roleLabel(option, t)}</DropdownMenuItem>)}
                        {canUpdate && canRemove && <DropdownMenuSeparator />}
                        {canRemove && <DropdownMenuItem className="text-destructive" onClick={() => onRemove(member)}>{t("settings.members.removeMember")}</DropdownMenuItem>}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    );
};

const RoleBadge: React.FC<{ role: OrganizationRole; t: (key: string) => string }> = ({ role, t }) => {
    const Icon = role === "ORG_OWNER" ? Crown : role === "ORG_ADMIN" ? Shield : Users;
    return <Badge variant="outline" className="gap-1 font-normal text-muted-foreground"><Icon className="h-3 w-3" />{roleLabel(role, t)}</Badge>;
};

function roleLabel(role: OrganizationRole, t: (key: string) => string) {
    if (role === "ORG_OWNER" || role === "PERSONAL_OWNER") return t("settings.members.roleOwner");
    if (role === "ORG_ADMIN") return t("settings.members.roleAdmin");
    if (role === "ORG_GUEST") return t("settings.members.roleGuest");
    return t("settings.members.roleMember");
}
