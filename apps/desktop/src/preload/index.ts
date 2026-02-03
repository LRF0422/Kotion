import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // ==================== Auth ====================
  auth: {
    login: (credentials: any) => ipcRenderer.invoke('auth:login', credentials),
    loginAnonymous: () => ipcRenderer.invoke('auth:loginAnonymous'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getInfo: () => ipcRenderer.invoke('auth:getInfo'),
    getUserInfo: () => ipcRenderer.invoke('auth:getUserInfo'),
    getMembership: () => ipcRenderer.invoke('auth:getMembership'),
    isLoggedIn: () => ipcRenderer.invoke('auth:isLoggedIn'),
    isMember: () => ipcRenderer.invoke('auth:isMember'),
    updatePassword: (oldPassword: string, newPassword: string, confirmPassword: string) =>
      ipcRenderer.invoke('auth:updatePassword', oldPassword, newPassword, confirmPassword),
    register: (data: any) => ipcRenderer.invoke('auth:register', data),
    
    // Events
    onAuthExpired: (callback: () => void) => {
      ipcRenderer.on('auth:expired', callback);
      return () => ipcRenderer.removeListener('auth:expired', callback);
    },
  },

  // ==================== Space ====================
  space: {
    create: (dto: any) => ipcRenderer.invoke('space:create', dto),
    get: (id: number) => ipcRenderer.invoke('space:get', id),
    getAll: () => ipcRenderer.invoke('space:getAll'),
    update: (id: number, data: any) => ipcRenderer.invoke('space:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('space:delete', id),
  },

  // ==================== Page ====================
  page: {
    create: (dto: any) => ipcRenderer.invoke('page:create', dto),
    get: (id: number) => ipcRenderer.invoke('page:get', id),
    getBySpace: (spaceId: number) => ipcRenderer.invoke('page:getBySpace', spaceId),
    getTree: (spaceId: number) => ipcRenderer.invoke('page:getTree', spaceId),
    getRecent: (limit?: number) => ipcRenderer.invoke('page:getRecent', limit),
    update: (id: number, data: any) => ipcRenderer.invoke('page:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('page:delete', id),
    restore: (id: number) => ipcRenderer.invoke('page:restore', id),
  },

  // ==================== Plugin ====================
  plugin: {
    search: (dto: any) => ipcRenderer.invoke('plugin:search', dto),
    getDetail: (id: number) => ipcRenderer.invoke('plugin:getDetail', id),
    install: (versionId: number, pluginId: string, version: string) =>
      ipcRenderer.invoke('plugin:install', versionId, pluginId, version),
    uninstall: (id: string) => ipcRenderer.invoke('plugin:uninstall', id),
    getInstalled: () => ipcRenderer.invoke('plugin:getInstalled'),
    setEnabled: (id: string, enabled: boolean) =>
      ipcRenderer.invoke('plugin:setEnabled', id, enabled),
  },

  // ==================== Database ====================
  database: {
    getStats: () => ipcRenderer.invoke('db:getStats'),
    backup: (backupPath: string) => ipcRenderer.invoke('db:backup', backupPath),
    vacuum: () => ipcRenderer.invoke('db:vacuum'),
  },

  // ==================== Storage ====================
  storage: {
    getMode: () => ipcRenderer.invoke('storage:getMode'),
  },

  // ==================== Events ====================
  on: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    return () => ipcRenderer.removeListener(channel, callback);
  },

  once: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.once(channel, (_event, ...args) => callback(...args));
  },
});

// Type definitions for TypeScript
export interface ElectronAPI {
  auth: {
    login: (credentials: any) => Promise<any>;
    loginAnonymous: () => Promise<any>;
    logout: () => Promise<void>;
    getInfo: () => Promise<any>;
    getUserInfo: () => Promise<any>;
    getMembership: () => Promise<any>;
    isLoggedIn: () => Promise<boolean>;
    isMember: () => Promise<boolean>;
    updatePassword: (oldPassword: string, newPassword: string, confirmPassword: string) => Promise<void>;
    register: (data: any) => Promise<void>;
    onAuthExpired: (callback: () => void) => () => void;
  };
  space: {
    create: (dto: any) => Promise<any>;
    get: (id: number) => Promise<any>;
    getAll: () => Promise<any[]>;
    update: (id: number, data: any) => Promise<void>;
    delete: (id: number) => Promise<void>;
  };
  page: {
    create: (dto: any) => Promise<any>;
    get: (id: number) => Promise<any>;
    getBySpace: (spaceId: number) => Promise<any[]>;
    getTree: (spaceId: number) => Promise<any[]>;
    getRecent: (limit?: number) => Promise<any[]>;
    update: (id: number, data: any) => Promise<void>;
    delete: (id: number) => Promise<void>;
    restore: (id: number) => Promise<void>;
  };
  plugin: {
    search: (dto: any) => Promise<any>;
    getDetail: (id: number) => Promise<any>;
    install: (versionId: number, pluginId: string, version: string) => Promise<any>;
    uninstall: (id: string) => Promise<void>;
    getInstalled: () => Promise<any[]>;
    setEnabled: (id: string, enabled: boolean) => Promise<void>;
  };
  database: {
    getStats: () => Promise<any>;
    backup: (backupPath: string) => Promise<void>;
    vacuum: () => Promise<void>;
  };
  storage: {
    getMode: () => Promise<string>;
  };
  on: (channel: string, callback: (...args: any[]) => void) => () => void;
  once: (channel: string, callback: (...args: any[]) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
