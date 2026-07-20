import React, { useCallback, useContext, useEffect, useState } from "react";
import {
    Avatar, AvatarFallback, AvatarImage,
    Button, Card, CardContent, CardHeader, CardTitle,
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
    Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
    Skeleton, cn, toast,
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@kn/ui";
import { MoreHorizontal, Search, Shield, UserMinus, UserPlus, Users, Crown, LogOut } from "@kn/icon";
import { useApi, useTranslation, useSafeState, useDebounce } from "@kn/common";
import { APIS } from "../../../../api";
import { SpaceMember, MemberRole } from "../../../../model/Space";
import { SettingContext } from "../index";

export const Members: React.FC = () => {
    const { t } = useTranslation()
    const { spaceId } = useContext(SettingContext)

    const [members, setMembers] = useSafeState<SpaceMember[]>([])
    const [loading, setLoading] = useSafeState(true)
    const [inviteOpen, setInviteOpen] = useState(false)
    const [searchKeyword, setSearchKeyword] = useState('')
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [searching, setSearching] = useState(false)
    const [selectedRole, setSelectedRole] = useState<MemberRole>('MEMBER')

    const debouncedKeyword = useDebounce(searchKeyword, { wait: 400 })

    // Fetch members
    const fetchMembers = useCallback(() => {
        if (!spaceId) return
        setLoading(true)
        useApi(APIS.LIST_SPACE_MEMBERS, { spaceId })
            .then(res => setMembers(res.data || []))
            .catch(() => {
                toast.error(t('members.fetchError', 'Failed to load members'))
                setMembers([])
            })
            .finally(() => setLoading(false))
    }, [spaceId, t])

    useEffect(() => { fetchMembers() }, [fetchMembers])

    // Search users for invitation
    useEffect(() => {
        if (!debouncedKeyword || debouncedKeyword.length < 2) {
            setSearchResults([])
            return
        }
        setSearching(true)
        useApi(APIS.SEARCH_USERS, { keyword: debouncedKeyword, pageSize: 5 })
            .then(res => setSearchResults(res.data?.records || []))
            .catch(() => setSearchResults([]))
            .finally(() => setSearching(false))
    }, [debouncedKeyword])

    // Invite a user
    const handleInvite = useCallback(async (userId: string | number) => {
        if (!spaceId) return
        try {
            await useApi(APIS.INVITE_SPACE_MEMBERS, { spaceId }, {
                spaceId,
                userIds: [userId],
                role: selectedRole
            })
            toast.success(t('members.invited', 'Member invited successfully'))
            setSearchKeyword('')
            setSearchResults([])
            fetchMembers()
        } catch {
            toast.error(t('members.inviteError', 'Failed to invite member'))
        }
    }, [spaceId, selectedRole, fetchMembers, t])

    // Update role
    const handleUpdateRole = useCallback(async (userId: string | number, role: MemberRole) => {
        if (!spaceId) return
        try {
            await useApi(APIS.UPDATE_SPACE_MEMBER_ROLE, { spaceId }, { userId, role })
            toast.success(t('members.roleUpdated', 'Role updated'))
            fetchMembers()
        } catch {
            toast.error(t('members.roleError', 'Failed to update role'))
        }
    }, [spaceId, fetchMembers, t])

    // Remove member
    const handleRemove = useCallback(async (userId: string | number) => {
        if (!spaceId) return
        try {
            await useApi(APIS.REMOVE_SPACE_MEMBER, { spaceId, userId })
            toast.success(t('members.removed', 'Member removed'))
            fetchMembers()
        } catch {
            toast.error(t('members.removeError', 'Failed to remove member'))
        }
    }, [spaceId, fetchMembers, t])

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
                                {!searching && searchResults.map((user: any) => {
                                    const alreadyMember = members.some(m => String(m.id) === String(user.userId || user.id))
                                    return (
                                        <div key={user.userId || user.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/60">
                                            <Avatar className="h-8 w-8">
                                                <AvatarImage src={user.avatar} />
                                                <AvatarFallback className="text-xs">
                                                    {(user.userName || user.name || '?').charAt(0).toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">{user.userName || user.name}</p>
                                                <p className="text-xs text-muted-foreground truncate">{user.email || user.account}</p>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant={alreadyMember ? "ghost" : "outline"}
                                                disabled={alreadyMember}
                                                onClick={() => handleInvite(user.userId || user.id)}
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
                    {members.map((member) => (
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
                            {member.role !== 'OWNER' && (
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
                    {members.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <Users className="h-12 w-12 text-muted-foreground/40 mb-3" />
                            <p className="text-sm font-medium">{t('members.empty', 'No members yet')}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                                {t('members.emptyDesc', 'Invite team members to start collaborating')}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
