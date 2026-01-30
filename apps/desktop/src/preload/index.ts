import { contextBridge, ipcRenderer } from 'electron'

// Define the API types
export interface ElectronAPI {
    // Auth APIs
    auth: {
        login: (data: { account: string; password: string }) => Promise<any>
        register: (data: { username: string; password: string; email: string }) => Promise<any>
    }
    // User APIs
    user: {
        getInfo: () => Promise<any>
        search: (query: string) => Promise<any>
    }
    // Space APIs
    space: {
        list: () => Promise<any>
        getPersonal: () => Promise<any>
        getDetail: (id: string) => Promise<any>
        create: (data: any) => Promise<any>
        addFavorite: (id: string) => Promise<any>
        removeFavorite: (id: string) => Promise<any>
        getMembers: (id: string) => Promise<any>
        saveAsTemplate: (id: string) => Promise<any>
    }
    // Page APIs
    page: {
        getTree: (spaceId: string, searchValue?: string) => Promise<any>
        getContent: (id: string) => Promise<any>
        create: (data: any) => Promise<any>
        save: (data: any) => Promise<any>
        moveToTrash: (id: string) => Promise<any>
        restore: (id: string) => Promise<any>
        list: (params: any) => Promise<any>
        getFavorites: (params: any) => Promise<any>
        getRecent: () => Promise<any>
        getTemplates: () => Promise<any>
        saveAsTemplate: (id: string) => Promise<any>
        addFavorite: (id: string) => Promise<any>
        removeFavorite: (id: string) => Promise<any>
        getBlocks: (params: any) => Promise<any>
        getBlockInfo: (id: string) => Promise<any>
        getCollaborators: (pageId: string) => Promise<any>
    }
    // Plugin APIs
    plugin: {
        list: () => Promise<any>
        get: (id: string) => Promise<any>
        create: (data: any) => Promise<any>
        install: (id: string) => Promise<any>
        uninstall: (id: string) => Promise<any>
        update: (data: any) => Promise<any>
        getInstalled: () => Promise<any>
    }
    // File APIs
    file: {
        upload: (data: { name: string; buffer: ArrayBuffer; mimeType: string }) => Promise<any>
        getRootFolder: () => Promise<any>
        getChildren: (parentId: string) => Promise<any>
        createFolder: (data: any) => Promise<any>
        delete: (id: string) => Promise<any>
        download: (id: string) => Promise<any>
        rename: (id: string, newName: string) => Promise<any>
    }
    // Instant Message APIs
    im: {
        send: (data: any) => Promise<any>
        getConversation: (userId: string) => Promise<any>
        getConversations: () => Promise<any>
        getUnreadCount: () => Promise<any>
        getUnreadMessages: () => Promise<any>
        markRead: (messageIds: string[]) => Promise<any>
        markAllRead: () => Promise<any>
        deleteMessage: (messageId: string) => Promise<any>
        clearConversation: (userId: string) => Promise<any>
        getOnlineUsers: () => Promise<any>
        checkUserOnline: (userId: string) => Promise<any>
        getOnlineCount: () => Promise<any>
    }
    // Utility APIs
    invoke: (channel: string, data?: any) => Promise<any>
}

// Expose APIs to the renderer process
const api: ElectronAPI = {
    // Auth
    auth: {
        login: (data) => ipcRenderer.invoke('auth:login', data),
        register: (data) => ipcRenderer.invoke('auth:register', data)
    },
    // User
    user: {
        getInfo: () => ipcRenderer.invoke('user:getInfo'),
        search: (query) => ipcRenderer.invoke('user:search', query)
    },
    // Space
    space: {
        list: () => ipcRenderer.invoke('space:list'),
        getPersonal: () => ipcRenderer.invoke('space:getPersonal'),
        getDetail: (id) => ipcRenderer.invoke('space:getDetail', id),
        create: (data) => ipcRenderer.invoke('space:create', data),
        addFavorite: (id) => ipcRenderer.invoke('space:addFavorite', id),
        removeFavorite: (id) => ipcRenderer.invoke('space:removeFavorite', id),
        getMembers: (id) => ipcRenderer.invoke('space:getMembers', id),
        saveAsTemplate: (id) => ipcRenderer.invoke('space:saveAsTemplate', id)
    },
    // Page
    page: {
        getTree: (spaceId, searchValue) => ipcRenderer.invoke('page:getTree', { spaceId, searchValue }),
        getContent: (id) => ipcRenderer.invoke('page:getContent', id),
        create: (data) => ipcRenderer.invoke('page:create', data),
        save: (data) => ipcRenderer.invoke('page:save', data),
        moveToTrash: (id) => ipcRenderer.invoke('page:moveToTrash', id),
        restore: (id) => ipcRenderer.invoke('page:restore', id),
        list: (params) => ipcRenderer.invoke('page:list', params),
        getFavorites: (params) => ipcRenderer.invoke('page:getFavorites', params),
        getRecent: () => ipcRenderer.invoke('page:getRecent'),
        getTemplates: () => ipcRenderer.invoke('page:getTemplates'),
        saveAsTemplate: (id) => ipcRenderer.invoke('page:saveAsTemplate', id),
        addFavorite: (id) => ipcRenderer.invoke('page:addFavorite', id),
        removeFavorite: (id) => ipcRenderer.invoke('page:removeFavorite', id),
        getBlocks: (params) => ipcRenderer.invoke('page:getBlocks', params),
        getBlockInfo: (id) => ipcRenderer.invoke('page:getBlockInfo', id),
        getCollaborators: (pageId) => ipcRenderer.invoke('page:getCollaborators', pageId)
    },
    // Plugin
    plugin: {
        list: () => ipcRenderer.invoke('plugin:list'),
        get: (id) => ipcRenderer.invoke('plugin:get', id),
        create: (data) => ipcRenderer.invoke('plugin:create', data),
        install: (id) => ipcRenderer.invoke('plugin:install', id),
        uninstall: (id) => ipcRenderer.invoke('plugin:uninstall', id),
        update: (data) => ipcRenderer.invoke('plugin:update', data),
        getInstalled: () => ipcRenderer.invoke('plugin:getInstalled')
    },
    // File
    file: {
        upload: (data) => ipcRenderer.invoke('file:upload', data),
        getRootFolder: () => ipcRenderer.invoke('file:getRootFolder'),
        getChildren: (parentId) => ipcRenderer.invoke('file:getChildren', parentId),
        createFolder: (data) => ipcRenderer.invoke('file:createFolder', data),
        delete: (id) => ipcRenderer.invoke('file:delete', id),
        download: (id) => ipcRenderer.invoke('file:download', id),
        rename: (id, newName) => ipcRenderer.invoke('file:rename', { id, newName })
    },
    // IM
    im: {
        send: (data) => ipcRenderer.invoke('im:send', data),
        getConversation: (userId) => ipcRenderer.invoke('im:getConversation', userId),
        getConversations: () => ipcRenderer.invoke('im:getConversations'),
        getUnreadCount: () => ipcRenderer.invoke('im:getUnreadCount'),
        getUnreadMessages: () => ipcRenderer.invoke('im:getUnreadMessages'),
        markRead: (messageIds) => ipcRenderer.invoke('im:markRead', messageIds),
        markAllRead: () => ipcRenderer.invoke('im:markAllRead'),
        deleteMessage: (messageId) => ipcRenderer.invoke('im:deleteMessage', messageId),
        clearConversation: (userId) => ipcRenderer.invoke('im:clearConversation', userId),
        getOnlineUsers: () => ipcRenderer.invoke('im:getOnlineUsers'),
        checkUserOnline: (userId) => ipcRenderer.invoke('im:checkUserOnline', userId),
        getOnlineCount: () => ipcRenderer.invoke('im:getOnlineCount')
    },
    // Generic invoke for flexibility
    invoke: (channel, data) => ipcRenderer.invoke(channel, data)
}

// Expose the API to the renderer
contextBridge.exposeInMainWorld('api', api)

// Declare global types
declare global {
    interface Window {
        api: ElectronAPI
    }
}
