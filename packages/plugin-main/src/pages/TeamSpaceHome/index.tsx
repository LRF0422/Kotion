import React, { useCallback, useEffect, useState } from "react";
import {
    Button, Card, CardContent, CardHeader, CardTitle,
    Skeleton, cn, toast, Avatar, AvatarFallback, AvatarImage,
    Badge, Tabs, TabsContent, TabsList, TabsTrigger
} from "@kn/ui";
import {
    Clock, FileText, Plus, Settings, Users, UserPlus, ArrowRight, Activity, Pin,
    LayoutDashboard, TrendingUp, FolderOpen, MessageSquare
} from "@kn/icon";
import { useApi, useNavigator, useTranslation, useSafeState, useParams } from "@kn/common";
import { APIS } from "../../api";
import { Space, SpaceMember } from "../../model/Space";
import { ActivityFeed } from "../SpaceDetail/ActivityFeed";
import { PageItemIcon } from "../SpaceDetail/components/PageItemIcon";

export const TeamSpaceHome: React.FC<{ space?: Space; spaceId?: string; onCreatePage?: () => void; onNavigateSettings?: () => void }> = (props) => {
    const { t } = useTranslation()
    const navigator = useNavigator()
    const params = useParams()

    const spaceId = props.spaceId || params.id

    const [space, setSpace] = useSafeState<Space | undefined>(props.space)
    const [members, setMembers] = useSafeState<SpaceMember[]>([])
    const [recentPages, setRecentPages] = useSafeState<any[]>([])
    const [pinnedPages, setPinnedPages] = useSafeState<any[]>([])
    const [loadingMembers, setLoadingMembers] = useSafeState(true)
    const [loadingPages, setLoadingPages] = useSafeState(true)
    const [loadingPinned, setLoadingPinned] = useSafeState(true)
    const [pageCount, setPageCount] = useSafeState(0)
    const [activityCount, setActivityCount] = useSafeState(0)

    // Fetch space info if not provided via props
    useEffect(() => {
        if (!props.space && spaceId) {
            useApi(APIS.SPACE_DETAIL, { id: spaceId })
                .then(res => setSpace(res.data))
                .catch(() => { })
        }
    }, [spaceId, props.space])

    // Fetch space members
    useEffect(() => {
        setLoadingMembers(true)
        useApi(APIS.LIST_SPACE_MEMBERS, { spaceId })
            .then(res => setMembers(res.data || []))
            .catch(() => setMembers([]))
            .finally(() => setLoadingMembers(false))
    }, [spaceId])

    // Fetch recent pages for this space
    useEffect(() => {
        setLoadingPages(true)
        useApi(APIS.QUERY_RECENT_PAGE, { spaceId, pageSize: 8 })
            .then(res => {
                const records = res.data?.records || []
                setRecentPages(records)
                setPageCount(res.data?.total || records.length)
            })
            .catch(() => setRecentPages([]))
            .finally(() => setLoadingPages(false))
    }, [spaceId])

    // Fetch pinned pages
    useEffect(() => {
        setLoadingPinned(true)
        useApi(APIS.GET_PINNED_PAGES, { spaceId })
            .then(res => setPinnedPages(res.data || []))
            .catch(() => setPinnedPages([]))
            .finally(() => setLoadingPinned(false))
    }, [spaceId])

    const handleNavigateMembers = useCallback(() => {
        navigator.go({ to: `/space-detail/${spaceId}/settings` })
    }, [navigator, spaceId])

    const handleNavigateSettings = useCallback(() => {
        if (props.onNavigateSettings) {
            props.onNavigateSettings()
        } else {
            navigator.go({ to: `/space-detail/${spaceId}/settings` })
        }
    }, [navigator, spaceId, props.onNavigateSettings])

    const onCreatePage = useCallback(() => {
        if (props.onCreatePage) {
            props.onCreatePage()
        } else {
            // Default: create a page in this space
            useApi(APIS.CREATE_OR_SAVE_PAGE, null, {
                spaceId,
                parentId: "0",
                title: "Untitled",
                content: JSON.stringify({ type: "doc", content: [{ type: "title", content: [{ type: "heading", content: [{ type: "text", text: "Untitled" }] }] }] })
            }).then(res => {
                const page = res.data
                if (page?.id) navigator.go({ to: `/space-detail/${spaceId}/page/edit/${page.id}` })
            })
        }
    }, [spaceId, navigator, props.onCreatePage])

    const handlePageClick = useCallback((pageId: string) => {
        navigator.go({ to: `/space-detail/${spaceId}/page/edit/${pageId}` })
    }, [navigator, spaceId])

    const getRoleColor = (role: string) => {
        switch (role) {
            case 'OWNER': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
            case 'ADMIN': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
            case 'GUEST': return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            default: return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
        }
    }

    if (!space) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <div className="space-y-4 w-64">
                    <Skeleton className="h-14 w-14 rounded-xl" />
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-4 w-64" />
                </div>
            </div>
        )
    }

    return (
        <div className="w-full h-full overflow-auto">
            <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
                {/* Space Header */}
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                            {space.icon?.icon ? <PageItemIcon icon={space.icon} size={28} /> : <FileText className="h-7 w-7 text-primary" />}
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">{space.name}</h1>
                            {space.description && (
                                <p className="text-sm text-muted-foreground mt-0.5 max-w-lg">
                                    {space.description}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handleNavigateSettings}>
                            <Settings className="h-4 w-4 mr-1.5" />
                            {t('teamSpace.settings', 'Settings')}
                        </Button>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="flex items-center gap-3">
                    <Button size="sm" onClick={onCreatePage} className="gap-1.5">
                        <Plus className="h-4 w-4" />
                        {t('teamSpace.newPage', 'New Page')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleNavigateMembers} className="gap-1.5">
                        <UserPlus className="h-4 w-4" />
                        {t('teamSpace.inviteMember', 'Invite Member')}
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Content Area - takes 2 cols */}
                    <div className="lg:col-span-2">
                        <Tabs defaultValue="overview" className="w-full">
                            <TabsList className="mb-3">
                                <TabsTrigger value="overview" className="gap-1.5">
                                    <LayoutDashboard className="h-3.5 w-3.5" />
                                    {t('teamSpace.overview', 'Overview')}
                                </TabsTrigger>
                                <TabsTrigger value="recent" className="gap-1.5">
                                    <Clock className="h-3.5 w-3.5" />
                                    {t('teamSpace.recentPages', 'Recent Pages')}
                                </TabsTrigger>
                                <TabsTrigger value="activity" className="gap-1.5">
                                    <Activity className="h-3.5 w-3.5" />
                                    {t('teamSpace.activity', 'Activity')}
                                </TabsTrigger>
                                <TabsTrigger value="pinned" className="gap-1.5">
                                    <Pin className="h-3.5 w-3.5" />
                                    {t('teamSpace.pinned', 'Pinned')}
                                </TabsTrigger>
                            </TabsList>

                            {/* Overview Tab */}
                            <TabsContent value="overview">
                                <div className="space-y-4">
                                    {/* Statistics Cards */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <Card className="border-border/60">
                                            <CardContent className="pt-4 pb-3 px-4">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                                                        <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                    </div>
                                                    <div>
                                                        <p className="text-lg font-bold leading-none">{pageCount}</p>
                                                        <p className="text-[11px] text-muted-foreground mt-0.5">{t('teamSpace.stat.pages', 'Pages')}</p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                        <Card className="border-border/60">
                                            <CardContent className="pt-4 pb-3 px-4">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                                                        <Users className="h-4 w-4 text-green-600 dark:text-green-400" />
                                                    </div>
                                                    <div>
                                                        <p className="text-lg font-bold leading-none">{members.length}</p>
                                                        <p className="text-[11px] text-muted-foreground mt-0.5">{t('teamSpace.stat.members', 'Members')}</p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                        <Card className="border-border/60">
                                            <CardContent className="pt-4 pb-3 px-4">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                                                        <Pin className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                                    </div>
                                                    <div>
                                                        <p className="text-lg font-bold leading-none">{pinnedPages.length}</p>
                                                        <p className="text-[11px] text-muted-foreground mt-0.5">{t('teamSpace.stat.pinned', 'Pinned')}</p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                        <Card className="border-border/60">
                                            <CardContent className="pt-4 pb-3 px-4">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                                                        <Activity className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                                    </div>
                                                    <div>
                                                        <p className="text-lg font-bold leading-none">{activityCount || '-'}</p>
                                                        <p className="text-[11px] text-muted-foreground mt-0.5">{t('teamSpace.stat.activities', 'Activities')}</p>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>

                                    {/* Recent Activity Summary */}
                                    <Card className="border-border/60">
                                        <CardHeader className="pb-2 pt-4 px-4">
                                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                                                {t('teamSpace.recentActivity', 'Recent Activity')}
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="px-4 pb-4">
                                            <ActivityFeed spaceId={spaceId!} className="max-h-[280px]" />
                                        </CardContent>
                                    </Card>

                                    {/* Quick Pages List */}
                                    {recentPages.length > 0 && (
                                        <Card className="border-border/60">
                                            <CardHeader className="pb-2 pt-4 px-4">
                                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                                    {t('teamSpace.recentlyEdited', 'Recently Edited')}
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="px-4 pb-4">
                                                <div className="space-y-0.5">
                                                    {recentPages.slice(0, 5).map((page: any) => (
                                                        <div
                                                            key={page.id}
                                                            role="button"
                                                            tabIndex={0}
                                                            onClick={() => handlePageClick(page.id)}
                                                            onKeyDown={(e) => e.key === 'Enter' && handlePageClick(page.id)}
                                                            className="flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors hover:bg-muted/60"
                                                        >
                                                            <div className="flex h-7 w-7 items-center justify-center rounded bg-muted shrink-0">
                                                                {page.icon?.icon ? <PageItemIcon icon={page.icon} size={14} /> : <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                                                            </div>
                                                            <p className="text-sm truncate flex-1">{page.title || t('teamSpace.untitled', 'Untitled')}</p>
                                                            <p className="text-[11px] text-muted-foreground shrink-0">
                                                                {page.updateTime && new Date(page.updateTime).toLocaleDateString()}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}
                                </div>
                            </TabsContent>

                            {/* Recent Pages Tab */}
                            <TabsContent value="recent">
                                <Card>
                                    <CardContent className="pt-4">
                                        {loadingPages ? (
                                            <div className="space-y-3">
                                                {Array.from({ length: 4 }).map((_, i) => (
                                                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                                                ))}
                                            </div>
                                        ) : recentPages.length > 0 ? (
                                            <div className="space-y-1">
                                                {recentPages.map((page: any) => (
                                                    <div
                                                        key={page.id}
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => handlePageClick(page.id)}
                                                        onKeyDown={(e) => e.key === 'Enter' && handlePageClick(page.id)}
                                                        className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors hover:bg-muted/60"
                                                    >
                                                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted shrink-0">
                                                            {page.icon?.icon ? <PageItemIcon icon={page.icon} size={16} /> : <FileText className="h-4 w-4 text-muted-foreground" />}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-medium truncate">
                                                                {page.title || t('teamSpace.untitled', 'Untitled')}
                                                            </p>
                                                            {page.updateTime && (
                                                                <p className="text-xs text-muted-foreground">
                                                                    {new Date(page.updateTime).toLocaleDateString()}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 opacity-0 group-hover:opacity-100" />
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-10 text-center">
                                                <FileText className="h-10 w-10 text-muted-foreground/40 mb-2" />
                                                <p className="text-sm text-muted-foreground">
                                                    {t('teamSpace.noPages', 'No pages yet. Create your first page!')}
                                                </p>
                                                <Button variant="outline" size="sm" onClick={onCreatePage} className="mt-3">
                                                    <Plus className="h-3.5 w-3.5 mr-1" />
                                                    {t('teamSpace.createFirst', 'Create Page')}
                                                </Button>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            {/* Activity Feed Tab */}
                            <TabsContent value="activity">
                                <Card>
                                    <CardContent className="pt-4">
                                        <ActivityFeed spaceId={spaceId!} />
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            {/* Pinned Pages Tab */}
                            <TabsContent value="pinned">
                                <Card>
                                    <CardContent className="pt-4">
                                        {loadingPinned ? (
                                            <div className="space-y-3">
                                                {Array.from({ length: 3 }).map((_, i) => (
                                                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                                                ))}
                                            </div>
                                        ) : pinnedPages.length > 0 ? (
                                            <div className="space-y-1">
                                                {pinnedPages.map((page: any) => (
                                                    <div
                                                        key={page.id}
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => handlePageClick(page.id)}
                                                        onKeyDown={(e) => e.key === 'Enter' && handlePageClick(page.id)}
                                                        className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors hover:bg-muted/60"
                                                    >
                                                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-50 dark:bg-amber-900/20 text-sm shrink-0">
                                                            <Pin className="h-4 w-4 text-amber-500" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-medium truncate">
                                                                {page.title || t('teamSpace.untitled', 'Untitled')}
                                                            </p>
                                                        </div>
                                                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-10 text-center">
                                                <Pin className="h-8 w-8 text-muted-foreground/40 mb-2" />
                                                <p className="text-sm text-muted-foreground">
                                                    {t('teamSpace.noPinned', 'No pinned pages yet')}
                                                </p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        </Tabs>
                    </div>

                    {/* Members Panel */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-3">
                            <CardTitle className="text-base font-semibold flex items-center gap-2">
                                <Users className="h-4 w-4 text-muted-foreground" />
                                {t('teamSpace.members', 'Members')}
                                {!loadingMembers && (
                                    <span className="text-xs text-muted-foreground font-normal">
                                        ({members.length})
                                    </span>
                                )}
                            </CardTitle>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={handleNavigateMembers}
                            >
                                {t('teamSpace.manage', 'Manage')}
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {loadingMembers ? (
                                <div className="space-y-3">
                                    {Array.from({ length: 3 }).map((_, i) => (
                                        <div key={i} className="flex items-center gap-3">
                                            <Skeleton className="h-8 w-8 rounded-full" />
                                            <div className="flex-1">
                                                <Skeleton className="h-3.5 w-24" />
                                                <Skeleton className="h-3 w-16 mt-1" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : members.length > 0 ? (
                                <div className="space-y-2">
                                    {members.slice(0, 8).map((member) => (
                                        <div key={member.id} className="flex items-center gap-2.5 py-1.5">
                                            <Avatar className="h-8 w-8">
                                                <AvatarImage src={member.avatar} />
                                                <AvatarFallback className="text-xs">
                                                    {member.name?.charAt(0)?.toUpperCase() || '?'}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">{member.name}</p>
                                            </div>
                                            <span className={cn(
                                                "text-[10px] font-medium px-1.5 py-0.5 rounded",
                                                getRoleColor(member.role)
                                            )}>
                                                {member.role}
                                            </span>
                                        </div>
                                    ))}
                                    {members.length > 8 && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="w-full h-8 text-xs text-muted-foreground"
                                            onClick={handleNavigateMembers}
                                        >
                                            {t('teamSpace.viewAll', 'View all {{count}} members', { count: members.length })}
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-8 text-center">
                                    <Users className="h-8 w-8 text-muted-foreground/40 mb-2" />
                                    <p className="text-xs text-muted-foreground">
                                        {t('teamSpace.noMembers', 'No members yet')}
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
