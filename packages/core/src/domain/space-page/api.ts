import type { API } from "@kn/common";

export type SpacePageEndpointAccess = "authenticated" | "public";
export type SpacePageEndpoint = API & { readonly access: SpacePageEndpointAccess };

const endpoint = (
    url: string,
    method: SpacePageEndpoint["method"],
    access: SpacePageEndpointAccess = "authenticated"
): SpacePageEndpoint => ({ url, method, access });

/**
 * Canonical end-user Space/Page HTTP catalog. Authentication, account,
 * uploads, plugin delivery and SSE endpoints intentionally do not belong here.
 */
export const SPACE_PAGE_ENDPOINTS = {
    spaces: {
        list: endpoint("/knowledge-wiki/space/list", "GET"),
        personal: endpoint("/knowledge-wiki/space/personal", "GET"),
        detail: endpoint("/knowledge-wiki/space/:id/detail", "GET"),
        createOrUpdate: endpoint("/knowledge-wiki/space", "POST"),
        archive: endpoint("/knowledge-wiki/space/:id/archive", "PUT"),
        unarchive: endpoint("/knowledge-wiki/space/:id/unarchive", "PUT"),
        delete: endpoint("/knowledge-wiki/space/:id", "DELETE"),
        toggleFavorite: endpoint("/knowledge-wiki/space/:id/favorite", "POST"),
    },
    pages: {
        content: endpoint("/knowledge-wiki/space/page/:id/content", "GET"),
        tree: endpoint("/knowledge-wiki/space/:id/page/tree", "GET"),
        list: endpoint("/knowledge-wiki/space/page/list", "GET"),
        recent: endpoint("/knowledge-wiki/space/page/recent", "GET"),
        favorites: endpoint("/knowledge-wiki/space/page/favorites", "GET"),
        createOrUpdate: endpoint("/knowledge-wiki/space/page", "POST"),
        title: endpoint("/knowledge-wiki/space/page/:id/title", "PUT"),
        move: endpoint("/knowledge-wiki/space/page/:id/move", "PUT"),
        trash: endpoint("/knowledge-wiki/space/page/:id/trash", "DELETE"),
        restoreFromTrash: endpoint("/knowledge-wiki/space/page/:id/restore", "PUT"),
        favorite: endpoint("/knowledge-wiki/space/page/:id/favorite", "POST"),
        unfavorite: endpoint("/knowledge-wiki/favorite/:id", "DELETE"),
        togglePin: endpoint("/knowledge-wiki/space/:spaceId/page/:pageId/pin", "PUT"),
        pinned: endpoint("/knowledge-wiki/space/:spaceId/page/pinned", "GET"),
    },
    templates: {
        list: endpoint("/knowledge-wiki/space/page/templates", "GET"),
        spaceList: endpoint("/knowledge-wiki/space/:spaceId/page/templates", "GET"),
        savePage: endpoint("/knowledge-wiki/space/page/:id/template", "POST"),
        saveSpace: endpoint("/knowledge-wiki/space/template", "POST"),
        delete: endpoint("/knowledge-wiki/space/page/template/:id", "DELETE"),
    },
    members: {
        searchUsers: endpoint("/knowledge-system/user/search", "GET"),
        list: endpoint("/knowledge-wiki/space/:spaceId/member/list", "GET"),
        invite: endpoint("/knowledge-wiki/space/:spaceId/member/invite", "POST"),
        updateRole: endpoint("/knowledge-wiki/space/:spaceId/member/role", "PUT"),
        remove: endpoint("/knowledge-wiki/space/:spaceId/member/:userId", "DELETE"),
        leave: endpoint("/knowledge-wiki/space/:spaceId/member/leave", "POST"),
        transfer: endpoint("/knowledge-wiki/space/:spaceId/member/transfer/:newOwnerId", "PUT"),
        pendingInvitations: endpoint("/knowledge-wiki/space/:spaceId/invitations/pending", "GET"),
        revokeInvitation: endpoint("/knowledge-wiki/space/:spaceId/invitations/:invitationId", "DELETE"),
    },
    collaboration: {
        createInvitation: endpoint("/knowledge-wiki/space/collaborationInvitation", "POST"),
        validateInvitation: endpoint("/knowledge-wiki/collaboration/invitation/:token/validate", "GET", "public"),
        acceptInvitation: endpoint("/knowledge-wiki/collaboration/invitation/:token/accept", "POST"),
        invitationPage: endpoint("/knowledge-wiki/collaboration/invitation/:token/page", "GET"),
        collaborators: endpoint("/knowledge-wiki/space/page/:pageId/collaborators", "GET"),
        updatePermission: endpoint("/knowledge-wiki/space/page/:pageId/collaborator/:userId/permission", "PUT"),
        removeCollaborator: endpoint("/knowledge-wiki/space/page/:pageId/collaborator/:userId", "DELETE"),
    },
    shares: {
        get: endpoint("/knowledge-wiki/space/page/:pageId/share-link", "GET"),
        generate: endpoint("/knowledge-wiki/space/page/:pageId/share-link", "POST"),
        disable: endpoint("/knowledge-wiki/space/page/:pageId/share-link/:shortCode", "DELETE"),
        resolve: endpoint("/knowledge-wiki/share/public/:shortCode/resolve", "GET", "public"),
    },
    comments: {
        list: endpoint("/knowledge-wiki/space/page/:pageId/comment/list", "GET"),
        count: endpoint("/knowledge-wiki/space/page/:pageId/comment/count", "GET"),
        create: endpoint("/knowledge-wiki/space/page/:pageId/comment", "POST"),
        delete: endpoint("/knowledge-wiki/space/page/:pageId/comment/:commentId", "DELETE"),
        toggleResolved: endpoint("/knowledge-wiki/space/page/:pageId/comment/:commentId/resolve", "PUT"),
        addReaction: endpoint("/knowledge-wiki/space/page/:pageId/comment/:commentId/reaction", "POST"),
        removeReaction: endpoint("/knowledge-wiki/space/page/:pageId/comment/:commentId/reaction", "DELETE"),
    },
    tags: {
        space: endpoint("/knowledge-wiki/space/:spaceId/tags", "GET"),
        updatePage: endpoint("/knowledge-wiki/space/page/:pageId/tags", "PUT"),
    },
    activity: {
        space: endpoint("/knowledge-wiki/space/:spaceId/activity/list", "GET"),
    },
    relations: {
        pageBacklinks: endpoint("/knowledge-wiki/space/page/:pageId/backlinks", "GET"),
        blockBacklinks: endpoint("/knowledge-wiki/space/block/:blockId/backlinks", "GET"),
        graph: endpoint("/knowledge-wiki/space/graph", "GET"),
        blocks: endpoint("/knowledge-wiki/space/page/blocks", "GET"),
        blockDetail: endpoint("/knowledge-wiki/space/page/block/detail/:id", "GET"),
        searchBlocks: endpoint("/knowledge-wiki/space/page/block/search", "GET"),
        reindexBlocks: endpoint("/knowledge-wiki/space/page/block/search/reindex", "POST"),
    },
    documents: {
        document: endpoint("/knowledge-wiki/page/:id/doc", "GET"),
        checkpoint: endpoint("/knowledge-wiki/page/:id/checkpoints", "POST"),
        history: endpoint("/knowledge-wiki/page/:id/history", "GET"),
        historyDocument: endpoint("/knowledge-wiki/page/:id/history/:rev/doc", "GET"),
        restoreRevision: endpoint("/knowledge-wiki/page/:id/restore", "POST"),
        applyOperations: endpoint("/knowledge-wiki/page/:id/ops", "POST"),
        reconcile: endpoint("/knowledge-wiki/page/:id/reconcile", "POST"),
        claimSession: endpoint("/knowledge-wiki/page/:id/session/claim", "POST"),
        heartbeatSession: endpoint("/knowledge-wiki/page/:id/session/heartbeat", "POST"),
        releaseSession: endpoint("/knowledge-wiki/page/:id/session", "DELETE"),
        claimSeed: endpoint("/knowledge-wiki/space/page/:id/seed-claim", "POST"),
        releaseSeed: endpoint("/knowledge-wiki/space/page/:id/seed-claim", "DELETE"),
    },
} as const;
