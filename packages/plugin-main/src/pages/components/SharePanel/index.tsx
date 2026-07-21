import { APIS } from "../../../api";
import { Avatar, AvatarFallback, AvatarImage } from "@kn/ui";
import { Badge } from "@kn/ui";
import { Button } from "@kn/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@kn/ui";
import { Input } from "@kn/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kn/ui";
import { Separator } from "@kn/ui";
import { Switch } from "@kn/ui";
import { useApi, useSafeState, useDebounce } from "@kn/common";
import { Check, Copy, Globe, Link2, Loader2, Mail, RefreshCw, Search, Trash2, UserPlus, Users, X } from "@kn/icon";
import React, { PropsWithChildren, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useTranslation } from "@kn/common";
import { toast } from "@kn/ui";
import { cn } from "@kn/ui";
import type { PagePermission, ShareLinkInfo, SpaceMember } from "../../../model/Space";

// ==================== Types ====================

interface CollaboratorUser {
    id: string;
    name: string;
    email?: string;
    avatar?: string;
    permission?: PagePermission;
}

/** A pending invite entry in the unified input: a site user or a raw email */
type InviteTarget =
    | { type: 'user'; user: CollaboratorUser }
    | { type: 'email'; email: string };

interface SharePanelProps extends PropsWithChildren {
    pageTitle?: string;
    onInviteSuccess?: () => void;
    /** Controlled open state */
    open?: boolean;
    /** Callback when open state changes */
    onOpenChange?: (open: boolean) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Notion-style share panel: unified invite input + permission list + share link */
export const SharePanel: React.FC<SharePanelProps> = (props) => {
    const { pageTitle, onInviteSuccess, open: controlledOpen, onOpenChange } = props;
    const { t } = useTranslation();
    const params = useParams();
    const [internalOpen, setInternalOpen] = useState(false);
    const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
    const setOpen = onOpenChange || setInternalOpen;

    // Permission options - derived from i18n
    const PERMISSIONS = useMemo(() => [
        { value: 'READ', label: t('collaboration.permission-view'), description: t('collaboration.permission-view-desc') },
        { value: 'WRITE', label: t('collaboration.permission-edit'), description: t('collaboration.permission-edit-desc') },
        { value: 'ADMIN', label: t('collaboration.permission-admin'), description: t('collaboration.permission-admin-desc') },
    ], [t]);

    const ROLE_LABELS: Record<string, string> = useMemo(() => ({
        OWNER: t('share.role-owner'),
        ADMIN: t('share.role-admin'),
        MEMBER: t('share.role-member'),
        GUEST: t('share.role-guest'),
    }), [t]);

    // Unified invite input state
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useSafeState<CollaboratorUser[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [targets, setTargets] = useSafeState<InviteTarget[]>([]);
    const [invitePermission, setInvitePermission] = useState<string>('WRITE');
    const [isInviting, setIsInviting] = useState(false);

    // People with access
    const [members, setMembers] = useSafeState<SpaceMember[]>([]);
    const [collaborators, setCollaborators] = useSafeState<CollaboratorUser[]>([]);
    const [loadingAccess, setLoadingAccess] = useState(false);

    // Share link state
    const [shareLink, setShareLink] = useSafeState<ShareLinkInfo | null>(null);
    const [linkLoading, setLinkLoading] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);

    const debouncedQuery = useDebounce(query, { wait: 300 });
    const isEmailQuery = EMAIL_RE.test(query.trim());

    // Search site users when query changes (skip pure email input)
    useEffect(() => {
        if (debouncedQuery.length >= 2 && !EMAIL_RE.test(debouncedQuery.trim())) {
            searchUsers(debouncedQuery);
        } else {
            setSearchResults([]);
        }
    }, [debouncedQuery]);

    // Load access list + share link when panel opens
    useEffect(() => {
        if (open) {
            loadAccessList();
            loadShareLink();
        }
    }, [open]);

    const searchUsers = async (keyword: string) => {
        setIsSearching(true);
        try {
            const res = await useApi(APIS.SEARCH_USERS, { keyword, pageSize: 10 });
            const users = (res.data?.records || res.data || []).map((user: any) => ({
                id: user.id,
                name: user.name || user.username || user.nickName,
                email: user.email,
                avatar: user.avatar || user.avatarUrl,
            }));
            setSearchResults(users);
        } catch (error) {
            console.error('Failed to search users:', error);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    const loadAccessList = async () => {
        setLoadingAccess(true);
        try {
            const [memberRes, collabRes] = await Promise.all([
                useApi(APIS.LIST_SPACE_MEMBERS, { spaceId: params.id }).catch(() => ({ data: [] })),
                useApi(APIS.GET_PAGE_COLLABORATORS, { pageId: params.pageId }).catch(() => ({ data: [] })),
            ]);
            setMembers(memberRes.data || []);
            const memberIds = new Set((memberRes.data || []).map((m: any) => String(m.id)));
            const users = (collabRes.data || []).map((user: any) => ({
                id: user.id,
                name: user.name || user.username || user.nickName,
                email: user.email,
                avatar: user.avatar || user.avatarUrl,
                permission: (user.permission || 'READ') as PagePermission,
            }));
            // Page collaborators section shows explicit page-level grants only;
            // members with GUEST role still appear here via their page grant
            setCollaborators(users.filter((u: CollaboratorUser) => {
                const member = (memberRes.data || []).find((m: any) => String(m.id) === String(u.id));
                return !member || member.role === 'GUEST' || !memberIds.has(String(u.id));
            }));
        } catch (error) {
            console.error('Failed to load access list:', error);
        } finally {
            setLoadingAccess(false);
        }
    };

    const loadShareLink = async () => {
        setLinkLoading(true);
        try {
            const res = await useApi(APIS.GET_PAGE_SHARE_LINK, { pageId: params.pageId });
            setShareLink(res.data || null);
        } catch (error) {
            console.error('Failed to load share link:', error);
            setShareLink(null);
        } finally {
            setLinkLoading(false);
        }
    };

    // ==================== Invite handlers ====================

    const addTarget = useCallback((target: InviteTarget) => {
        setTargets(prev => {
            const exists = prev.some(x =>
                (x.type === 'user' && target.type === 'user' && x.user.id === target.user.id) ||
                (x.type === 'email' && target.type === 'email' && x.email === target.email)
            );
            return exists ? prev : [...prev, target];
        });
        setQuery('');
        setSearchResults([]);
    }, []);

    const removeTarget = useCallback((index: number) => {
        setTargets(prev => prev.filter((_, i) => i !== index));
    }, []);

    const handleInvite = async () => {
        if (targets.length === 0) {
            toast.error(t('share.invite-empty'));
            return;
        }
        setIsInviting(true);
        try {
            const collaboratorIds = targets.filter(x => x.type === 'user').map(x => (x as any).user.id);
            const collaboratorEmails = targets.filter(x => x.type === 'email').map(x => (x as any).email);
            const param: any = {
                spaceId: params.id,
                pageId: params.pageId,
                permissions: [invitePermission],
            };
            if (collaboratorIds.length > 0) param.collaboratorIds = collaboratorIds;
            if (collaboratorEmails.length > 0) param.collaboratorEmails = collaboratorEmails;
            await useApi(APIS.CREATE_INVITATION, null, param);
            toast.success(t('share.invite-success', { count: targets.length }));
            setTargets([]);
            onInviteSuccess?.();
        } catch (error) {
            console.error('Failed to send invitations:', error);
            toast.error(t('share.invite-error'));
        } finally {
            setIsInviting(false);
        }
    };

    // ==================== Collaborator handlers ====================

    const handleUpdatePermission = async (userId: string, permission: string) => {
        try {
            await useApi(APIS.UPDATE_COLLABORATOR_PERMISSION, { pageId: params.pageId, userId }, { permission });
            setCollaborators(prev => prev.map(c => c.id === userId ? { ...c, permission: permission as PagePermission } : c));
            toast.success(t('collaboration.permission-updated'));
        } catch (error) {
            console.error('Failed to update permission:', error);
            toast.error(t('collaboration.permission-update-error'));
        }
    };

    const handleRemoveCollaborator = async (userId: string) => {
        try {
            await useApi(APIS.REMOVE_PAGE_COLLABORATOR, { pageId: params.pageId, userId });
            setCollaborators(prev => prev.filter(c => c.id !== userId));
            toast.success(t('collaboration.collaborator-removed'));
        } catch (error) {
            console.error('Failed to remove collaborator:', error);
            toast.error(t('collaboration.collaborator-remove-error'));
        }
    };

    // ==================== Share link handlers ====================

    /** (Re)generate the share link — backend keeps one active link per page */
    const generateLink = async (permission: string, expiresIn: number | null) => {
        setLinkLoading(true);
        try {
            const body: any = { isPublic: true, permission };
            if (expiresIn) body.expiresIn = expiresIn;
            const res = await useApi(APIS.GENERATE_SHARE_LINK, { pageId: params.pageId }, body);
            setShareLink(res.data || null);
            toast.success(t('share.link-updated'));
        } catch (error) {
            console.error('Failed to generate share link:', error);
            toast.error(t('share.link-error'));
        } finally {
            setLinkLoading(false);
        }
    };

    const disableLink = async () => {
        if (!shareLink) return;
        setLinkLoading(true);
        try {
            await useApi(APIS.DISABLE_SHARE_LINK, { pageId: params.pageId, shortCode: shareLink.shortCode });
            setShareLink(null);
            toast.success(t('share.link-disabled'));
        } catch (error) {
            console.error('Failed to disable share link:', error);
            toast.error(t('share.link-error'));
        } finally {
            setLinkLoading(false);
        }
    };

    /** Current expiry bucket derived from the active link (0 = permanent) */
    const currentExpiry = useMemo(() => {
        if (!shareLink?.expiresAt || !shareLink.createdAt) return '0';
        const days = Math.round(
            (new Date(shareLink.expiresAt).getTime() - new Date(shareLink.createdAt).getTime()) / 86400000
        );
        return days <= 7 ? '7' : '30';
    }, [shareLink]);

    const handleCopyLink = async () => {
        if (!shareLink?.link) return;
        try {
            await navigator.clipboard.writeText(shareLink.link);
            setLinkCopied(true);
            toast.success(t('collaboration.link-copied'));
            setTimeout(() => setLinkCopied(false), 2000);
        } catch (error) {
            toast.error(t('collaboration.link-copy-error'));
        }
    };

    const getUserInitials = (name?: string) => name?.charAt(0)?.toUpperCase() || '?';

    // ==================== Render ====================

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{props.children}</DialogTrigger>
            <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        {t('share.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {pageTitle ? t('share.description-with-title', { title: pageTitle }) : t('share.description')}
                    </DialogDescription>
                </DialogHeader>

                {/* ===== Unified invite input ===== */}
                <div className="space-y-2">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder={t('share.input-placeholder')}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && isEmailQuery) {
                                        e.preventDefault();
                                        addTarget({ type: 'email', email: query.trim() });
                                    }
                                }}
                                className="pl-8"
                            />
                            {isSearching && (
                                <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                            )}
                        </div>
                        <Select value={invitePermission} onValueChange={setInvitePermission}>
                            <SelectTrigger className="w-[110px] shrink-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PERMISSIONS.map(p => (
                                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button onClick={handleInvite} disabled={isInviting || targets.length === 0} className="shrink-0">
                            {isInviting
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <UserPlus className="h-4 w-4" />}
                            <span className="ml-1">{t('share.invite')}</span>
                        </Button>
                    </div>

                    {/* Selected targets */}
                    {targets.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {targets.map((target, index) => (
                                <Badge key={index} variant="secondary" className="gap-1 pr-1">
                                    {target.type === 'email'
                                        ? <Mail className="h-3 w-3" />
                                        : null}
                                    {target.type === 'user' ? target.user.name : target.email}
                                    <button
                                        type="button"
                                        onClick={() => removeTarget(index)}
                                        className="rounded-full hover:bg-muted-foreground/20 p-0.5"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    )}

                    {/* Email quick-add hint */}
                    {isEmailQuery && (
                        <button
                            type="button"
                            onClick={() => addTarget({ type: 'email', email: query.trim() })}
                            className="flex w-full items-center gap-2 rounded-md border p-2 text-sm hover:bg-accent"
                        >
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            {t('share.invite-email', { email: query.trim() })}
                        </button>
                    )}

                    {/* Search results dropdown */}
                    {searchResults.length > 0 && (
                        <div className="rounded-md border divide-y max-h-[180px] overflow-y-auto">
                            {searchResults.map(user => {
                                const selected = targets.some(x => x.type === 'user' && x.user.id === user.id);
                                return (
                                    <button
                                        key={user.id}
                                        type="button"
                                        onClick={() => addTarget({ type: 'user', user })}
                                        className={cn(
                                            "flex w-full items-center gap-2 p-2 text-sm hover:bg-accent",
                                            selected && "opacity-50"
                                        )}
                                        disabled={selected}
                                    >
                                        <Avatar className="h-6 w-6">
                                            <AvatarImage src={user.avatar} />
                                            <AvatarFallback className="text-[10px]">{getUserInitials(user.name)}</AvatarFallback>
                                        </Avatar>
                                        <span className="font-medium">{user.name}</span>
                                        {user.email && <span className="text-muted-foreground text-xs">{user.email}</span>}
                                        {selected && <Check className="ml-auto h-4 w-4" />}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <Separator />

                {/* ===== People with access ===== */}
                <div className="space-y-2">
                    <div className="text-sm font-medium">{t('share.people-with-access')}</div>
                    {loadingAccess ? (
                        <div className="flex justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="space-y-1 max-h-[220px] overflow-y-auto">
                            {/* Space members — permission inherited from role, read-only here */}
                            {members.filter(m => m.role !== 'GUEST').map(member => (
                                <div key={String(member.id)} className="flex items-center gap-2 rounded-md p-1.5">
                                    <Avatar className="h-7 w-7">
                                        <AvatarImage src={member.avatar} />
                                        <AvatarFallback className="text-xs">{getUserInitials(member.name)}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate">{member.name}</div>
                                        {member.email && <div className="text-xs text-muted-foreground truncate">{member.email}</div>}
                                    </div>
                                    <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                                        {t('share.inherited-from-role', { role: ROLE_LABELS[member.role] || member.role })}
                                    </Badge>
                                </div>
                            ))}
                            {/* Page collaborators — explicit page-level grants, editable */}
                            {collaborators.map(user => (
                                <div key={user.id} className="flex items-center gap-2 rounded-md p-1.5">
                                    <Avatar className="h-7 w-7">
                                        <AvatarImage src={user.avatar} />
                                        <AvatarFallback className="text-xs">{getUserInitials(user.name)}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate">{user.name}</div>
                                        {user.email && <div className="text-xs text-muted-foreground truncate">{user.email}</div>}
                                    </div>
                                    <Select
                                        value={user.permission}
                                        onValueChange={(value) => handleUpdatePermission(user.id, value)}
                                    >
                                        <SelectTrigger className="w-[100px] h-7 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PERMISSIONS.map(p => (
                                                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                        onClick={() => handleRemoveCollaborator(user.id)}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ))}
                            {members.filter(m => m.role !== 'GUEST').length === 0 && collaborators.length === 0 && (
                                <div className="py-3 text-center text-sm text-muted-foreground">
                                    {t('share.no-access')}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <Separator />

                {/* ===== Share link ===== */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <div className="text-sm font-medium">{t('share.link-title')}</div>
                                <div className="text-xs text-muted-foreground">
                                    {shareLink
                                        ? (shareLink.permission === 'WRITE'
                                            ? t('share.link-anyone-edit')
                                            : t('share.link-anyone-view'))
                                        : t('share.link-off')}
                                </div>
                            </div>
                        </div>
                        <Switch
                            checked={!!shareLink}
                            disabled={linkLoading}
                            onCheckedChange={(checked) => {
                                if (checked) {
                                    generateLink('READ', null);
                                } else {
                                    disableLink();
                                }
                            }}
                        />
                    </div>

                    {shareLink && (
                        <div className="space-y-2">
                            <div className="flex gap-2">
                                {/* Link permission */}
                                <Select
                                    value={shareLink.permission}
                                    onValueChange={(value) => generateLink(value, currentExpiry === '0' ? null : Number(currentExpiry))}
                                >
                                    <SelectTrigger className="w-[130px] h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="READ">{t('share.link-perm-view')}</SelectItem>
                                        <SelectItem value="WRITE">{t('share.link-perm-edit')}</SelectItem>
                                    </SelectContent>
                                </Select>
                                {/* Expiry */}
                                <Select
                                    value={currentExpiry}
                                    onValueChange={(value) => generateLink(shareLink.permission, value === '0' ? null : Number(value))}
                                >
                                    <SelectTrigger className="w-[110px] h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="0">{t('share.expiry-never')}</SelectItem>
                                        <SelectItem value="7">{t('share.expiry-7d')}</SelectItem>
                                        <SelectItem value="30">{t('share.expiry-30d')}</SelectItem>
                                    </SelectContent>
                                </Select>
                                {/* Reset link */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 px-2 text-xs"
                                    disabled={linkLoading}
                                    onClick={() => generateLink(shareLink.permission, currentExpiry === '0' ? null : Number(currentExpiry))}
                                    title={t('share.reset-link-tip')}
                                >
                                    <RefreshCw className={cn("h-3.5 w-3.5", linkLoading && "animate-spin")} />
                                    <span className="ml-1">{t('share.reset-link')}</span>
                                </Button>
                            </div>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Link2 className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                                    <Input readOnly value={shareLink.link} className="pl-8 h-8 text-xs" />
                                </div>
                                <Button variant="outline" size="sm" className="h-8" onClick={handleCopyLink}>
                                    {linkCopied
                                        ? <Check className="h-3.5 w-3.5 text-emerald-500" />
                                        : <Copy className="h-3.5 w-3.5" />}
                                    <span className="ml-1 text-xs">{t('share.copy-link')}</span>
                                </Button>
                            </div>
                            {shareLink.expiresAt && (
                                <div className="text-xs text-muted-foreground">
                                    {t('share.expires-at', { time: new Date(shareLink.expiresAt).toLocaleString() })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default SharePanel;
