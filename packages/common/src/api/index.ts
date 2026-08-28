import { API } from "./use-api";
import type {
    ContextTokenResponse,
    ContextVO,
    CreateOrganizationBody,
    CurrentUser,
    InviteOrganizationMemberBody,
    OrganizationInvitation,
    OrganizationMember,
    SwitchContextBody,
    UpdateOrganizationMemberRoleBody,
    UpdatePasswordBody,
    UpdateProfileBody,
} from "./types";

export * from "./types";
export * from "./use-api";

export const APIS = {
    LOGIN: {
        url: '/knowledge-auth/oauth2/token',
        method: 'POST',
        encoding: 'form',
        name: 'Login'
    } as API,
    REFRESH_TOKEN: {
        url: '/knowledge-auth/oauth2/token',
        method: 'POST',
        encoding: 'form',
    } as API,
    LOGOUT: {
        url: '/knowledge-auth/oauth2/logout',
        method: 'POST',
        encoding: 'form',
    } as API,
    GET_USER_INFO: {
        url: '/knowledge-system/user/info',
        method: 'GET'
    } as API,
    GET_ME: {
        url: '/knowledge-system/api/v1/me',
        method: 'GET'
    } as API<CurrentUser>,
    UPDATE_ME_PROFILE: {
        url: '/knowledge-system/api/v1/me/profile',
        method: 'PATCH'
    } as API<CurrentUser, undefined, UpdateProfileBody>,
    UPDATE_ME_PASSWORD: {
        url: '/knowledge-system/api/v1/me/password',
        method: 'POST'
    } as API<unknown, undefined, UpdatePasswordBody>,
    GET_CONTEXTS: {
        url: '/knowledge-system/api/v1/me/contexts',
        method: 'GET'
    } as API<ContextVO[]>,
    CREATE_ORGANIZATION: {
        url: '/knowledge-system/api/v1/organizations',
        method: 'POST'
    } as API<ContextVO, undefined, CreateOrganizationBody>,
    GET_ORGANIZATION_MEMBERS: {
        url: '/knowledge-system/api/v1/organizations/:contextId/members',
        method: 'GET'
    } as API<OrganizationMember[], { contextId: string }>,
    INVITE_ORGANIZATION_MEMBER: {
        url: '/knowledge-system/api/v1/organizations/:contextId/invitations',
        method: 'POST'
    } as API<OrganizationInvitation, { contextId: string }, InviteOrganizationMemberBody>,
    ACCEPT_ORGANIZATION_INVITATION: {
        url: '/knowledge-system/api/v1/organization-invitations/:token/accept',
        method: 'POST'
    } as API<ContextVO, { token: string }>,
    UPDATE_ORGANIZATION_MEMBER_ROLE: {
        url: '/knowledge-system/api/v1/organizations/:contextId/members/:memberId',
        method: 'PATCH'
    } as API<unknown, { contextId: string; memberId: string }, UpdateOrganizationMemberRoleBody>,
    REMOVE_ORGANIZATION_MEMBER: {
        url: '/knowledge-system/api/v1/organizations/:contextId/members/:memberId',
        method: 'DELETE'
    } as API<unknown, { contextId: string; memberId: string }>,
    LEAVE_ORGANIZATION: {
        url: '/knowledge-system/api/v1/organizations/:contextId/leave',
        method: 'POST'
    } as API<unknown, { contextId: string }>,
    SWITCH_CONTEXT: {
        url: '/knowledge-auth/oauth2/context',
        method: 'POST',
        encoding: 'form'
    } as API<ContextTokenResponse, { contextId: string }, SwitchContextBody>,
    UPLOAD_FILE: {
        url: '/knowledge-resource/oss/endpoint/put-file',
        method: 'POST'
    } as API,
    UPLOAD_PLUGIN_FILE: {
        url: '/knowledge-resource/oss/endpoint/put-plugin-file',
        method: 'POST'
    } as API,
    REGISTER: {
        url: '/knowledge-system/user/register',
        method: 'POST'
    } as API,
    GET_PLUGIN_LIST: {
        url: '/knowledge-wiki/plugin',
        method: 'GET'
    } as API,
    INSTALL_PLUGIN: {
        url: '/knowledge-wiki/plugin/install',
        method: 'POST'
    } as API,
    GET_INSTALLED_PLUGINS: {
        url: '/knowledge-wiki/plugin/install/list',
        method: 'GET'
    } as API,
    CREATE_PLUGIN: {
        url: '/knowledge-wiki/plugin',
        method: 'POST'
    } as API,
    SUBMIT_PLUGIN: {
        url: '/knowledge-wiki/plugin/submissions',
        method: 'POST'
    } as API,
    RESUBMIT_PLUGIN: {
        url: '/knowledge-wiki/plugin/submissions/:id',
        method: 'PUT'
    } as API,
    GET_MY_PLUGIN_SUBMISSIONS: {
        url: '/knowledge-wiki/plugin/submissions/mine',
        method: 'GET'
    } as API,
    REVIEW_PLUGIN_SUBMISSION: {
        url: '/knowledge-wiki/plugin/submissions/:id/review',
        method: 'POST'
    } as API,
    PUBLISH_PLUGIN_VERSION: {
        url: '/knowledge-wiki/plugin/:id/versions',
        method: 'POST'
    } as API,
    GET_PLUGIN: {
        url: '/knowledge-wiki/plugin/:id',
        method: 'GET'
    } as API,
    UNINSTALL_PLUGIN: {
        url: '/knowledge-wiki/plugin/uninstall',
        method: 'POST'
    } as API,
    UPDATE_PLUGIN: {
        url: '/knowledge-wiki/plugin/update',
        method: 'POST'
    } as API,
    ENABLE_PLUGIN: {
        url: '/knowledge-wiki/plugin/enable',
        method: 'POST'
    } as API,
    DISABLE_PLUGIN: {
        url: '/knowledge-wiki/plugin/disable',
        method: 'POST'
    } as API,
    DELETE_INSTALLED_PLUGIN: {
        url: '/knowledge-wiki/plugin/remove',
        method: 'POST'
    } as API,

    // ==================== Instant Message APIs ====================
    /** Send a message */
    IM_SEND_MESSAGE: {
        url: '/instant-message/send',
        method: 'POST'
    } as API,
    /** Get conversation messages */
    IM_GET_CONVERSATION: {
        url: '/instant-message/conversation/:userId',
        method: 'GET'
    } as API,
    /** Get all conversations list */
    IM_GET_CONVERSATIONS: {
        url: '/instant-message/conversations',
        method: 'GET'
    } as API,
    /** Get unread message count */
    IM_GET_UNREAD_COUNT: {
        url: '/instant-message/unread-count',
        method: 'GET'
    } as API,
    /** Get unread messages list */
    IM_GET_UNREAD_MESSAGES: {
        url: '/instant-message/unread',
        method: 'GET'
    } as API,
    /** Mark messages as read */
    IM_MARK_READ: {
        url: '/instant-message/read',
        method: 'POST'
    } as API,
    /** Mark all messages as read */
    IM_MARK_ALL_READ: {
        url: '/instant-message/read-all',
        method: 'POST'
    } as API,
    /** Delete a message */
    IM_DELETE_MESSAGE: {
        url: '/instant-message/:messageId',
        method: 'DELETE'
    } as API,
    /** Clear conversation history */
    IM_CLEAR_CONVERSATION: {
        url: '/instant-message/conversation/:userId',
        method: 'DELETE'
    } as API,
    /** Get online users list */
    IM_GET_ONLINE_USERS: {
        url: '/instant-message/online-users',
        method: 'GET'
    } as API,
    /** Check if user is online */
    IM_CHECK_USER_ONLINE: {
        url: '/instant-message/online/:userId',
        method: 'GET'
    } as API,
    /** Get online user count */
    IM_GET_ONLINE_COUNT: {
        url: '/instant-message/online-count',
        method: 'GET'
    } as API,

    // ==================== Plugin Config APIs ====================
    /** Get a single plugin's config */
    GET_PLUGIN_CONFIG: {
        url: '/knowledge-wiki/plugin-config/:pluginKey',
        method: 'GET'
    } as API,
    /** Save a plugin's config (use POST because existing PUT handler doesn't pass body) */
    SAVE_PLUGIN_CONFIG: {
        url: '/knowledge-wiki/plugin-config/:pluginKey',
        method: 'POST'
    } as API,
    /** Get all plugin configs */
    GET_ALL_PLUGIN_CONFIGS: {
        url: '/knowledge-wiki/plugin-config',
        method: 'GET'
    } as API
}
