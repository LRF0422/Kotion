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
    } as API
}