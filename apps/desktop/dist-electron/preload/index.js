"use strict";
const electron = require("electron");
const api = {
  // Auth
  auth: {
    login: (data) => electron.ipcRenderer.invoke("auth:login", data),
    register: (data) => electron.ipcRenderer.invoke("auth:register", data)
  },
  // User
  user: {
    getInfo: () => electron.ipcRenderer.invoke("user:getInfo"),
    search: (query) => electron.ipcRenderer.invoke("user:search", query)
  },
  // Space
  space: {
    list: () => electron.ipcRenderer.invoke("space:list"),
    getPersonal: () => electron.ipcRenderer.invoke("space:getPersonal"),
    getDetail: (id) => electron.ipcRenderer.invoke("space:getDetail", id),
    create: (data) => electron.ipcRenderer.invoke("space:create", data),
    addFavorite: (id) => electron.ipcRenderer.invoke("space:addFavorite", id),
    removeFavorite: (id) => electron.ipcRenderer.invoke("space:removeFavorite", id),
    getMembers: (id) => electron.ipcRenderer.invoke("space:getMembers", id),
    saveAsTemplate: (id) => electron.ipcRenderer.invoke("space:saveAsTemplate", id)
  },
  // Page
  page: {
    getTree: (spaceId, searchValue) => electron.ipcRenderer.invoke("page:getTree", { spaceId, searchValue }),
    getContent: (id) => electron.ipcRenderer.invoke("page:getContent", id),
    create: (data) => electron.ipcRenderer.invoke("page:create", data),
    save: (data) => electron.ipcRenderer.invoke("page:save", data),
    moveToTrash: (id) => electron.ipcRenderer.invoke("page:moveToTrash", id),
    restore: (id) => electron.ipcRenderer.invoke("page:restore", id),
    list: (params) => electron.ipcRenderer.invoke("page:list", params),
    getFavorites: (params) => electron.ipcRenderer.invoke("page:getFavorites", params),
    getRecent: () => electron.ipcRenderer.invoke("page:getRecent"),
    getTemplates: () => electron.ipcRenderer.invoke("page:getTemplates"),
    saveAsTemplate: (id) => electron.ipcRenderer.invoke("page:saveAsTemplate", id),
    addFavorite: (id) => electron.ipcRenderer.invoke("page:addFavorite", id),
    removeFavorite: (id) => electron.ipcRenderer.invoke("page:removeFavorite", id),
    getBlocks: (params) => electron.ipcRenderer.invoke("page:getBlocks", params),
    getBlockInfo: (id) => electron.ipcRenderer.invoke("page:getBlockInfo", id),
    getCollaborators: (pageId) => electron.ipcRenderer.invoke("page:getCollaborators", pageId)
  },
  // Plugin
  plugin: {
    list: () => electron.ipcRenderer.invoke("plugin:list"),
    get: (id) => electron.ipcRenderer.invoke("plugin:get", id),
    create: (data) => electron.ipcRenderer.invoke("plugin:create", data),
    install: (id) => electron.ipcRenderer.invoke("plugin:install", id),
    uninstall: (id) => electron.ipcRenderer.invoke("plugin:uninstall", id),
    update: (data) => electron.ipcRenderer.invoke("plugin:update", data),
    getInstalled: () => electron.ipcRenderer.invoke("plugin:getInstalled")
  },
  // File
  file: {
    upload: (data) => electron.ipcRenderer.invoke("file:upload", data),
    getRootFolder: () => electron.ipcRenderer.invoke("file:getRootFolder"),
    getChildren: (parentId) => electron.ipcRenderer.invoke("file:getChildren", parentId),
    createFolder: (data) => electron.ipcRenderer.invoke("file:createFolder", data),
    delete: (id) => electron.ipcRenderer.invoke("file:delete", id),
    download: (id) => electron.ipcRenderer.invoke("file:download", id),
    rename: (id, newName) => electron.ipcRenderer.invoke("file:rename", { id, newName })
  },
  // IM
  im: {
    send: (data) => electron.ipcRenderer.invoke("im:send", data),
    getConversation: (userId) => electron.ipcRenderer.invoke("im:getConversation", userId),
    getConversations: () => electron.ipcRenderer.invoke("im:getConversations"),
    getUnreadCount: () => electron.ipcRenderer.invoke("im:getUnreadCount"),
    getUnreadMessages: () => electron.ipcRenderer.invoke("im:getUnreadMessages"),
    markRead: (messageIds) => electron.ipcRenderer.invoke("im:markRead", messageIds),
    markAllRead: () => electron.ipcRenderer.invoke("im:markAllRead"),
    deleteMessage: (messageId) => electron.ipcRenderer.invoke("im:deleteMessage", messageId),
    clearConversation: (userId) => electron.ipcRenderer.invoke("im:clearConversation", userId),
    getOnlineUsers: () => electron.ipcRenderer.invoke("im:getOnlineUsers"),
    checkUserOnline: (userId) => electron.ipcRenderer.invoke("im:checkUserOnline", userId),
    getOnlineCount: () => electron.ipcRenderer.invoke("im:getOnlineCount")
  },
  // Generic invoke for flexibility
  invoke: (channel, data) => electron.ipcRenderer.invoke(channel, data)
};
electron.contextBridge.exposeInMainWorld("api", api);
//# sourceMappingURL=index.js.map
