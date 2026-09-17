import { Button } from "@kn/ui";
import {
    getAccessToken,
    type CollaborationInvitation,
    type PageRecord,
    useSpacePageService,
    useTranslation,
} from "@kn/common";
import { FileText } from "@kn/icon";
import React, { useMemo } from "react";
import { PageEditor } from "../SpaceDetail/PageEditor";

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
 * membership in the page owner's identity context. The guest never takes the
 * write lease and never persists: the inviter is the host, and edits typed here
 * reach the database only through the shared Y.Doc. The collab provider token is
 * a JSON envelope carrying both the invitee's OAuth access token and the
 * invitation token; the room server exchanges the latter for a page-scoped
 * authorization.
 */
export const CollaborationWorkspace: React.FC<CollaborationWorkspaceProps> = ({
    token,
    invitation,
    page,
    onExit,
}) => {
    const { t } = useTranslation();
    const service = useSpacePageService();
    const documentOps = useMemo(
        () => service.collaboration.createInvitationDocumentOperations(token),
        [service, token],
    );
    const collabToken = useMemo(
        () => JSON.stringify({ accessToken: getAccessToken() ?? "", invitationToken: token }),
        [token],
    );
    const readOnly = (invitation.permission ?? "READ") === "READ";

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
