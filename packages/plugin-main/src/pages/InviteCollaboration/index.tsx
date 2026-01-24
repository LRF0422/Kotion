import { APIS } from "../../api";
import { Avatar, AvatarFallback, AvatarImage } from "@kn/ui";
import { Badge } from "@kn/ui";
import { Button } from "@kn/ui";
import { Separator } from "@kn/ui";
import { Skeleton } from "@kn/ui";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";
import { CollaborationEditor, TiptapCollabProvider } from "@kn/editor";
import { Editor } from "@kn/editor";
import { useApi } from "@kn/core";
import { useNavigator } from "@kn/core";
import { GlobalState } from "@kn/core";
import { deepEqual } from "@kn/core";
import {
    AlertCircle,
    CheckCircle2,
    FileText,
    Loader2,
    LogOut,
    X
} from "@kn/icon";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "@kn/common";
import { useParams, useSearchParams } from "@kn/common";
import { toast } from "@kn/ui";
import * as Y from "@kn/editor";

// Types
interface InvitationInfo {
    id: string;
    pageId: string;
    spaceId: string;
    pageTitle: string;
    spaceName: string;
    inviterName: string;
    permission: 'READ' | 'WRITE' | 'ADMIN';
    expiresAt?: string;
    status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
}

interface PageInfo {
    id: string;
    title: string;
    icon?: string;
    content: string;
    spaceId: string;
    spaceName?: string;
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';
type InviteStatus = 'loading' | 'validating' | 'accepting' | 'ready' | 'error' | 'expired';

// Permission label mapping
const getPermissionLabel = (permission: string) => {
    switch (permission) {
        case 'READ': return 'View only';
        case 'WRITE': return 'Can edit';
        case 'ADMIN': return 'Full access';
        default: return permission;
    }
};

// Permission badge color
const getPermissionBadgeVariant = (permission: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (permission) {
        case 'ADMIN': return 'default';
        case 'WRITE': return 'secondary';
        default: return 'outline';
    }
};

export const InviteCollaboration: React.FC = () => {
    const params = useParams();
    const [searchParams] = useSearchParams();
    const navigator = useNavigator();
    const { userInfo } = useSelector((state: GlobalState) => state);

    // Invitation and page state
    const [inviteStatus, setInviteStatus] = useState<InviteStatus>('loading');
    const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
    const [page, setPage] = useState<PageInfo | null>(null);
    const [errorMessage, setErrorMessage] = useState<string>('');

    // Editor state
    const editor = useRef<Editor>(null);
    const [synced, setSynced] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
    const [users, setUsers] = useState<any[]>([]);
    const lastAwarenessRef = useRef<any[]>([]);

    // Get invitation token from URL
    const inviteToken = params.token || searchParams.get('token');

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

    // Memoize user object for collaboration
    const collaborationUser = useMemo(() => ({
        name: userInfo?.name || userInfo?.name || 'Guest',
        color: userColor,
        id: userInfo?.id,
    }), [userInfo?.name, userInfo?.name, userInfo?.id, userColor]);

    // Create collaboration provider
    const provider = useMemo(() => {
        if (!page?.id) return null;

        const doc = new Y.Doc();
        const collabProvider = new TiptapCollabProvider({
            baseUrl: 'ws://localhost:1234',
            name: `page:${page.id}`,
            token: page.id,
            document: doc,
            onAwarenessUpdate: ({ states }) => {
                const updatedUsers = states
                    .map((state) => ({
                        clientId: state.clientId,
                        user: state.user
                    }))
                    .filter(u => u.user);

                if (!deepEqual(updatedUsers, lastAwarenessRef.current)) {
                    setUsers(updatedUsers);
                    lastAwarenessRef.current = updatedUsers;
                }
            },
            onSynced: () => {
                setSynced(true);
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
    }, [page?.id]);

    // Cleanup provider on unmount
    useEffect(() => {
        return () => {
            if (provider) {
                provider.awareness?.destroy();
                provider.disconnect();
                provider.destroy();
            }
        };
    }, [provider]);

    // Validate and accept invitation on mount
    useEffect(() => {
        if (!inviteToken) {
            setInviteStatus('error');
            setErrorMessage('Invalid invitation link. No token provided.');
            return;
        }

        validateAndAcceptInvitation();
    }, [inviteToken]);

    // Validate invitation and accept it
    const validateAndAcceptInvitation = async () => {
        try {
            setInviteStatus('validating');

            // Step 1: Validate invitation
            const validateRes = await useApi(APIS.VALIDATE_INVITATION, { token: inviteToken });
            const invitationData = validateRes.data;

            if (!invitationData || invitationData.status === 'EXPIRED') {
                setInviteStatus('expired');
                setErrorMessage('This invitation has expired.');
                return;
            }

            if (invitationData.status === 'REVOKED') {
                setInviteStatus('error');
                setErrorMessage('This invitation has been revoked.');
                return;
            }

            setInvitation(invitationData);

            // Step 2: Accept invitation if pending
            if (invitationData.status === 'PENDING') {
                setInviteStatus('accepting');
                await useApi(APIS.ACCEPT_INVITATION, { token: inviteToken });
                toast.success('Invitation accepted!');
            }

            // Step 3: Load page content
            const pageRes = await useApi(APIS.GET_INVITATION_PAGE, { token: inviteToken });
            setPage(pageRes.data);

            setInviteStatus('ready');
        } catch (error: any) {
            console.error('Failed to process invitation:', error);
            setInviteStatus('error');
            setErrorMessage(error?.message || 'Failed to process invitation. Please try again.');
        }
    };

    // Handle exit
    const handleExit = () => {
        if (provider) {
            provider.disconnect();
        }
        // Navigate to home or close window
        if (window.opener) {
            window.close();
        } else {
            navigator.go({ to: '/' });
        }
    };

    // Get user initials
    const getUserInitials = (name: string) => {
        return name?.charAt(0)?.toUpperCase() || '?';
    };

    // Render loading state
    if (inviteStatus === 'loading' || inviteStatus === 'validating') {
        return (
            <div className="w-full h-screen flex flex-col items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="text-lg text-muted-foreground">
                        {inviteStatus === 'loading' ? 'Loading...' : 'Validating invitation...'}
                    </p>
                </div>
            </div>
        );
    }

    // Render accepting state
    if (inviteStatus === 'accepting') {
        return (
            <div className="w-full h-screen flex flex-col items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                        <CheckCircle2 className="h-12 w-12 text-green-500" />
                        <Loader2 className="h-6 w-6 animate-spin text-primary absolute -bottom-1 -right-1" />
                    </div>
                    <p className="text-lg text-muted-foreground">Accepting invitation...</p>
                </div>
            </div>
        );
    }

    // Render error state
    if (inviteStatus === 'error' || inviteStatus === 'expired') {
        return (
            <div className="w-full h-screen flex flex-col items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-6 max-w-md text-center p-8">
                    <div className={`p-4 rounded-full ${inviteStatus === 'expired' ? 'bg-yellow-100' : 'bg-red-100'}`}>
                        {inviteStatus === 'expired' ? (
                            <AlertCircle className="h-12 w-12 text-yellow-600" />
                        ) : (
                            <X className="h-12 w-12 text-red-600" />
                        )}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold mb-2">
                            {inviteStatus === 'expired' ? 'Invitation Expired' : 'Invalid Invitation'}
                        </h1>
                        <p className="text-muted-foreground">{errorMessage}</p>
                    </div>
                    <Button onClick={() => navigator.go({ to: '/' })} variant="outline">
                        Go to Home
                    </Button>
                </div>
            </div>
        );
    }

    // Render editor
    const isReadOnly = invitation?.permission === 'READ';

    return (
        <div className="w-full h-screen flex flex-col bg-background">
            {/* Header */}
            <header className="h-12 w-full flex flex-row items-center justify-between px-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
                {/* Left: Page info */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-medium text-sm truncate max-w-[180px] sm:max-w-[280px]">
                                {page?.title || 'Untitled'}
                            </span>
                            {invitation?.spaceName && (
                                <span className="text-[11px] text-muted-foreground/70 truncate">
                                    {invitation.spaceName}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Permission badge - more subtle */}
                    <div className={`
                        px-2 py-0.5 rounded-md text-[11px] font-medium
                        ${invitation?.permission === 'ADMIN'
                            ? 'bg-primary/10 text-primary'
                            : invitation?.permission === 'WRITE'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-muted text-muted-foreground'}
                    `}>
                        {getPermissionLabel(invitation?.permission || 'READ')}
                    </div>
                </div>

                {/* Center: Connection & Collaborators */}
                <div className="flex items-center gap-3">
                    {/* Invited by info - integrated into header */}
                    {invitation?.inviterName && (
                        <div className="text-xs text-muted-foreground hidden sm:block">
                            Invited by <span className="font-medium text-foreground/80">{invitation.inviterName}</span>
                        </div>
                    )}

                    {/* Vertical divider */}
                    {invitation?.inviterName && users.length > 0 && <div className="h-4 w-px bg-border hidden sm:block" />}

                    {/* Connection Status - minimal dot indicator */}
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-muted/50 transition-colors cursor-default">
                                    <div className={`
                                        h-2 w-2 rounded-full transition-colors
                                        ${connectionStatus === 'connected'
                                            ? 'bg-emerald-500'
                                            : connectionStatus === 'connecting'
                                                ? 'bg-amber-500 animate-pulse'
                                                : 'bg-red-500'}
                                    `} />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                                <p>
                                    {connectionStatus === 'connected'
                                        ? 'All changes synced'
                                        : connectionStatus === 'connecting'
                                            ? 'Syncing changes...'
                                            : 'Connection lost'}
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    {/* Vertical divider */}
                    {users.length > 0 && <div className="h-4 w-px bg-border" />}

                    {/* Active Users - compact avatar group */}
                    {users.length > 0 && (
                        <TooltipProvider>
                            <div className="flex items-center">
                                <div className="flex -space-x-1.5">
                                    {users.slice(0, 4).map((u) => (
                                        <Tooltip key={u.clientId}>
                                            <TooltipTrigger asChild>
                                                <div
                                                    className="h-6 w-6 rounded-full ring-2 ring-background flex items-center justify-center text-[10px] font-semibold text-white cursor-default transition-transform hover:scale-110 hover:z-10"
                                                    style={{ backgroundColor: u.user?.color || '#6366f1' }}
                                                >
                                                    {getUserInitials(u.user?.name || 'A')}
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom">
                                                <p className="font-medium">{u.user?.name || 'Anonymous'}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    ))}
                                    {users.length > 4 && (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div className="h-6 w-6 rounded-full ring-2 ring-background bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground cursor-default transition-transform hover:scale-110 hover:z-10">
                                                    +{users.length - 4}
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom">
                                                <p>{users.length - 4} more collaborators</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    )}
                                </div>
                            </div>
                        </TooltipProvider>
                    )}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1.5 flex-1 justify-end">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleExit}
                        className="h-8 px-2.5 gap-1.5 text-muted-foreground hover:text-foreground"
                    >
                        <LogOut className="h-4 w-4" />
                        <span className="hidden sm:inline text-xs">Exit</span>
                    </Button>
                </div>
            </header>

            {/* Editor Area */}
            <main className="flex-1 w-full min-h-0 overflow-auto">
                {!synced ? (
                    <div className="w-full h-full flex flex-col items-center justify-center">
                        <div className="w-full max-w-[800px] p-8 space-y-6">
                            <Skeleton className="h-10 w-3/4" />
                            <Skeleton className="h-6 w-full" />
                            <Skeleton className="h-6 w-full" />
                            <Skeleton className="h-6 w-5/6" />
                            <Skeleton className="h-32 w-full rounded-lg" />
                            <Skeleton className="h-6 w-full" />
                            <Skeleton className="h-6 w-4/5" />
                        </div>
                    </div>
                ) : (
                    page && provider && (
                        <CollaborationEditor
                            pageInfo={page}
                            ref={editor}
                            synced={synced}
                            provider={provider}
                            className="h-full overflow-auto"
                            id={page.id}
                            user={collaborationUser}
                            token={page.id}
                            content={page.content ? JSON.parse(page.content) : undefined}
                            isEditable={!isReadOnly}
                            toc={false}
                            withTitle={true}
                            width="w-full max-w-[900px] mx-auto"
                            toolbar={!isReadOnly}
                        />
                    )
                )}
            </main>

            {/* Read-only notice */}
            {isReadOnly && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-muted rounded-full text-sm text-muted-foreground shadow-lg border">
                    You have view-only access to this page
                </div>
            )}
        </div>
    );
};

export default InviteCollaboration;
