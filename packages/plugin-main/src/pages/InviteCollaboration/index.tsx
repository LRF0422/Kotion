import { Button } from "@kn/ui";
import { Avatar, AvatarFallback } from "@kn/ui";
import { Badge } from "@kn/ui";
import {
    APIS,
    clearContextSensitiveClientState,
    getRefreshToken,
    getTokenContextState,
    normalizeTokenResponse,
    notifyContextChanged,
    saveTokens,
    type CollaborationInvitation,
    type PagePermission,
    type PageRecord,
    useApi,
    useNavigator,
    useSpacePageService,
    useTranslation,
} from "@kn/common";
import {
    AlertCircle,
    CheckCircle2,
    FileText,
    Loader2,
    UserPlus,
    X
} from "@kn/icon";
import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "@kn/common";
import { toast } from "@kn/ui";
import { CollaborationWorkspace } from "./CollaborationWorkspace";

type InviteStatus = 'loading' | 'ready' | 'accepting' | 'error' | 'expired';

/**
 * Invitation landing page (/collaborate/:token).
 * Validates the token, shows an invitation card, and on acceptance grants the
 * persistent page permission (backend also adds the invitee to the space as
 * GUEST) before redirecting into the normal editing route.
 *
 * The shared space usually lives in the inviter's context (tenant). A session
 * bound to another context cannot read that space at all, so entering the page
 * is a two-step operation: `enterInvitation` makes the invitee a member of the
 * space's context and reports it, then this page switches the session into that
 * context before navigating. Without the switch every space/page read resolves
 * against the wrong context and fails with "空间不存在".
 */
export const InviteCollaboration: React.FC = () => {
    const { t } = useTranslation();
    const params = useParams();
    const [searchParams] = useSearchParams();
    const navigator = useNavigator();
    const service = useSpacePageService();

    const [inviteStatus, setInviteStatus] = useState<InviteStatus>('loading');
    const [invitation, setInvitation] = useState<CollaborationInvitation | null>(null);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [page, setPage] = useState<PageRecord | null>(null);
    const [entered, setEntered] = useState(false);

    const inviteToken = params.token ? String(params.token) : searchParams.get('token');

    // Permission label mapping
    const getPermissionLabel = (permission: PagePermission) => {
        switch (permission) {
            case 'READ': return t('inviteCollaboration.permission.viewOnly');
            case 'WRITE': return t('inviteCollaboration.permission.canEdit');
            case 'ADMIN': return t('inviteCollaboration.permission.fullAccess');
        }
    };

    // Validate invitation on mount
    useEffect(() => {
        if (!inviteToken) {
            setInviteStatus('error');
            setErrorMessage(t('inviteCollaboration.error.noToken'));
            return;
        }

        setInviteStatus('loading');
        service.collaboration.validateInvitation(inviteToken)
            .then(result => {
                const data = result.invitation;
                const invitationStatus = String(data?.status ?? result.reason ?? '').toUpperCase();
                if (!result.valid || !data || invitationStatus === 'EXPIRED') {
                    if (invitationStatus === 'EXPIRED') {
                        setInviteStatus('expired');
                        setErrorMessage(t('inviteCollaboration.error.expired'));
                    } else {
                        setInviteStatus('error');
                        setErrorMessage(
                            invitationStatus === 'REVOKED'
                                ? t('inviteCollaboration.error.revoked')
                                : result.reason || t('inviteCollaboration.error.processFailed')
                        );
                    }
                    return;
                }
                if (invitationStatus === 'REVOKED') {
                    setInviteStatus('error');
                    setErrorMessage(t('inviteCollaboration.error.revoked'));
                    return;
                }
                setInvitation(data);
                setInviteStatus('ready');
            })
            .catch((error: any) => {
                console.error('Failed to validate invitation:', error);
                setInviteStatus('error');
                setErrorMessage(error?.message || t('inviteCollaboration.error.processFailed'));
            });
    }, [service, inviteToken, t]);

    /** Surface the backend's own message instead of a generic axios status text. */
    const readableError = (error: any): string =>
        error?.response?.data?.msg || error?.message || t('inviteCollaboration.error.processFailed');

    /**
     * Open the page in place with invitation-token-scoped document operations.
     *
     * Used when the server could not admit this account into the context that owns
     * the space (for example a page created in the owner's personal context), or
     * when the context switch itself fails. The invitee stays in their own context
     * and every read/write is authorized by the invitation token.
     */
    const enterWorkspace = async (token: string) => {
        const record = await service.collaboration.getInvitationPage(token);
        setPage(record);
        setEntered(true);
    };

    const openInvitationPage = async (token: string) => {
        const target = await service.collaboration.enterInvitation(token);
        if (!target.spaceId || !target.pageId) {
            throw new Error(t('inviteCollaboration.error.processFailed'));
        }
        const pageRoute = `/space-detail/${target.spaceId}/page/edit/${target.pageId}`;
        const currentContextId = getTokenContextState().contextId;
        if (!target.contextId || !currentContextId || target.contextId === currentContextId) {
            navigator.go({ to: pageRoute });
            return;
        }
        // The server refused (or could not grant) membership in the owning context,
        // e.g. a space created in the owner's personal context. A switch would fail
        // with a raw backend error and hide the page, so edit in place instead.
        if (target.contextSwitchAllowed === false) {
            console.info('Context grant unavailable, using invitation-token editor:', target.contextMessage);
            await enterWorkspace(token);
            return;
        }

        try {
            const switched = await useApi(APIS.SWITCH_CONTEXT, { contextId: target.contextId }, {
                refreshToken: getRefreshToken() || '',
            });
            const tokens = normalizeTokenResponse(switched.data);
            if (!tokens.accessToken || !tokens.refreshToken) {
                throw new Error(t('inviteCollaboration.contextSwitch.failed'));
            }
            saveTokens(tokens.accessToken, tokens.refreshToken);
            clearContextSensitiveClientState();
            notifyContextChanged(target.contextId);
            // The whole client (redux store, services, open tabs) is bound to the old
            // context, so a hard reload is the only safe way to enter the new one.
            window.location.assign(pageRoute);
        } catch (error: any) {
            // The grant can race (organization suspended between enter and switch).
            // Fall back to the token-scoped editor rather than a dead end.
            console.error('Context switch failed, using invitation-token editor:', error);
            await enterWorkspace(token);
        }
    };

    // Accept the invitation when needed, then enter the page through the normal route
    const handleAccept = async () => {
        if (!invitation || !inviteToken) return;
        try {
            setErrorMessage('');
            setInviteStatus('accepting');
            if (invitation.status === 'PENDING') {
                await service.collaboration.acceptInvitation(inviteToken);
                toast.success(t('inviteCollaboration.toast.accepted'));
            }
            await openInvitationPage(inviteToken);
        } catch (error: any) {
            console.error('Failed to accept invitation:', error);
            // The request layer already toasts business errors; keep the card (and
            // its retry affordance) and show the details inline instead of jumping
            // to a dead-end screen with a second, vaguer toast.
            setInviteStatus('ready');
            setErrorMessage(readableError(error));
        }
    };

    const getUserInitials = (name?: string) => name?.charAt(0)?.toUpperCase() || '?';
    const spaceName = typeof invitation?.metadata?.spaceName === 'string'
        ? invitation.metadata.spaceName
        : undefined;

    // The token-scoped editor keeps the guest in their own context; the workspace
    // owns the whole viewport once chosen.
    if (entered && page && invitation && inviteToken) {
        return (
            <CollaborationWorkspace
                token={inviteToken}
                invitation={invitation}
                page={page}
                onExit={() => setEntered(false)}
            />
        );
    }

    // Loading state
    if (inviteStatus === 'loading') {
        return (
            <div className="w-full h-screen flex flex-col items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="text-lg text-muted-foreground">{t('inviteCollaboration.loading.validating')}</p>
                </div>
            </div>
        );
    }

    // Error / expired state
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
                            {inviteStatus === 'expired'
                                ? t('inviteCollaboration.error.expiredTitle')
                                : t('inviteCollaboration.error.invalidTitle')}
                        </h1>
                        <p className="text-muted-foreground">{errorMessage}</p>
                    </div>
                    <Button onClick={() => navigator.go({ to: '/' })} variant="outline">
                        {t('inviteCollaboration.buttons.goHome')}
                    </Button>
                </div>
            </div>
        );
    }

    // Invitation card
    return (
        <div className="w-full h-screen flex flex-col items-center justify-center bg-background p-4">
            <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
                <div className="flex flex-col items-center gap-5 text-center">
                    <div className="p-3 rounded-full bg-primary/10">
                        <UserPlus className="h-8 w-8 text-primary" />
                    </div>

                    <div className="space-y-1">
                        <h1 className="text-xl font-semibold">{t('inviteLanding.title')}</h1>
                        <p className="text-sm text-muted-foreground">
                            {t('inviteLanding.subtitle', { name: invitation?.inviterName || '' })}
                        </p>
                    </div>

                    {/* Inviter */}
                    <div className="flex items-center gap-3 w-full rounded-lg border p-3">
                        <Avatar className="h-9 w-9">
                            <AvatarFallback>{getUserInitials(invitation?.inviterName)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0 text-left">
                            <div className="text-sm font-medium truncate">{invitation?.inviterName}</div>
                            <div className="text-xs text-muted-foreground">{t('inviteLanding.inviter')}</div>
                        </div>
                    </div>

                    {/* Page info */}
                    <div className="flex items-center gap-3 w-full rounded-lg border p-3">
                        <div className="p-2 rounded-md bg-muted">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                            <div className="text-sm font-medium truncate">
                                {invitation?.pageTitle || t('sharedPage.untitled')}
                            </div>
                            {spaceName && (
                                <div className="text-xs text-muted-foreground truncate">{spaceName}</div>
                            )}
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                            {getPermissionLabel(invitation?.permission || 'READ')}
                        </Badge>
                    </div>

                    {errorMessage && (
                        <div className="w-full rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-left text-xs text-destructive">
                            {errorMessage}
                        </div>
                    )}

                    {invitation?.status === 'ACCEPTED' ? (
                        <div className="w-full space-y-3">
                            <div className="flex items-center justify-center gap-2 text-sm text-emerald-600">
                                <CheckCircle2 className="h-4 w-4" />
                                {t('inviteLanding.already-accepted')}
                            </div>
                            <Button
                                className="w-full"
                                onClick={handleAccept}
                                disabled={inviteStatus === 'accepting'}
                            >
                                {inviteStatus === 'accepting' ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        {t('inviteCollaboration.loading.opening')}
                                    </>
                                ) : (
                                    t('inviteLanding.open-page')
                                )}
                            </Button>
                        </div>
                    ) : (
                        <Button
                            className="w-full"
                            onClick={handleAccept}
                            disabled={inviteStatus === 'accepting'}
                        >
                            {inviteStatus === 'accepting' ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    {t('inviteCollaboration.loading.accepting')}
                                </>
                            ) : (
                                t('inviteLanding.accept')
                            )}
                        </Button>
                    )}

                    {invitation?.expiresAt && (
                        <p className="text-xs text-muted-foreground">
                            {t('inviteLanding.expires-at', { time: new Date(invitation.expiresAt).toLocaleString() })}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InviteCollaboration;
