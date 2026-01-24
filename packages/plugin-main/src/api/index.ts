import { API } from "@kn/core";
import { method } from "lodash";


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
        url: '/knowledge-wiki/space/page/block',
        method: 'GET'
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
}