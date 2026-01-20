import { API } from "../hooks/use-api";

export const APIS = {
    LOGIN: {
        url: '/knowledge-auth/token',
        method: 'POST',
        name: 'Login'
    } as API,
    GET_USER_INFO: {
        url: '/knowledge-system/user/info',
        method: 'GET'
    } as API,
    UPLOAD_FILE: {
        url: '/knowledge-resource/oss/endpoint/put-file',
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
    } as API
}