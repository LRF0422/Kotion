import { APIS } from "../../../api";
import { Badge, useIsMobile, Sheet, SheetContent, SheetTrigger, SheetTitle } from "@kn/ui";
import { Button } from "@kn/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, DropdownMenuPortal, DropdownMenuLabel } from "@kn/ui";
import { Label } from "@kn/ui";
import { RadioGroup, RadioGroupItem } from "@kn/ui";
import { Separator } from "@kn/ui";
import { Switch } from "@kn/ui";
import { Skeleton } from "@kn/ui";
import { CollaborationEditor, exportToPDF, useAutoSave, AutoSaveStatus, TiptapCollabProvider } from "@kn/editor";
import { event, ON_PAGE_REFRESH } from "../../../event";
import { useApi, useService, deepEqual, useUploadFile } from "@kn/core";
import { useNavigator } from "@kn/core";
import { GlobalState } from "@kn/core";
import { Editor } from "@kn/editor";
import * as Y from "@kn/editor";
import { useKeyPress, useToggle } from "@kn/core";
import {
    ALargeSmall, ArrowLeft, BookTemplate, CircleArrowUp,
    Contact2, Download, FileIcon,
    Link, LoaderCircle, LockIcon, MessageSquareText,
    MoreHorizontal, MoveDownRight, Save, Trash2, Upload, List,
    Check, CloudOff, UserPlus
} from "@kn/icon";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "@kn/common";
import { useParams } from "@kn/common";
import { toast } from "@kn/ui";
import { CollaborationInvitationDlg } from "../../components/CollaborationInvitationDlg";
import { PageBreadcrumb } from "../../../components/PageBreadcrumb";

// Status display configuration for auto-save
const getStatusDisplay = (autoSaveStatus: AutoSaveStatus, isManualSaving: boolean) => {
    // Manual saving takes priority
    if (isManualSaving || autoSaveStatus === 'saving') {
        return { text: 'Saving...', icon: <LoaderCircle className="h-3 w-3 animate-spin" />, variant: 'secondary' as const };
    }
    switch (autoSaveStatus) {
        case 'unsaved':
            return { text: 'Unsaved', icon: <CloudOff className="h-3 w-3" />, variant: 'secondary' as const };
        case 'saved':
            return { text: 'Saved', icon: <Check className="h-3 w-3" />, variant: 'secondary' as const };
        case 'error':
            return { text: 'Save failed', icon: <CloudOff className="h-3 w-3" />, variant: 'destructive' as const };
        case 'idle':
        default:
            return { text: 'Ready', icon: null, variant: 'outline' as const };
    }
};

export const PageEditor: React.FC = () => {
    const isMobile = useIsMobile()
    const [tocOpen, setTocOpen] = useState(false)
    const [page, setPage] = useState<any>()
    const params = useParams()
    const { userInfo } = useSelector((state: GlobalState) => state)
    const [loading, { toggle }] = useToggle(false)
    const [pageLoading, { toggle: toggleLoading }] = useToggle(false)
    const [synceStatus, setSyncStatus] = useState(false)
    const lastAwarenessRef = useRef<any[]>([])
    const [users, setUsers] = useState<any[]>([])
    const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
    const editor = useRef<Editor>(null)
    const navigator = useNavigator()
    const ref = useRef<any>()
    const spaceService = useService("spaceService")
    const [isManualSaving, setIsManualSaving] = useState(false)
    const { usePath } = useUploadFile();

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

    // Create collaboration provider
    const provider = React.useMemo(() => {
        if (!params.pageId) return undefined;

        const doc = new Y.Doc();
        const collabProvider = new TiptapCollabProvider({
            baseUrl: 'wss://kotion.top:8877/ws',
            name: `page:${params.pageId}`,
            token: params.pageId as string,
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

        return collabProvider;
    }, [params.pageId]);

    // Cleanup provider and awareness on unmount
    React.useEffect(() => {
        return () => {
            if (provider) {
                // Destroy awareness first
                provider.awareness?.destroy();
                provider.disconnect();
                provider.destroy();
            }
        };
    }, [provider]);

    useEffect(() => {
        toggleLoading()
        spaceService.getPage(params.pageId!).then((res) => {
            setPage(res)
            toggleLoading()
        })

        return () => {
            setPage(null)
        }
    }, [params.pageId])

    const getTitleContent = useCallback((value: any) => {
        if (value) {
            const content = value.content[0]
            if (content?.content) {
                return content.content[0]?.content?.[0]?.text
            }
        }
        return null
    }, [])

    const getIcon = useCallback((value: any) => {
        if (value) {
            const content = value.content[0]
            if (content) {
                return content.attrs?.icon
            }
        }
        return null
    }, [])

    // Auto-save callback - performs the actual save operation
    const handleAutoSave = useCallback(async (content: any) => {
        if (!page || !params.pageId) return;

        const title = getTitleContent(content);
        const icon = getIcon(content);

        const pageData = {
            ...page,
            title,
            icon,
            id: params.pageId,
            content: JSON.stringify(content),
            publish: false
        };

        await useApi(APIS.CREATE_OR_SAVE_PAGE, undefined, pageData);
        event.emit(ON_PAGE_REFRESH);
    }, [page, params.pageId, getTitleContent, getIcon])

    // Use auto-save hook
    const { status: autoSaveStatus, isDirty, saveNow, markAsSaved } = useAutoSave({
        editor: editor.current,
        debounceDelay: 3000, // Auto-save after 3 seconds of inactivity
        onSave: handleAutoSave,
        enabled: !!page && !!params.pageId,
    });

    // Manual save handler (for Ctrl+S and save button)
    const handleSave = useCallback(async (publish: boolean = false) => {
        if (!editor.current || !page) return;

        setIsManualSaving(true);
        toggle();

        try {
            const pageContent = editor.current.getJSON();
            const title = getTitleContent(pageContent);
            const icon = getIcon(pageContent);

            const pageData = {
                ...page,
                title,
                icon,
                id: params.pageId,
                content: JSON.stringify(pageContent),
                publish
            };

            await useApi(APIS.CREATE_OR_SAVE_PAGE, undefined, pageData);

            if (publish) {
                navigator.go({
                    to: `/space-detail/${params.id}/page/${params.pageId}`
                });
                toast.success("发布成功");
            }

            event.emit(ON_PAGE_REFRESH);
            markAsSaved(); // Mark as saved to reset auto-save state
        } catch (error) {
            console.error('Save failed:', error);
            toast.error('保存失败');
        } finally {
            toggle();
            setIsManualSaving(false);
        }
    }, [editor, page, params.pageId, params.id, getTitleContent, getIcon, toggle, navigator, markAsSaved])

    useKeyPress(["ctrl.s"], (e) => {
        e.preventDefault();
        handleSave();
    })

    // Get current status display
    const statusDisplay = getStatusDisplay(autoSaveStatus, isManualSaving)


    const handleSaveAsTemplate = () => {
        useApi(APIS.SAVE_AS_TEMPLATE, { id: params.pageId }).then(() => {
            toast.success("保存成功")
        })
    }

    return pageLoading ? <div className="w-full h-full" ref={ref}>
        <header className="h-11 w-full flex flex-row justify-between px-1 border-b">
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
    </div> : (page && <div className="w-full h-full" ref={ref}>
        <header className="h-11 w-full flex flex-row justify-between px-1 border-b">
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

                {/* Auto-save Status */}
                <Badge variant={statusDisplay.variant}>
                    <div className="flex flex-row items-center gap-1">
                        {statusDisplay.icon}
                        {statusDisplay.text}
                    </div>
                </Badge>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleSave()}
                    disabled={loading || isManualSaving}
                >
                    <Save className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleSave(true)}><CircleArrowUp className="h-5 w-5" /></Button>
                <Separator orientation="vertical" />
                {/* Mobile Toc toggle button */}
                {isMobile && (
                    <Sheet open={tocOpen} onOpenChange={setTocOpen}>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon">
                                <List className="h-5 w-5" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="right" className="w-[280px] p-0">
                            <SheetTitle className="sr-only">Table of Contents</SheetTitle>
                        </SheetContent>
                    </Sheet>
                )}
                <Button variant="ghost" size="icon">
                    <MessageSquareText className="h-5 w-5" />
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger><Button variant="ghost" size="icon"><MoreHorizontal className="h-5 w-5" /></Button></DropdownMenuTrigger>
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
                            <DropdownMenuItem onClick={handleSaveAsTemplate}>
                                <div className="flex flex-row items-center gap-1">
                                    <BookTemplate className="h-4 w-4" />
                                    <span>save as template</span>
                                </div>
                            </DropdownMenuItem>
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
                                <div className="flex flex-row items-center gap-1">
                                    <ArrowLeft className="h-4 w-4" />
                                    <span>rollback to last version</span>
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
                            <DropdownMenuItem>
                                <div className="flex flex-row items-center gap-1">
                                    <Download className="h-4 w-4" />
                                    <span>import</span>
                                </div>
                            </DropdownMenuItem>
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
                    content={page.content ? JSON.parse((page.content as string).replaceAll("&lt;", "<").replaceAll("&gt;", ">")) : undefined}
                />
            }
        </main>
    </div>)
}