import { API } from "@kn/common";

/**
 * Response from the PATCH /page/:id/blocks incremental save endpoint.
 * Reports statistics about what was actually changed on the backend.
 */
export interface PatchResultResponse {
    created: number
    updated: number
    deleted: number
    skipped: number
    conflictBlockIds: string[]
    /** Block versions after patch (blockId -> new version number) */
    blockVersions: Record<string, number>
}

export const APIS = {
    QUERY_SPACE: {
        url: '/knowledge-wiki/space/list',
        method: 'GET',
        name: 'Query Space'
    } as API,
    PERSONAL_SPACE: {
        url: '/knowledge-wiki/space/personal',
        method: 'GET'
    } as API,
    LOGIN: {
        url: '/knowledge-auth/token',
        method: 'POST',
        name: 'Login'
    } as API,
    QUERY_TEMPLATES: {
        url: '/knowledge-wiki/page/templates',
        method: 'GET',
        name: 'Query Templates'
    } as API,
    SPACE_DETAIL: {
        url: '/knowledge-wiki/space/:id/detail',
        method: 'GET',
        name: 'Get Space Detail'
    } as API,
    GET_PAGE_TREE: {
        url: '/knowledge-wiki/space/:id/page/tree',
        method: 'GET',
        name: 'Get page tree'
    } as API,
    GET_PAGE_CONTENT: {
        url: '/knowledge-wiki/space/page/:id/content',
        method: 'GET',
        name: 'Get page content'
    } as API,
    GET_USER_INFO: {
        url: '/knowledge-system/user/info',
        method: 'GET'
    } as API,
    CREATE_OR_SAVE_PAGE: {
        url: '/knowledge-wiki/space/page',
        method: 'POST'
    } as API,
    /** Incremental save — send only changed blocks instead of the full page */
    PATCH_PAGE_BLOCKS: {
        url: '/knowledge-wiki/space/page/:id/blocks',
        method: 'PATCH'
    } as API,
    /** Bulk replace — first import/paste of a huge doc; one request, chunked server-side */
    BULK_PATCH_PAGE_BLOCKS: {
        url: '/knowledge-wiki/space/page/:id/blocks/bulk',
        method: 'POST'
    } as API,
    CREATE_SPACE: {
        url: '/knowledge-wiki/space',
        method: 'POST'
    } as API,
    ADD_FAVORITE_PAGE: {
        url: '/knowledge-wiki/space/page/:id/favorite',
        method: 'POST'
    } as API,
    REMOVE_FAVORITE: {
        url: '/knowledge-wiki/favorite/:id',
        method: 'DELETE'
    } as API,
    QUERY_FAVORITE: {
        url: '/knowledge-wiki/space/page/favorites',
        method: 'GET'
    } as API,
    SAVE_AS_TEMPLATE: {
        url: '/knowledge-wiki/space/page/:id/template',
        method: 'POST'
    } as API,
    QUERY_TEMPLATE: {
        url: '/knowledge-wiki/space/page/templates',
        method: 'GET'
    } as API,
    UPLOAD_FILE: {
        url: '/knowledge-resource/oss/endpoint/put-file',
        method: 'POST'
    } as API,
    QUERY_RECENT_PAGE: {
        url: '/knowledge-wiki/space/page/recent',
        method: 'GET'
    } as API,
    REGISTER: {
        url: '/knowledge-system/user/register',
        method: 'POST'
    } as API,
    MOVE_TO_TRASH: {
        url: '/knowledge-wiki/space/page/:id/trash',
        method: 'DELETE'
    } as API,
    QUERY_PAGE: {
        url: '/knowledge-wiki/space/page/list',
        method: 'GET'
    } as API,
    RESTORE_PAGE: {
        url: '/knowledge-wiki/space/page/:id/restore',
        method: 'PUT'
    } as API,
    CLOSE_SSE: {
        url: '/knowledge-message/sse/disconnect',
        method: 'GET'
    } as API,
    CREATE_INVITATION: {
        url: '/knowledge-wiki/space/collaborationInvitation',
        method: 'POST'
    } as API,
    QUERY_BLOCKS: {
        url: '/knowledge-wiki/space/page/blocks',
        method: 'GET'
    } as API,
    GET_BLOCK_INFO: {
        url: '/knowledge-wiki/space/page/block/detail/:id',
        method: 'GET'
    } as API,
    GET_BLOCK_VERSIONS: {
        url: '/knowledge-wiki/space/page/block/:blockId/versions',
        method: 'GET'
    } as API,
    DELETE_TEMPLATE: {
        url: '/knowledge-wiki/space/page/template/:id',
        method: 'DELETE'
    } as API,
    SAVE_SPACE_AS_TEMPLATE: {
        url: '/knowledge-wiki/space/template',
        method: 'POST'
    } as API,
    ADD_SPACE_FAVORITE: {
        url: '/knowledge-wiki/space/:id/favorite',
        method: 'POST'
    } as API,
    // ==================== Collaboration APIs ====================
    /** Get space members list */
    GET_SPACE_MEMBERS: {
        url: '/knowledge-wiki/space/:id/members',
        method: 'GET'
    } as API,
    /** Search users for invitation */
    SEARCH_USERS: {
        url: '/knowledge-system/user/search',
        method: 'GET'
    } as API,
    /** Get page collaborators */
    GET_PAGE_COLLABORATORS: {
        url: '/knowledge-wiki/space/page/:pageId/collaborators',
        method: 'GET'
    } as API,
    /** Remove page collaborator */
    REMOVE_PAGE_COLLABORATOR: {
        url: '/knowledge-wiki/space/page/:pageId/collaborator/:userId',
        method: 'DELETE'
    } as API,
    /** Update collaborator permission */
    UPDATE_COLLABORATOR_PERMISSION: {
        url: '/knowledge-wiki/space/page/:pageId/collaborator/:userId/permission',
        method: 'PUT'
    } as API,
    /** Generate share link */
    GENERATE_SHARE_LINK: {
        url: '/knowledge-wiki/space/page/:pageId/share-link',
        method: 'POST'
    } as API,
    /** Get current active share link of a page (null when sharing is off) */
    GET_PAGE_SHARE_LINK: {
        url: '/knowledge-wiki/space/page/:pageId/share-link',
        method: 'GET'
    } as API,
    /** Disable a share link */
    DISABLE_SHARE_LINK: {
        url: '/knowledge-wiki/space/page/:pageId/share-link/:shortCode',
        method: 'DELETE'
    } as API,
    /** Resolve a public share link (no auth required) */
    RESOLVE_SHARE_LINK: {
        url: '/knowledge-wiki/share/public/:shortCode/resolve',
        method: 'GET'
    } as API,
    /** Validate invitation token */
    VALIDATE_INVITATION: {
        url: '/knowledge-wiki/collaboration/invitation/:token/validate',
        method: 'GET'
    } as API,
    /** Accept invitation */
    ACCEPT_INVITATION: {
        url: '/knowledge-wiki/collaboration/invitation/:token/accept',
        method: 'POST'
    } as API,
    /** Get invitation page info */
    GET_INVITATION_PAGE: {
        url: '/knowledge-wiki/collaboration/invitation/:token/page',
        method: 'GET'
    } as API,
    /** Move page to another parent/space */
    MOVE_PAGE: {
        url: '/knowledge-wiki/space/page/:id/move',
        method: 'PUT'
    } as API,
    /** Get inviter's installed plugins */
    GET_INVITER_PLUGINS: {
        url: '/knowledge-wiki/collaboration/invitation/:token/plugins',
        method: 'GET'
    } as API,
    // ==================== Page Lifecycle APIs ====================
    /** Get paginated version history for a page */
    GET_PAGE_VERSIONS: {
        url: '/knowledge-wiki/space/page/:pageId/versions',
        method: 'GET'
    } as API,
    /** Get all versions of a page (non-paginated) */
    GET_ALL_PAGE_VERSIONS: {
        url: '/knowledge-wiki/space/page/:pageId/versions/all',
        method: 'GET'
    } as API,
    /** Get specific version content */
    GET_PAGE_VERSION: {
        url: '/knowledge-wiki/space/page/version/:versionId',
        method: 'GET'
    } as API,
    /** Rollback page to a specific version */
    ROLLBACK_PAGE_VERSION: {
        url: '/knowledge-wiki/space/page/:pageId/rollback',
        method: 'POST'
    } as API,
    /** Compare two page versions */
    COMPARE_PAGE_VERSIONS: {
        url: '/knowledge-wiki/space/page/versions/compare',
        method: 'POST'
    } as API,
    /** Delete draft version */
    DELETE_DRAFT_VERSION: {
        url: '/knowledge-wiki/space/page/:pageId/draft',
        method: 'DELETE'
    } as API,
    /** Get version count for a page */
    GET_PAGE_VERSION_COUNT: {
        url: '/knowledge-wiki/space/page/:pageId/versions/count',
        method: 'GET'
    } as API,
    /** Cross-space page relation graph (nodes = pages, edges = backlinks) */
    GET_SPACE_GRAPH: {
        url: '/knowledge-wiki/space/graph',
        method: 'GET',
        name: 'Get Space Graph'
    } as API,
    // ==================== Team Space Member APIs ====================
    /** List members of a team space */
    LIST_SPACE_MEMBERS: {
        url: '/knowledge-wiki/space/:spaceId/member/list',
        method: 'GET'
    } as API,
    /** Invite members to a team space */
    INVITE_SPACE_MEMBERS: {
        url: '/knowledge-wiki/space/:spaceId/member/invite',
        method: 'POST'
    } as API,
    /** Update a space member's role */
    UPDATE_SPACE_MEMBER_ROLE: {
        url: '/knowledge-wiki/space/:spaceId/member/role',
        method: 'PUT'
    } as API,
    /** Remove a member from a space */
    REMOVE_SPACE_MEMBER: {
        url: '/knowledge-wiki/space/:spaceId/member/:userId',
        method: 'DELETE'
    } as API,
    /** Leave a space */
    LEAVE_SPACE: {
        url: '/knowledge-wiki/space/:spaceId/member/leave',
        method: 'POST'
    } as API,
    /** Transfer space ownership */
    TRANSFER_SPACE_OWNERSHIP: {
        url: '/knowledge-wiki/space/:spaceId/member/transfer/:newOwnerId',
        method: 'PUT'
    } as API,
    /** List pending invitations of a space */
    LIST_PENDING_INVITATIONS: {
        url: '/knowledge-wiki/space/:spaceId/invitations/pending',
        method: 'GET'
    } as API,
    /** Revoke a pending invitation */
    REVOKE_INVITATION: {
        url: '/knowledge-wiki/space/:spaceId/invitations/:invitationId',
        method: 'DELETE'
    } as API,
    // ==================== Activity Feed APIs ====================
    /** Get space activity feed */
    GET_SPACE_ACTIVITIES: {
        url: '/knowledge-wiki/space/:spaceId/activity/list',
        method: 'GET'
    } as API,
    // ==================== Page Comment APIs ====================
    /** Get comments for a page */
    GET_PAGE_COMMENTS: {
        url: '/knowledge-wiki/space/page/:pageId/comment/list',
        method: 'GET'
    } as API,
    /** Add a comment to a page */
    ADD_PAGE_COMMENT: {
        url: '/knowledge-wiki/space/page/:pageId/comment',
        method: 'POST'
    } as API,
    /** Delete a comment */
    DELETE_PAGE_COMMENT: {
        url: '/knowledge-wiki/space/page/:pageId/comment/:commentId',
        method: 'DELETE'
    } as API,
    /** Toggle comment resolved status */
    TOGGLE_COMMENT_RESOLVED: {
        url: '/knowledge-wiki/space/page/:pageId/comment/:commentId/resolve',
        method: 'PUT'
    } as API,
    /** Add reaction to a comment */
    ADD_COMMENT_REACTION: {
        url: '/knowledge-wiki/space/page/:pageId/comment/:commentId/reaction',
        method: 'POST'
    } as API,
    /** Remove reaction from a comment */
    REMOVE_COMMENT_REACTION: {
        url: '/knowledge-wiki/space/page/:pageId/comment/:commentId/reaction',
        method: 'DELETE'
    } as API,
    /** Get comment count for a page */
    GET_COMMENT_COUNT: {
        url: '/knowledge-wiki/space/page/:pageId/comment/count',
        method: 'GET'
    } as API,
    // ==================== Page Tags & Featured APIs ====================
    /** Pin/unpin a page in a space */
    TOGGLE_PAGE_PIN: {
        url: '/knowledge-wiki/space/:spaceId/page/:pageId/pin',
        method: 'PUT'
    } as API,
    /** Get pinned pages for a space */
    GET_PINNED_PAGES: {
        url: '/knowledge-wiki/space/:spaceId/page/pinned',
        method: 'GET'
    } as API,
    /** Update page tags */
    UPDATE_PAGE_TAGS: {
        url: '/knowledge-wiki/space/page/:pageId/tags',
        method: 'PUT'
    } as API,
    /** Get all tags used in a space */
    GET_SPACE_TAGS: {
        url: '/knowledge-wiki/space/:spaceId/tags',
        method: 'GET'
    } as API,
    /** Get space-scoped templates (team template library) */
    GET_SPACE_TEMPLATES: {
        url: '/knowledge-wiki/space/:spaceId/page/templates',
        method: 'GET'
    } as API,
}