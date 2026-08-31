import { Button } from "@kn/ui";
import { Avatar, AvatarFallback } from "@kn/ui";
import { Badge } from "@kn/ui";
import {
    type CollaborationInvitation,
    type PagePermission,
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

type InviteStatus = 'loading' | 'ready' | 'accepting' | 'error' | 'expired';

/**
 * Invitation landing page (/collaborate/:token).
 * Validates the token, shows an invitation card, and on acceptance grants the
 * persistent page permission (backend also adds the invitee to the space as
 * GUEST) before redirecting into the normal editing route.
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

    const goToPage = (inv: CollaborationInvitation) => {
        if (!inv.spaceId || !inv.pageId) return;
        navigator.go({ to: `/space-detail/${inv.spaceId}/page/edit/${inv.pageId}` });
    };

    // Accept the invitation, then enter the page through the normal route
    const handleAccept = async () => {
        if (!invitation) return;
        try {
            setInviteStatus('accepting');
            if (invitation.status === 'PENDING' && inviteToken) {
                await service.collaboration.acceptInvitation(inviteToken);
                toast.success(t('inviteCollaboration.toast.accepted'));
            }
            goToPage(invitation);
        } catch (error: any) {
            console.error('Failed to accept invitation:', error);
            setInviteStatus('ready');
            toast.error(error?.message || t('inviteCollaboration.error.processFailed'));
        }
    };

    const getUserInitials = (name?: string) => name?.charAt(0)?.toUpperCase() || '?';
    const spaceName = typeof invitation?.metadata?.spaceName === 'string'
        ? invitation.metadata.spaceName
        : undefined;

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

                    {invitation?.status === 'ACCEPTED' ? (
                        <div className="w-full space-y-3">
                            <div className="flex items-center justify-center gap-2 text-sm text-emerald-600">
                                <CheckCircle2 className="h-4 w-4" />
                                {t('inviteLanding.already-accepted')}
                            </div>
                            <Button className="w-full" onClick={() => invitation && goToPage(invitation)}>
                                {t('inviteLanding.open-page')}
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
