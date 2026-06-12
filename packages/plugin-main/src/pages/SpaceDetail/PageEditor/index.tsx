import { APIS } from "../../../api";
import { useIsMobile, Sheet, SheetContent, SheetTrigger, SheetTitle } from "@kn/ui";
import { Button } from "@kn/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, DropdownMenuPortal, DropdownMenuLabel } from "@kn/ui";
import { Label } from "@kn/ui";
import { RadioGroup, RadioGroupItem } from "@kn/ui";
import { Separator } from "@kn/ui";
import { Switch } from "@kn/ui";
import { Skeleton } from "@kn/ui";
import { CollaborationEditor, exportToPDF, useIncrementalSave, TiptapCollabProvider } from "@kn/editor";
import type { IncrementalPayload } from "@kn/editor";
import { event, ON_PAGE_REFRESH, ON_FAVORITE_CHANGE } from "../../../event";
import { useApi, useService, deepEqual, useUploadFile, parseMarkdownToNodes } from "@kn/common";
import { useNavigator } from "@kn/common";
import { GlobalState } from "@kn/common";
import { Editor } from "@kn/editor";
import * as Y from "@kn/editor";
import { useKeyPress, useToggle } from "@kn/common";
import {
    ALargeSmall, BookTemplate, Check, Pencil,
    Contact2, Download, FileIcon, FileText,
    Link, LoaderCircle, LockIcon, MessageSquareText,
    MoreHorizontal, MoveDownRight, Trash2, Upload, List,
    CloudOff, UserPlus, Star
} from "@kn/icon";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "@kn/common";
import { useParams } from "@kn/common";
import { toast } from "@kn/ui";
import { CollaborationInvitationDlg } from "../../components/CollaborationInvitationDlg";
import { PageBreadcrumb } from "../../../components/PageBreadcrumb";
import { TemplateCreator } from "../TemplateCreator";

// Status display configuration for save state
const getStatusDisplay = (saving: boolean, dirty: boolean, error: Error | null, progress?: { done: number; total: number } | null) => {
    if (saving) {
        const text = progress ? `Saving ${progress.done}/${progress.total}` : 'Saving';
        return { text, icon: <LoaderCircle className="h-3 w-3 animate-spin text-muted-foreground" />, className: 'text-muted-foreground' };
    }
    if (error) {
        return { text: 'Save failed', icon: <CloudOff className="h-3 w-3 text-destructive" />, className: 'text-destructive' };
    }
    if (dirty) {
        return { text: 'Editing', icon: <Pencil className="h-3 w-3 text-muted-foreground" />, className: 'text-muted-foreground' };
    }
    return { text: 'Saved', icon: <Check className="h-3 w-3 text-muted-foreground" />, className: 'text-muted-foreground' };
};

// Custom hook: wraps useIncrementalSave with the actual PATCH API call
// Includes prevVersion for optimistic concurrency and applies server
// version info after each successful save.
function usePageSave(editor: Editor | null, pageId: string | null, enabled: boolean) {
    // Throttle ON_PAGE_REFRESH emissions caused by rapid title typing
    const titleRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handleSave = useCallback(async (payload: IncrementalPayload) => {
        if (!pageId) throw new Error('No pageId')
        const hasTitleChange = payload.changes.some(c => c.type === 'title')
        const res = await useApi(APIS.PATCH_PAGE_BLOCKS, { id: pageId }, {
            pageId,
            changes: payload.changes.map(c => ({
                blockId: c.blockId,
                action: c.action,
                type: c.type,
                content: c.action === 'upsert'
                    ? JSON.stringify({ type: c.type, attrs: c.attrs, content: c.content })
                    : undefined,
                prevVersion: c.prevVersion,
            })),
        })
        // Apply server-returned version info so subsequent patches
        // carry the correct prevVersion
        const data = res?.data
        if (data?.blockVersions) {
            const tracker = (editor?.storage as any)?.dirtyTracker
            if (tracker?.applyServerVersions) {
                tracker.applyServerVersions(data.blockVersions)
            }
        }
        // After a successful save that touches the title block, notify the
        // left sidebar (page tree + favorites) to re-fetch so the renamed
        // title shows up immediately. Throttle to avoid spamming requests
        // during continuous typing.
        if (hasTitleChange) {
            if (titleRefreshTimerRef.current) {
                clearTimeout(titleRefreshTimerRef.current)
            }
            titleRefreshTimerRef.current = setTimeout(() => {
                event.emit(ON_PAGE_REFRESH)
                titleRefreshTimerRef.current = null
            }, 400)
        }
    }, [pageId, editor])

    // Bulk fast path for a first import/paste of a huge document: one POST that
    // the backend persists in chunked transactions and seals as a single page
    // version. Applies returned versions so later incremental patches are valid.
    const handleBulkSave = useCallback(async (payload: IncrementalPayload) => {
        if (!pageId) throw new Error('No pageId')
        const hasTitleChange = payload.changes.some(c => c.type === 'title')
        const res = await useApi(APIS.BULK_PATCH_PAGE_BLOCKS, { id: pageId }, {
            pageId,
            changes: payload.changes.map(c => ({
                blockId: c.blockId,
                action: c.action,
                type: c.type,
                content: c.action === 'upsert'
                    ? JSON.stringify({ type: c.type, attrs: c.attrs, content: c.content })
                    : undefined,
                prevVersion: c.prevVersion,
            })),
        })
        const data = res?.data
        if (data?.blockVersions) {
            const tracker = (editor?.storage as any)?.dirtyTracker
            if (tracker?.applyServerVersions) {
                tracker.applyServerVersions(data.blockVersions)
            }
        }
        if (hasTitleChange) {
            if (titleRefreshTimerRef.current) {
                clearTimeout(titleRefreshTimerRef.current)
            }
            titleRefreshTimerRef.current = setTimeout(() => {
                event.emit(ON_PAGE_REFRESH)
                titleRefreshTimerRef.current = null
            }, 400)
        }
    }, [pageId, editor])

    useEffect(() => {
        return () => {
            if (titleRefreshTimerRef.current) {
                clearTimeout(titleRefreshTimerRef.current)
                titleRefreshTimerRef.current = null
            }
        }
    }, [])

    return useIncrementalSave({
        editor,
        enabled,
        onSave: handleSave,
        onBulkSave: handleBulkSave,
    })
}

export const PageEditor: React.FC = () => {
    const isMobile = useIsMobile()
    const [tocOpen, setTocOpen] = useState(false)
    const [page, setPage] = useState<any>()
    const params = useParams()
    const { userInfo } = useSelector((state: GlobalState) => state)
    const [pageLoading, { toggle: toggleLoading }] = useToggle(false)
    const [synceStatus, setSyncStatus] = useState(false)
    const lastAwarenessRef = useRef<any[]>([])
    const [users, setUsers] = useState<any[]>([])
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
    const editor = useRef<Editor>(null)
    const navigator = useNavigator()
    const ref = useRef<any>()
    const spaceService = useService("spaceService")
    const { usePath } = useUploadFile();
    const [editorContentReady, setEditorContentReady] = useState(false)

    // Generate stable user color based on user ID
    const userColor = useMemo(() => {
        const colors = [
            '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
            '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
        ];
        const id = userInfo?.id || userInfo?.name || 'anonymous';
        const hash = String(id).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return colors[hash % colors.length];
    }, [userInfo?.id, userInfo?.name]);

    // Memoize user object to prevent infinite loop in CollaborationEditor
    const collaborationUser = useMemo(() => ({
        name: userInfo?.name || userInfo?.name || 'Anonymous',
        color: userColor,
        id: userInfo?.id,
        avatar: userInfo?.avatar ? usePath(userInfo.avatar) : undefined,
    }), [userInfo?.name, userInfo?.name, userInfo?.id, userColor, userInfo?.avatar, usePath]);

    // Track previous pageId and provider for cleanup
    const prevPageIdRef = useRef<string | undefined>(undefined);
    const prevProviderRef = useRef<TiptapCollabProvider | undefined>(undefined);

    // Create collaboration provider - deferred to avoid blocking on page switch
    const [deferredPageId, setDeferredPageId] = useState<string | undefined>(undefined);

    // Delay provider creation to next tick to avoid blocking UI
    React.useEffect(() => {
        const timer = setTimeout(() => {
            setDeferredPageId(params.pageId);
        }, 50);
        return () => clearTimeout(timer);
    }, [params.pageId]);

    const provider = React.useMemo(() => {
        const pageId = deferredPageId;
        if (!pageId) return undefined;

        // Cleanup previous provider asynchronously
        const prevProvider = prevProviderRef.current;
        if (prevProvider) {
            setTimeout(() => {
                prevProvider.awareness?.destroy();
                prevProvider.disconnect();
                prevProvider.destroy();
            }, 0);
        }

        const doc = new Y.Doc();
        const collabProvider = new TiptapCollabProvider({
            baseUrl: 'wss://kotion.top:8877/ws',
            name: `page:${pageId}`,
            token: pageId as string,
            document: doc,
            onAwarenessUpdate: ({ states }) => {
                const updatedUsers = states
                    .map((state) => ({
                        clientId: state.clientId,
                        user: state.user
                    }))
                    .filter(u => u.user); // Filter out states without user info

                if (!deepEqual(updatedUsers, lastAwarenessRef.current)) {
                    setUsers(updatedUsers);
                    lastAwarenessRef.current = updatedUsers;
                }
            },
            onSynced: () => {
                setSyncStatus(true);
                setConnectionStatus('connected');
            },
            onStatus: (status: any) => {
                if (status.status === 'connected') {
                    setConnectionStatus('connected');
                } else if (status.status === 'disconnected') {
                    setConnectionStatus('disconnected');
                } else {
                    setConnectionStatus('connecting');
                }
            }
        });

        prevPageIdRef.current = pageId;
        prevProviderRef.current = collabProvider;
        return collabProvider;
    }, [deferredPageId]);

    // Cleanup provider on unmount
    React.useEffect(() => {
        return () => {
            if (provider) {
                provider.awareness?.destroy();
                provider.disconnect();
                provider.destroy();
            }
        };
    }, [provider]);

    useEffect(() => {
        toggleLoading()
        spaceService.getPage(params.pageId!).then((res: any) => {
            setPage(res)
        }).catch((err: any) => {
            console.error('Failed to load page:', err)
            toast.error('Failed to load page content')
        }).finally(() => {
            toggleLoading()
        })

        return () => {
            setPage(null)
            setEditorContentReady(false)
        }
    }, [params.pageId])

    // Favorite state for the current page
    const [isFavorited, setIsFavorited] = useState(false)
    const [favoriteToggling, setFavoriteToggling] = useState(false)

    const refreshFavoriteState = useCallback(async () => {
        if (!params.pageId) return
        try {
            const res = await useApi(APIS.QUERY_FAVORITE, { pageSize: 1000 })
            const data = res?.data
            const list = Array.isArray(data) ? data : (data?.records || [])
            const pid = String(params.pageId)
            setIsFavorited(list.some((item: any) => String(item.id) === pid))
        } catch (err) {
            console.error('Failed to load favorite state:', err)
        }
    }, [params.pageId])

    useEffect(() => {
        refreshFavoriteState()
    }, [refreshFavoriteState])

    useEffect(() => {
        const handler = () => { refreshFavoriteState() }
        event.on(ON_FAVORITE_CHANGE, handler)
        return () => { event.off(ON_FAVORITE_CHANGE, handler) }
    }, [refreshFavoriteState])

    const toggleFavorite = useCallback(async () => {
        if (!params.pageId || favoriteToggling) return
        setFavoriteToggling(true)
        const prev = isFavorited
        // Optimistic update
        setIsFavorited(!prev)
        try {
            if (prev) {
                await useApi(APIS.REMOVE_FAVORITE, { id: params.pageId })
                toast.success('Removed from favorites')
            } else {
                await useApi(APIS.ADD_FAVORITE_PAGE, { id: params.pageId })
                toast.success('Added to favorites')
            }
            event.emit(ON_FAVORITE_CHANGE)
        } catch (err) {
            // Revert on failure
            setIsFavorited(prev)
            console.error('Failed to toggle favorite:', err)
            toast.error(prev ? 'Failed to remove favorite' : 'Failed to add favorite')
        } finally {
            setFavoriteToggling(false)
        }
    }, [params.pageId, isFavorited, favoriteToggling])

    const getTitleContent = useCallback((value: any) => {
        if (value) {
            const content = value.content[0]
            if (content?.content) {
                return content.content[0]?.content?.[0]?.text
            }
        }
        return null
    }, [])


    // Incremental auto-save via new hook (PATCH blocks only, no ON_PAGE_REFRESH)
    const { saving, dirty, error: saveError, progress: saveProgress, saveNow } = usePageSave(
        editor.current,
        params.pageId || null,
        !!page && !!params.pageId && editorContentReady
    )

    // Markdown import handler
    const handleImportMarkdown = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.md,.markdown,.txt';
        input.style.display = 'none';

        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const editorInstance = editor.current;
                if (!editorInstance) return;

                // Parse the markdown to extract title and body
                const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                const lines = normalizedText.split('\n');
                let title = file.name.replace(/\.(md|markdown|txt)$/i, '');
                let bodyStartIndex = 0;

                // Extract first H1 as title
                for (let i = 0; i < lines.length; i++) {
                    const trimmed = lines[i].trim();
                    if (trimmed === '') continue;
                    if (trimmed.startsWith('# ')) {
                        title = trimmed.substring(2).trim();
                        bodyStartIndex = i + 1;
                    }
                    break;
                }

                const bodyMarkdown = lines.slice(bodyStartIndex).join('\n').trim();

                // Parse body markdown to ProseMirror-compatible nodes
                const contentNodes = bodyMarkdown ? parseMarkdownToNodes(bodyMarkdown) : [];

                // Construct proper document JSON with title + content
                const docContent = {
                    type: 'doc',
                    content: [
                        {
                            type: 'title',
                            content: [{
                                type: 'heading',
                                content: [{ type: 'text', text: title }]
                            }]
                        },
                        ...(contentNodes.length > 0 ? contentNodes : [{ type: 'paragraph' }])
                    ]
                };

                editorInstance.commands.setContent(docContent);
                toast.success(`Imported "${file.name}" successfully`);
            } catch (err) {
                console.error('Error importing markdown:', err);
                toast.error('Failed to import markdown file');
            }
        };

        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);
    }, [editor]);

    useKeyPress(["ctrl.s"], (e) => {
        e.preventDefault()
        saveNow()
    })

    // Get current status display
    const statusDisplay = getStatusDisplay(saving, dirty, saveError, saveProgress)


    // Pre-process page content: parse JSON and unescape HTML entities off the main render path
    const parsedContent = React.useMemo(() => {
        if (!page?.content) return undefined;
        try {
            return JSON.parse((page.content as string).replaceAll("&lt;", "<").replaceAll("&gt;", ">"));
        } catch {
            return undefined;
        }
    }, [page?.content]);

    return pageLoading ? <div className="w-full h-full" ref={ref}>
        <header className="h-11 w-full flex flex-row justify-between px-1 border-b relative z-50">
            <div className="flex flex-row items-center gap-2 px-1">
                <Skeleton className="h-5 w-48" />
            </div>
            <div className="flex flex-row items-center gap-1 px-1">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-10" />
                <Skeleton className="h-8 w-10" />
                <Separator orientation="vertical" />
                <Skeleton className="h-8 w-10" />
                <Skeleton className="h-8 w-10" />
                <Skeleton className="h-8 w-10" />
            </div>
        </header>
        <main className="w-full flex flex-row justify-center p-8">
            <div className="w-full max-w-[900px] flex flex-col gap-6">
                {/* Title Skeleton */}
                <div className="flex flex-col gap-3">
                    <Skeleton className="h-12 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </div>
                {/* Content Skeleton */}
                <div className="flex flex-col gap-4">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-5/6" />
                    <Skeleton className="h-32 w-full rounded-lg" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-4/5" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-24 w-full rounded-lg" />
                </div>
            </div>
        </main>
    </div> : (page && <div className="w-full h-full z-[100]" ref={ref}>
        <header className="h-11 w-full flex flex-row justify-between px-1 border-b relative z-[100]">
            <div className="flex flex-row items-center gap-2 px-1 text-sm flex-1 min-w-0 overflow-hidden">
                <PageBreadcrumb
                    currentPageId={params.pageId!}
                    pageTree={page.parents}
                    spaceId={params.id!}
                    currentTitle={page.title}
                />
            </div>
            <div className="flex flex-row items-center gap-1 px-1 flex-shrink-0">
                {/* Collaboration Status and Users */}
                {provider && (
                    <>
                        {/* Connection Status - minimal dot indicator */}
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted/50 transition-colors cursor-default">
                            <div className={`
                                h-2 w-2 rounded-full transition-colors
                                ${connectionStatus === 'connected'
                                    ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
                                    : connectionStatus === 'connecting'
                                        ? 'bg-amber-500 animate-pulse'
                                        : 'bg-red-500'}
                            `} />
                            <span className="text-xs text-muted-foreground">
                                {connectionStatus === 'connected' ? 'Synced'
                                    : connectionStatus === 'connecting' ? 'Syncing...'
                                        : 'Offline'}
                            </span>
                        </div>

                        {/* Active Users - cleaner avatar group */}
                        {users.length > 0 && (
                            <>
                                <div className="h-5 w-px bg-border" />
                                <div className="flex -space-x-2">
                                    {users.slice(0, 3).map((u) => (
                                        <div
                                            key={u.clientId}
                                            className="relative h-6 w-6 rounded-full ring-2 ring-background flex items-center justify-center text-[10px] font-semibold text-white cursor-default transition-transform hover:scale-110 hover:z-10 shadow-sm"
                                            style={{ backgroundColor: u.user?.color || '#6366f1' }}
                                            title={u.user?.name || 'Anonymous'}
                                        >
                                            {(u.user?.name || 'A').charAt(0).toUpperCase()}
                                            <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-[1.5px] ring-background" />
                                        </div>
                                    ))}
                                    {users.length > 3 && (
                                        <div className="h-6 w-6 rounded-full ring-2 ring-background bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground transition-transform hover:scale-110 hover:z-10">
                                            +{users.length - 3}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Invite Button */}
                        <CollaborationInvitationDlg pageTitle={page?.title}>
                            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-muted-foreground hover:text-foreground">
                                <UserPlus className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline text-xs">Invite</span>
                            </Button>
                        </CollaborationInvitationDlg>

                        <Separator orientation="vertical" className="h-5" />
                    </>
                )}

                {/* Auto-save Status — always visible */}
                <div className={`flex items-center gap-1 px-2 py-1 text-xs ${statusDisplay.className}`}>
                    {statusDisplay.icon}
                    <span>{statusDisplay.text}</span>
                </div>
                <Separator orientation="vertical" className="h-5" />
                {/* Mobile Toc toggle button */}
                {isMobile && (
                    <Sheet open={tocOpen} onOpenChange={setTocOpen}>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                                <List className="h-3.5 w-3.5" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="right" className="w-[280px] p-0">
                            <SheetTitle className="sr-only">Table of Contents</SheetTitle>
                        </SheetContent>
                    </Sheet>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={toggleFavorite}
                    disabled={favoriteToggling || !params.pageId}
                    aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                    title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                >
                    <Star className={`h-3.5 w-3.5 ${isFavorited ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MessageSquareText className="h-3.5 w-3.5" />
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[300px]">
                        <DropdownMenuLabel>
                            <RadioGroup className="flex flex-row justify-center">
                                <div>
                                    <RadioGroupItem value="1" id="font1" className="peer sr-only" />
                                    <Label
                                        className="flex cursor-pointer flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-5 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                                        htmlFor="font1">
                                        Font1
                                    </Label>
                                </div>
                                <div>
                                    <RadioGroupItem value="2" id="font2" className="peer sr-only" />
                                    <Label
                                        className="flex flex-col cursor-pointer items-center justify-between rounded-md border-2 border-muted bg-popover p-5 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                                        htmlFor="font2">
                                        Font2
                                    </Label>
                                </div>
                                <div>
                                    <RadioGroupItem value="3" id="font3" className="peer sr-only" />
                                    <Label
                                        className="flex flex-col cursor-pointer items-center justify-between rounded-md border-2 border-muted bg-popover p-5 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                                        htmlFor="font3">
                                        Font3
                                    </Label>
                                </div>
                            </RadioGroup>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <DropdownMenuItem className="flex flex-row justify-between">
                                <div className="flex flex-row items-center gap-1">
                                    <ALargeSmall className="h-4 w-4" />
                                    <span>小号字体</span>
                                </div>
                                <Switch onClick={(e) => {
                                    e.stopPropagation()
                                }} />
                            </DropdownMenuItem>
                            <DropdownMenuItem className="flex flex-row justify-between">
                                <div className="flex flex-row items-center gap-1">
                                    <LockIcon className="h-4 w-4" />
                                    <span>Lock Page</span>
                                </div>
                                <Switch onClick={(e) => {
                                    e.stopPropagation()
                                }} />
                            </DropdownMenuItem>
                            <DropdownMenuItem className="flex flex-row justify-between">
                                <div className="flex flex-row items-center gap-1">
                                    <Contact2 className="h-4 w-4" />
                                    <span>显示目录</span>
                                </div>
                                <Switch onClick={(e) => {
                                    // e.preventDefault()
                                    e.stopPropagation()
                                }} />
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <TemplateCreator mode="page" pageId={params.pageId!} defaultName={page?.title} className="flex flex-row items-center gap-1 w-full relative select-none rounded-sm px-2 py-1.5 text-sm outline-none cursor-default hover:bg-accent hover:text-accent-foreground">
                                <BookTemplate className="h-4 w-4" />
                                <span>save as template</span>
                            </TemplateCreator>
                            <DropdownMenuItem onClick={() => {
                                toast.success("copy success")
                            }}>
                                <div className="flex flex-row items-center gap-1">
                                    <Link className="h-4 w-4" />
                                    <span>copy link</span>
                                </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                <div className="flex flex-row items-center gap-1">
                                    <MoveDownRight className="h-4 w-4" />
                                    <span>move to</span>
                                </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                <div className="flex flex-row items-center gap-1 text-red-500">
                                    <Trash2 className="h-4 w-4" />
                                    <span>move to trash</span>
                                </div>
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    <div className="flex flex-row items-center gap-1">
                                        <Download className="h-4 w-4" />
                                        <span>import</span>
                                    </div>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuPortal>
                                    <DropdownMenuSubContent>
                                        <DropdownMenuItem onClick={handleImportMarkdown}>
                                            <div className="flex flex-row items-center gap-1">
                                                <FileText className="h-4 w-4" />
                                                <span>from Markdown</span>
                                            </div>
                                        </DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                </DropdownMenuPortal>
                            </DropdownMenuSub>
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                    <div className="flex flex-row items-center gap-1">
                                        <Upload className="h-4 w-4" />
                                        <span>export</span>
                                    </div>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuPortal>
                                    <DropdownMenuSubContent>
                                        <DropdownMenuItem>
                                            <div className="flex flex-row items-center gap-1">
                                                <FileIcon className="h-4 w-4" />
                                                <span>as word</span>
                                            </div>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={async () => {
                                            if (editor.current) {
                                                exportToPDF(editor.current.view, {
                                                    filename: `${page.title || 'document'}.pdf`,
                                                    format: 'a4',
                                                    orientation: 'portrait',
                                                    margin: 10
                                                });
                                            }
                                        }}>
                                            <div className="flex flex-row items-center gap-1">
                                                <FileIcon className="h-4 w-4" />
                                                <span>as pdf</span>
                                            </div>
                                        </DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                </DropdownMenuPortal>
                            </DropdownMenuSub>
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
        <main className="w-full h-[calc(100%-44px)]">
            {
                page && synceStatus && <CollaborationEditor
                    pageInfo={page}
                    ref={editor}
                    synced={synceStatus}
                    provider={provider}
                    className="h-full"
                    id={params.pageId as string}
                    user={collaborationUser}
                    token={params.pageId as string}
                    toc={!isMobile}
                    withTitle={true}
                    width={isMobile ? "w-full" : "w-[calc(100vw-350px)]"}
                    content={parsedContent}
                    onContentReady={() => setEditorContentReady(true)}
                />
            }
        </main>
    </div>)
}