import { Button } from "@kn/ui";
import {
    getAccessToken,
    registerCollaborationGuestPage,
    type CollaborationInvitation,
    type PageRecord,
    useNavigator,
    useSpacePageService,
    useTranslation,
} from "@kn/common";
import { FileText } from "@kn/icon";
import React, { useCallback, useEffect, useMemo } from "react";
import { PageEditor } from "../SpaceDetail/PageEditor";
import { usePublishPageContext } from "../../utils/use-publish-page-context";

export interface CollaborationWorkspaceProps {
    token: string;
    invitation: CollaborationInvitation;
    page: PageRecord;
    onExit: () => void;
}

/**
 * The invited collaborator's editing surface.
 *
 * Renders the normal {@link PageEditor} with a document capability bound to the
 * invitation token, so reads are authorized by the invitation rather than by
 * membership in the page owner's identity context. A guest with edit permission
 * may take the write lease and persist their own edits while no host is present;
 * once the inviter/host is online the host persists and the guest only edits.
 * The collab provider token is a JSON envelope carrying both the invitee's OAuth
 * access token and the invitation token; the room server exchanges the latter
 * for a page-scoped authorization.
 */
export const CollaborationWorkspace: React.FC<CollaborationWorkspaceProps> = ({
    token,
    invitation,
    page,
    onExit,
}) => {
    const { t } = useTranslation();
    const service = useSpacePageService();
    const navigator = useNavigator();
    const documentOps = useMemo(
        () => service.collaboration.createInvitationDocumentOperations(token),
        [service, token],
    );
    const collabToken = useMemo(
        () => JSON.stringify({ accessToken: getAccessToken() ?? "", invitationToken: token }),
        [token],
    );
    const readOnly = (invitation.permission ?? "READ") === "READ";

    // Publish the guest capability for the agent's *other* page surfaces (the
    // hidden off-screen editor, the floating page window, the page tools). They
    // resolve pages through the tenant-scoped service, which cannot see a page
    // from the inviter's context; this registry is how they learn the
    // invitation-scoped document capability instead.
    const guestCapability = useMemo(() => ({
        pageId: String(page.id),
        spaceId: page.spaceId ? String(page.spaceId) : undefined,
        title: page.title,
        invitationToken: token,
        canEdit: !readOnly,
        documents: documentOps,
        getCollabToken: () => JSON.stringify({ accessToken: getAccessToken() ?? "", invitationToken: token }),
        getPage: () => service.collaboration.getInvitationPage(token),
    }), [page.id, page.spaceId, page.title, readOnly, documentOps, service, token]);
    useEffect(() => {
        // No unregister on unmount on purpose: an agent run can outlive the route
        // (the user navigates away while the agent keeps working). The capability
        // is memory-only, scoped to this page and its invitation token, and a
        // re-entry simply replaces it; dropping it here would make the agent's
        // hidden editor unable to acquire the page the moment the workspace
        // closes.
        registerCollaborationGuestPage(guestCapability);
    }, [guestCapability]);

    // This surface renders the editor directly (no `PageHost`), so it publishes
    // the page context itself — the agent must know which page the invitee is
    // reading even on the collaboration route.
    // Stable identity: the page-context bridge re-publishes whenever one of its
    // inputs changes, and an inline callback would do that on every render.
    const openGuestPage = useCallback((targetPageId: string) => {
        if (String(targetPageId) !== String(page.id)) {
            throw new Error(t('inviteCollaboration.error.pageOutOfScope', 'This page is outside the invitation workspace'));
        }
        navigator.go({ to: `/collaborate/${token}?open=1` });
    }, [navigator, token, page.id, t]);

    usePublishPageContext({
        pageId: page.id,
        spaceId: page.spaceId,
        title: page.title,
        parentId: page.parentId,
        // A guest page is reached through its invitation link, not the workspace
        // route: `openPage` on it from the agent must land back in this
        // workspace instead of a space the invitee cannot see.
        openPage: openGuestPage,
    });

    return (
        <div className="flex h-screen w-full flex-col bg-background">
            <header className="flex items-center gap-3 border-b px-3 py-2">
                <Button variant="ghost" size="sm" onClick={onExit}>
                    {t('inviteCollaboration.header.exit', 'Exit')}
                </Button>
                <div className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">
                        {page.title || t('sharedPage.untitled', 'Untitled')}
                    </span>
                </div>
            </header>
            <div className="min-h-0 flex-1">
                <PageEditor
                    pageId={String(page.id)}
                    spaceId={page.spaceId ? String(page.spaceId) : undefined}
                    initialPage={page}
                    documentOps={documentOps}
                    collabToken={collabToken}
                    readOnly={readOnly}
                    active
                    guestMode
                    hostUserId={invitation.inviterId ? String(invitation.inviterId) : undefined}
                    guestHostName={invitation.inviterName}
                    onGuestExit={onExit}
                />
            </div>
        </div>
    );
};

export default CollaborationWorkspace;
