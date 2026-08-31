import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
    Avatar, AvatarFallback, AvatarImage,
    Badge, Button,
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
    Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
    Skeleton, cn, toast,
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from "@kn/ui";
import { Crown, LogOut, Mail, MoreHorizontal, Search, Shield, UserMinus, UserPlus, Users, X } from "@kn/icon";
import {
    canManageMembers,
    GlobalState,
    type MemberRole,
    type PendingInvitation,
    type SpaceMember,
    type UserSummary,
    useDebounce,
    useNavigator,
    useSafeState,
    useSelector,
    useSpacePageService,
    useTranslation,
} from "@kn/common";
import { SettingContext } from "../index";

export const Members: React.FC = () => {
    const { t } = useTranslation()
    const { spaceId } = useContext(SettingContext)
    const navigator = useNavigator()
    const service = useSpacePageService()
    const { userInfo } = useSelector((state: GlobalState) => state)

    const [members, setMembers] = useSafeState<SpaceMember[]>([])
    const [loading, setLoading] = useSafeState(true)
    const [inviteOpen, setInviteOpen] = useState(false)
    const [searchKeyword, setSearchKeyword] = useState('')
    const [searchResults, setSearchResults] = useState<UserSummary[]>([])
    const [searching, setSearching] = useState(false)
    const [selectedRole, setSelectedRole] = useState<MemberRole>('MEMBER')

    // Member list filters
    const [memberFilter, setMemberFilter] = useState('')
    const [roleFilter, setRoleFilter] = useState<string>('ALL')

    // Pending invitations
    const [pending, setPending] = useSafeState<PendingInvitation[]>([])
    const [loadingPending, setLoadingPending] = useSafeState(false)

    // Transfer ownership / leave space confirm dialogs
    const [transferTarget, setTransferTarget] = useState<SpaceMember | null>(null)
    const [transferring, setTransferring] = useState(false)
    const [leaveOpen, setLeaveOpen] = useState(false)
    const [leaving, setLeaving] = useState(false)

    const debouncedKeyword = useDebounce(searchKeyword, { wait: 400 })

    // Current user's role in this space drives which actions are visible
    const myRole: MemberRole | undefined = useMemo(() => {
        const me = members.find(m => String(m.id) === String(userInfo?.id))
        return me?.role
    }, [members, userInfo?.id])
    const isOwner = myRole === 'OWNER'
    const canManage = canManageMembers(myRole)

    // Fetch members
    const fetchMembers = useCallback(() => {
        if (!spaceId) return
        setLoading(true)
        service.members.listSpaceMembers(spaceId)
            .then(setMembers)
            .catch(() => {
                toast.error(t('members.fetchError', 'Failed to load members'))
                setMembers([])
            })
            .finally(() => setLoading(false))
    }, [service, spaceId, t])

    useEffect(() => { fetchMembers() }, [fetchMembers])

    // Fetch pending invitations (admin only, backend enforces too)
    const fetchPending = useCallback(() => {
        if (!spaceId || !canManage) return
        setLoadingPending(true)
        service.members.listPendingInvitations(spaceId)
            .then(setPending)
            .catch(() => setPending([]))
            .finally(() => setLoadingPending(false))
    }, [service, spaceId, canManage])

    useEffect(() => { fetchPending() }, [fetchPending])

    useEffect(() => {
        if (!spaceId) return
        return service.changes.subscribe('space.members.changed', change => {
            if (change.payload.spaceId !== spaceId) return
            if (canManage) fetchPending()
        })
    }, [service, spaceId, canManage, fetchMembers, fetchPending])

    useEffect(() => {
        if (!spaceId || !canManage) return
        return service.changes.subscribe('collaboration.changed', change => {
            if (change.payload.spaceId === spaceId) fetchPending()
        })
    }, [service, spaceId, canManage, fetchPending])

    // Search users for invitation
    useEffect(() => {
        if (!debouncedKeyword || debouncedKeyword.length < 2) {
            setSearchResults([])
            return
        }
        setSearching(true)
        service.members.searchUsers({ keyword: debouncedKeyword, pageSize: 5 })
            .then(result => setSearchResults(result.records))
            .catch(() => setSearchResults([]))
            .finally(() => setSearching(false))
    }, [service, debouncedKeyword])

    // Invite a user
    const handleInvite = useCallback(async (userId: string) => {
        if (!spaceId) return
        try {
            await service.members.inviteSpaceMembers({
                spaceId,
                userIds: [userId],
                role: selectedRole
            })
            toast.success(t('members.invited', 'Member invited successfully'))
            setSearchKeyword('')
            setSearchResults([])
        } catch {
            toast.error(t('members.inviteError', 'Failed to invite member'))
        }
    }, [service, spaceId, selectedRole, t])

    // Update role
    const handleUpdateRole = useCallback(async (userId: string, role: MemberRole) => {
        if (!spaceId) return
        try {
            await service.members.updateSpaceMemberRole({ spaceId, userId, role })
            toast.success(t('members.roleUpdated', 'Role updated'))
        } catch {
            toast.error(t('members.roleError', 'Failed to update role'))
        }
    }, [service, spaceId, t])

    // Remove member
    const handleRemove = useCallback(async (userId: string) => {
        if (!spaceId) return
        try {
            await service.members.removeSpaceMember(spaceId, userId)
            toast.success(t('members.removed', 'Member removed'))
        } catch {
            toast.error(t('members.removeError', 'Failed to remove member'))
        }
    }, [service, spaceId, t])

    // Revoke a pending invitation
    const handleRevoke = useCallback(async (invitationId: string) => {
        if (!spaceId) return
        try {
            await service.members.revokeInvitation(spaceId, invitationId)
            toast.success(t('members.invitationRevoked', 'Invitation revoked'))
        } catch {
            toast.error(t('members.revokeError', 'Failed to revoke invitation'))
        }
    }, [service, spaceId, t])

    // Transfer ownership (OWNER only, double confirm via dialog)
    const handleTransfer = useCallback(async () => {
        if (!spaceId || !transferTarget) return
        setTransferring(true)
        try {
            await service.members.transferSpaceOwnership(spaceId, transferTarget.id)
            toast.success(t('members.transferred', 'Ownership transferred'))
            setTransferTarget(null)
        } catch {
            toast.error(t('members.transferError', 'Failed to transfer ownership'))
        } finally {
            setTransferring(false)
        }
    }, [service, spaceId, transferTarget, t])

    // Leave space (non-OWNER)
    const handleLeave = useCallback(async () => {
        if (!spaceId) return
        setLeaving(true)
        try {
            await service.members.leaveSpace(spaceId)
            toast.success(t('members.left', 'You have left the space'))
            navigator.go({ to: '/all-spaces' })
        } catch {
            toast.error(t('members.leaveError', 'Failed to leave the space'))
            setLeaving(false)
        }
    }, [service, spaceId, navigator, t])

    // Apply search / role filters to the member list
    const filteredMembers = useMemo(() => {
        const kw = memberFilter.trim().toLowerCase()
        return members.filter(m => {
            if (roleFilter !== 'ALL' && m.role !== roleFilter) return false
            if (!kw) return true
            return (m.name || '').toLowerCase().includes(kw)
                || (m.email || '').toLowerCase().includes(kw)
        })
    }, [members, memberFilter, roleFilter])

    const getRoleBadgeClass = (role: string) => {
        switch (role) {
            case 'OWNER': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
            case 'ADMIN': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
            case 'GUEST': return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            default: return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-base font-semibold">{t('members.title', 'Space Members')}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {t('members.subtitle', 'Manage who has access to this space')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Leave space — any non-owner member */}
                    {myRole && !isOwner && (
                        <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:text-destructive">
                                    <LogOut className="h-4 w-4" />
                                    {t('members.leave', 'Leave Space')}
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                    <DialogTitle>{t('members.leaveTitle', 'Leave this space?')}</DialogTitle>
                                    <DialogDescription>
                                        {t('members.leaveDesc', 'You will lose access to all pages in this space. You can rejoin only by invitation.')}
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setLeaveOpen(false)}>
                                        {t('members.cancel', 'Cancel')}
                                    </Button>
                                    <Button variant="destructive" onClick={handleLeave} disabled={leaving}>
                                        {t('members.leaveConfirm', 'Leave')}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    )}
                    {canManage && (
                        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                            <DialogTrigger asChild>
                                <Button size="sm" className="gap-1.5">
                                    <UserPlus className="h-4 w-4" />
                                    {t('members.invite', 'Invite')}
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                    <DialogTitle>{t('members.inviteTitle', 'Invite Members')}</DialogTitle>
                                    <DialogDescription>
                                        {t('members.inviteDesc', 'Search by name or email to invite members to this space.')}
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="flex items-center gap-2">
                                        <Input
                                            placeholder={t('members.searchPlaceholder', 'Search users...')}
                                            value={searchKeyword}
                                            onChange={(e) => setSearchKeyword(e.target.value)}
                                            className="flex-1"
                                            icon={<Search className="h-4 w-4" />}
                                        />
                                        <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as MemberRole)}>
                                            <SelectTrigger className="w-[120px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ADMIN">Admin</SelectItem>
                                                <SelectItem value="MEMBER">Member</SelectItem>
                                                <SelectItem value="GUEST">Guest</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {/* Search results */}
                                    <div className="max-h-[200px] overflow-auto space-y-1">
                                        {searching && (
                                            <div className="space-y-2">
                                                {Array.from({ length: 3 }).map((_, i) => (
                                                    <Skeleton key={i} className="h-10 w-full rounded-md" />
                                                ))}
                                            </div>
                                        )}
                                        {!searching && searchResults.map(user => {
                                            const alreadyMember = members.some(member => member.id === user.id)
                                            return (
                                                <div key={user.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/60">
                                                    <Avatar className="h-8 w-8">
                                                        <AvatarImage src={user.avatar || user.avatarUrl} />
                                                        <AvatarFallback className="text-xs">
                                                            {(user.name || '?').charAt(0).toUpperCase()}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium truncate">{user.name}</p>
                                                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        variant={alreadyMember ? "ghost" : "outline"}
                                                        disabled={alreadyMember}
                                                        onClick={() => handleInvite(user.id)}
                                                        className="h-7 text-xs"
                                                    >
                                                        {alreadyMember ? t('members.joined', 'Joined') : t('members.add', 'Add')}
                                                    </Button>
                                                </div>
                                            )
                                        })}
                                        {!searching && debouncedKeyword.length >= 2 && searchResults.length === 0 && (
                                            <p className="text-xs text-muted-foreground text-center py-4">
                                                {t('members.noResults', 'No users found')}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
            </div>

            {/* Member list filters */}
            <div className="flex items-center gap-2">
                <Input
                    placeholder={t('members.filterPlaceholder', 'Search members...')}
                    value={memberFilter}
                    onChange={(e) => setMemberFilter(e.target.value)}
                    className="flex-1 h-8"
                    icon={<Search className="h-4 w-4" />}
                />
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-[130px] h-8">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">{t('members.allRoles', 'All roles')}</SelectItem>
                        <SelectItem value="OWNER">Owner</SelectItem>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                        <SelectItem value="MEMBER">Member</SelectItem>
                        <SelectItem value="GUEST">Guest</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Members List */}
            {loading ? (
                <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 p-3">
                            <Skeleton className="h-10 w-10 rounded-full" />
                            <div className="flex-1 space-y-1.5">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-24" />
                            </div>
                            <Skeleton className="h-6 w-16 rounded" />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="border rounded-lg divide-y">
                    {filteredMembers.map((member) => (
                        <div key={member.id} className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors">
                            <Avatar className="h-10 w-10">
                                <AvatarImage src={member.avatar} />
                                <AvatarFallback>
                                    {member.name?.charAt(0)?.toUpperCase() || '?'}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium truncate">{member.name}</p>
                                    {member.role === 'OWNER' && (
                                        <Crown className="h-3.5 w-3.5 text-amber-500" />
                                    )}
                                    {String(member.id) === String(userInfo?.id) && (
                                        <span className="text-[10px] text-muted-foreground">{t('members.you', '(you)')}</span>
                                    )}
                                </div>
                                {member.email && (
                                    <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                                )}
                            </div>
                            <span className={cn(
                                "text-[11px] font-medium px-2 py-0.5 rounded-full",
                                getRoleBadgeClass(member.role)
                            )}>
                                {member.role}
                            </span>
                            {canManage && member.role !== 'OWNER' && String(member.id) !== String(userInfo?.id) && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => handleUpdateRole(member.id, 'ADMIN')}>
                                            <Shield className="h-3.5 w-3.5 mr-2" />
                                            {t('members.makeAdmin', 'Make Admin')}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleUpdateRole(member.id, 'MEMBER')}>
                                            <Users className="h-3.5 w-3.5 mr-2" />
                                            {t('members.makeMember', 'Make Member')}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleUpdateRole(member.id, 'GUEST')}>
                                            <LogOut className="h-3.5 w-3.5 mr-2" />
                                            {t('members.makeGuest', 'Make Guest')}
                                        </DropdownMenuItem>
                                        {isOwner && (
                                            <>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={() => setTransferTarget(member)}>
                                                    <Crown className="h-3.5 w-3.5 mr-2" />
                                                    {t('members.transfer', 'Transfer Ownership')}
                                                </DropdownMenuItem>
                                            </>
                                        )}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            className="text-destructive"
                                            onClick={() => handleRemove(member.id)}
                                        >
                                            <UserMinus className="h-3.5 w-3.5 mr-2" />
                                            {t('members.remove', 'Remove')}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>
                    ))}
                    {filteredMembers.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Users className="h-12 w-12 text-muted-foreground/40 mb-3" />
                            <p className="text-sm font-medium">
                                {members.length === 0
                                    ? t('members.empty', 'No members yet')
                                    : t('members.noMatch', 'No members match the filter')}
                            </p>
                            {members.length === 0 && (
                                <p className="text-xs text-muted-foreground mt-1">
                                    {t('members.emptyDesc', 'Invite team members to start collaborating')}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Pending invitations (admins only) */}
            {canManage && (
                <div className="space-y-2">
                    <h4 className="text-sm font-semibold">{t('members.pendingTitle', 'Pending Invitations')}</h4>
                    {loadingPending ? (
                        <div className="space-y-2">
                            {Array.from({ length: 2 }).map((_, i) => (
                                <Skeleton key={i} className="h-12 w-full rounded-md" />
                            ))}
                        </div>
                    ) : pending.length === 0 ? (
                        <p className="text-xs text-muted-foreground border rounded-lg p-4 text-center">
                            {t('members.noPending', 'No pending invitations')}
                        </p>
                    ) : (
                        <div className="border rounded-lg divide-y">
                            {pending.map(inv => (
                                <div key={inv.id} className="flex items-center gap-3 p-3">
                                    <div className="p-2 rounded-md bg-muted">
                                        <Mail className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">
                                            {inv.inviteeName || inv.inviteeEmail || t('members.unknownInvitee', 'Unknown invitee')}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {inv.pageTitle
                                                ? t('members.pagePending', 'Page: {{title}}', { title: inv.pageTitle })
                                                : t('members.spacePending', 'Space invitation')}
                                            {inv.inviterName && ` · ${t('members.invitedBy', 'by {{name}}', { name: inv.inviterName })}`}
                                        </p>
                                    </div>
                                    <Badge variant="secondary" className="text-[11px]">{inv.permission}</Badge>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                        onClick={() => handleRevoke(inv.id)}
                                        title={t('members.revoke', 'Revoke')}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Transfer ownership confirm dialog */}
            <Dialog open={!!transferTarget} onOpenChange={(open) => { if (!open) setTransferTarget(null) }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('members.transferTitle', 'Transfer ownership?')}</DialogTitle>
                        <DialogDescription>
                            {t('members.transferDesc', 'Transfer ownership of this space to {{name}}. You will become an Admin and this cannot be undone by you.', { name: transferTarget?.name })}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTransferTarget(null)}>
                            {t('members.cancel', 'Cancel')}
                        </Button>
                        <Button variant="destructive" onClick={handleTransfer} disabled={transferring}>
                            {t('members.transferConfirm', 'Transfer')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
