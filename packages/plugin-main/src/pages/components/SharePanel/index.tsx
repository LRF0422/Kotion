import { Avatar, AvatarFallback, AvatarImage } from "@kn/ui";
import { Badge } from "@kn/ui";
import { Button } from "@kn/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@kn/ui";
import { Input } from "@kn/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kn/ui";
import { Separator } from "@kn/ui";
import { Switch } from "@kn/ui";
import {
    type CreateCollaborationInvitationRequest,
    type MemberRole,
    type PageCollaborator,
    type PagePermission,
    type ShareLinkInfo,
    type SpaceMember,
    type UserSummary,
    useDebounce,
    useSafeState,
    useSpacePageService,
} from "@kn/common";
import { Check, Copy, Globe, Link2, Loader2, Mail, RefreshCw, Search, Trash2, UserPlus, Users, X } from "@kn/icon";
import React, { PropsWithChildren, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useTranslation } from "@kn/common";
import { toast } from "@kn/ui";
import { cn } from "@kn/ui";

// ==================== Types ====================

/** A pending invite entry in the unified input: a site user or a raw email */
type InviteTarget =
    | { type: 'user'; user: UserSummary }
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
    const service = useSpacePageService();
    const spaceId = params.id ? String(params.id) : '';
    const pageId = params.pageId ? String(params.pageId) : '';
    const [internalOpen, setInternalOpen] = useState(false);
    const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
    const setOpen = onOpenChange || setInternalOpen;

    // Permission options - derived from i18n
    const PERMISSIONS = useMemo<Array<{
        value: PagePermission;
        label: string;
        description: string;
    }>>(() => [
        { value: 'READ', label: t('collaboration.permission-view'), description: t('collaboration.permission-view-desc') },
        { value: 'WRITE', label: t('collaboration.permission-edit'), description: t('collaboration.permission-edit-desc') },
        { value: 'ADMIN', label: t('collaboration.permission-admin'), description: t('collaboration.permission-admin-desc') },
    ], [t]);

    const ROLE_LABELS: Record<MemberRole, string> = useMemo(() => ({
        OWNER: t('share.role-owner'),
        ADMIN: t('share.role-admin'),
        MEMBER: t('share.role-member'),
        GUEST: t('share.role-guest'),
    }), [t]);

    // Unified invite input state
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useSafeState<UserSummary[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [targets, setTargets] = useSafeState<InviteTarget[]>([]);
    const [invitePermission, setInvitePermission] = useState<PagePermission>('WRITE');
    const [isInviting, setIsInviting] = useState(false);

    // People with access
    const [members, setMembers] = useSafeState<SpaceMember[]>([]);
    const [collaborators, setCollaborators] = useSafeState<PageCollaborator[]>([]);
    const [loadingAccess, setLoadingAccess] = useState(false);

    // Share link state
    const [shareLink, setShareLink] = useSafeState<ShareLinkInfo | null>(null);
    const [linkLoading, setLinkLoading] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);

    const debouncedQuery = useDebounce(query, { wait: 300 });
    const isEmailQuery = EMAIL_RE.test(query.trim());

    const searchUsers = useCallback(async (keyword: string) => {
        setIsSearching(true);
        try {
            const result = await service.members.searchUsers({ keyword, pageSize: 10 });
            setSearchResults(result.records);
        } catch (error) {
            console.error('Failed to search users:', error);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    }, [service]);

    const loadAccessList = useCallback(async () => {
        if (!spaceId || !pageId) return;
        setLoadingAccess(true);
        try {
            const [spaceMembers, pageCollaborators] = await Promise.all([
                service.members.listSpaceMembers(spaceId).catch(() => [] as SpaceMember[]),
                service.collaboration.getPageCollaborators(pageId).catch(() => [] as PageCollaborator[]),
            ]);
            setMembers(spaceMembers);
            const memberIds = new Set(spaceMembers.map(member => member.id));
            // Page collaborators section shows explicit page-level grants only;
            // members with GUEST role still appear here via their page grant
            setCollaborators(pageCollaborators.filter(user => {
                const member = spaceMembers.find(item => item.id === user.id);
                return !member || member.role === 'GUEST' || !memberIds.has(user.id);
            }));
        } catch (error) {
            console.error('Failed to load access list:', error);
        } finally {
            setLoadingAccess(false);
        }
    }, [service, spaceId, pageId]);

    const loadShareLink = useCallback(async () => {
        if (!pageId) return;
        setLinkLoading(true);
        try {
            setShareLink(await service.shares.getPageShareLink(pageId));
        } catch (error) {
            console.error('Failed to load share link:', error);
            setShareLink(null);
        } finally {
            setLinkLoading(false);
        }
    }, [service, pageId]);

    // Search site users when query changes (skip pure email input)
    useEffect(() => {
        if (debouncedQuery.length >= 2 && !EMAIL_RE.test(debouncedQuery.trim())) {
            searchUsers(debouncedQuery);
        } else {
            setSearchResults([]);
        }
    }, [debouncedQuery, searchUsers]);

    // Load access list + share link when panel opens
    useEffect(() => {
        if (open) {
            loadAccessList();
            loadShareLink();
        }
    }, [open, loadAccessList, loadShareLink]);

    useEffect(() => {
        if (!open || !spaceId) return;
        return service.changes.subscribe('space.members.changed', change => {
            if (change.payload.spaceId === spaceId) loadAccessList();
        });
    }, [service, open, spaceId, loadAccessList]);

    useEffect(() => {
        if (!open || !pageId) return;
        return service.changes.subscribe('page.permissions.changed', change => {
            if (change.payload.pageId === pageId) loadAccessList();
        });
    }, [service, open, pageId, loadAccessList]);

    useEffect(() => {
        if (!open || !pageId) return;
        return service.changes.subscribe('share.changed', change => {
            if (change.payload.pageId === pageId) setShareLink(change.payload.share ?? null);
        });
    }, [service, open, pageId]);

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
        if (!spaceId || !pageId || targets.length === 0) {
            toast.error(t('share.invite-empty'));
            return;
        }
        setIsInviting(true);
        try {
            const collaboratorIds = targets.flatMap(target => target.type === 'user' ? [target.user.id] : []);
            const collaboratorEmails = targets.flatMap(target => target.type === 'email' ? [target.email] : []);
            const request: CreateCollaborationInvitationRequest = {
                spaceId,
                pageId,
                permissions: [invitePermission],
                ...(collaboratorIds.length > 0 ? { collaboratorIds } : {}),
                ...(collaboratorEmails.length > 0 ? { collaboratorEmails } : {}),
            };
            await service.collaboration.createInvitation(request);
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

    const handleUpdatePermission = async (userId: string, permission: PagePermission) => {
        if (!pageId) return;
        try {
            await service.collaboration.updateCollaboratorPermission({ pageId, userId, permission });
            toast.success(t('collaboration.permission-updated'));
        } catch (error) {
            console.error('Failed to update permission:', error);
            toast.error(t('collaboration.permission-update-error'));
        }
    };

    const handleRemoveCollaborator = async (userId: string) => {
        if (!pageId) return;
        try {
            await service.collaboration.removePageCollaborator(pageId, userId);
            toast.success(t('collaboration.collaborator-removed'));
        } catch (error) {
            console.error('Failed to remove collaborator:', error);
            toast.error(t('collaboration.collaborator-remove-error'));
        }
    };

    // ==================== Share link handlers ====================

    /** (Re)generate the share link — backend keeps one active link per page */
    const generateLink = async (permission: PagePermission, expiresIn: number | null) => {
        if (!pageId) return;
        setLinkLoading(true);
        try {
            await service.shares.generateShareLink({
                pageId,
                isPublic: true,
                permission,
                ...(expiresIn ? { expiresIn } : {}),
            });
            toast.success(t('share.link-updated'));
        } catch (error) {
            console.error('Failed to generate share link:', error);
            toast.error(t('share.link-error'));
        } finally {
            setLinkLoading(false);
        }
    };

    const disableLink = async () => {
        if (!pageId || !shareLink) return;
        setLinkLoading(true);
        try {
            await service.shares.disableShareLink(pageId, shareLink.shortCode);
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
                        <Select value={invitePermission} onValueChange={value => setInvitePermission(value as PagePermission)}>
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
                                <div key={member.id} className="flex items-center gap-2 rounded-md p-1.5">
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
                                        onValueChange={(value) => handleUpdatePermission(user.id, value as PagePermission)}
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
                                    onValueChange={(value) => generateLink(value as PagePermission, currentExpiry === '0' ? null : Number(currentExpiry))}
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
