import { ipcMain } from 'electron';
import {
  getAuthManager,
  getStorageAdapter,
  getPluginCacheService,
  getAuthApi,
  getSpaceApi,
  getPageApi,
  getPluginApi,
  getFileApi,
  getDatabaseManager,
  getRepositories,
} from './services';
import type { LoginCredentials } from '@kn/electron-adapter';

/**
 * Setup all IPC handlers
 */
export function setupIpcHandlers() {
  // ==================== Auth Handlers ====================

  ipcMain.handle('auth:login', async (_event, credentials: LoginCredentials) => {
    const authManager = getAuthManager();
    return await authManager.loginWithPassword(credentials);
  });

  ipcMain.handle('auth:loginAnonymous', async () => {
    const authManager = getAuthManager();
    return await authManager.loginAsAnonymous();
  });

  ipcMain.handle('auth:logout', async () => {
    const authManager = getAuthManager();
    return await authManager.logout();
  });

  ipcMain.handle('auth:getInfo', async () => {
    const authManager = getAuthManager();
    return authManager.getAuthInfo();
  });

  ipcMain.handle('auth:getUserInfo', async () => {
    const authManager = getAuthManager();
    return authManager.getUserInfo();
  });

  ipcMain.handle('auth:getMembership', async () => {
    const authManager = getAuthManager();
    return authManager.getMembership();
  });

  ipcMain.handle('auth:isLoggedIn', async () => {
    const authManager = getAuthManager();
    return authManager.isLoggedIn();
  });

  ipcMain.handle('auth:isMember', async () => {
    const authManager = getAuthManager();
    return authManager.isMember();
  });

  ipcMain.handle('auth:updatePassword', async (_event, oldPassword: string, newPassword: string, confirmPassword: string) => {
    const authManager = getAuthManager();
    return await authManager.updatePassword(oldPassword, newPassword, confirmPassword);
  });

  ipcMain.handle('auth:register', async (_event, data: any) => {
    const authManager = getAuthManager();
    return await authManager.register(data);
  });

  // ==================== User Handlers ====================

  ipcMain.handle('user:getInfo', async () => {
    const authManager = getAuthManager();
    return authManager.getUserInfo();
  });

  ipcMain.handle('user:search', async (_event, query: string) => {
    // TODO: Implement user search via API
    return { data: [] };
  });

  // ==================== Space Handlers ====================

  ipcMain.handle('space:create', async (_event, dto: any) => {
    const storage = getStorageAdapter();
    return await storage.createSpace(dto);
  });

  ipcMain.handle('space:get', async (_event, id: number) => {
    const storage = getStorageAdapter();
    return await storage.getSpace(id);
  });

  ipcMain.handle('space:list', async () => {
    const storage = getStorageAdapter();
    return { data: await storage.getAllSpaces() };
  });

  ipcMain.handle('space:getAll', async () => {
    const storage = getStorageAdapter();
    return await storage.getAllSpaces();
  });

  ipcMain.handle('space:getPersonal', async () => {
    const storage = getStorageAdapter();
    const spaces = await storage.getAllSpaces();
    // Return first space as personal space for now
    return { data: spaces[0] || null };
  });

  ipcMain.handle('space:getDetail', async (_event, id: string) => {
    const storage = getStorageAdapter();
    return { data: await storage.getSpace(parseInt(id)) };
  });

  ipcMain.handle('space:addFavorite', async (_event, id: string) => {
    // TODO: Implement favorite functionality
    return { success: true };
  });

  ipcMain.handle('space:getMembers', async (_event, id: string) => {
    // TODO: Implement members functionality
    return { data: [] };
  });

  ipcMain.handle('space:update', async (_event, id: number, data: any) => {
    const storage = getStorageAdapter();
    return await storage.updateSpace(id, data);
  });

  ipcMain.handle('space:delete', async (_event, id: number) => {
    const storage = getStorageAdapter();
    return await storage.deleteSpace(id);
  });

  // ==================== Page Handlers ====================

  ipcMain.handle('page:create', async (_event, dto: any) => {
    const storage = getStorageAdapter();
    return await storage.createPage(dto);
  });

  ipcMain.handle('page:get', async (_event, id: number) => {
    const storage = getStorageAdapter();
    return await storage.getPage(id);
  });

  ipcMain.handle('page:getBySpace', async (_event, spaceId: number) => {
    const storage = getStorageAdapter();
    return await storage.getPagesBySpace(spaceId);
  });

  ipcMain.handle('page:getTree', async (_event, spaceId: number) => {
    const storage = getStorageAdapter();
    return await storage.getPageTree(spaceId);
  });

  ipcMain.handle('page:getRecent', async (_event, limit?: number) => {
    const storage = getStorageAdapter();
    return await storage.getRecentPages(limit);
  });

  ipcMain.handle('page:update', async (_event, id: number, data: any) => {
    const storage = getStorageAdapter();
    return await storage.updatePage(id, data);
  });

  ipcMain.handle('page:delete', async (_event, id: number) => {
    const storage = getStorageAdapter();
    return await storage.deletePage(id);
  });

  ipcMain.handle('page:restore', async (_event, id: number) => {
    const storage = getStorageAdapter();
    return await storage.restorePage(id);
  });

  ipcMain.handle('page:save', async (_event, data: any) => {
    const storage = getStorageAdapter();
    if (data.id) {
      return { data: await storage.updatePage(data.id, data) };
    }
    return { data: await storage.createPage(data) };
  });

  ipcMain.handle('page:list', async (_event, params: any) => {
    const storage = getStorageAdapter();
    const pages = await storage.getPagesBySpace(params?.spaceId);
    return { data: pages };
  });

  ipcMain.handle('page:getContent', async (_event, id: string) => {
    const storage = getStorageAdapter();
    const page = await storage.getPage(parseInt(id));
    return { data: page };
  });

  ipcMain.handle('page:moveToTrash', async (_event, id: string) => {
    const storage = getStorageAdapter();
    return { data: await storage.deletePage(parseInt(id)) };
  });

  ipcMain.handle('page:getFavorites', async (_event, params: any) => {
    // TODO: Implement favorites functionality
    return { data: [] };
  });

  ipcMain.handle('page:getTemplates', async () => {
    // TODO: Implement templates functionality
    return { data: [] };
  });

  ipcMain.handle('page:saveAsTemplate', async (_event, id: string) => {
    // TODO: Implement save as template functionality
    return { success: true };
  });

  ipcMain.handle('page:addFavorite', async (_event, id: string) => {
    // TODO: Implement favorite functionality
    return { success: true };
  });

  ipcMain.handle('page:removeFavorite', async (_event, id: string) => {
    // TODO: Implement remove favorite functionality
    return { success: true };
  });

  ipcMain.handle('page:getBlocks', async (_event, params: any) => {
    // TODO: Implement blocks functionality
    return { data: [] };
  });

  ipcMain.handle('page:getBlockInfo', async (_event, id: string) => {
    // TODO: Implement block info functionality
    return { data: null };
  });

  ipcMain.handle('page:getCollaborators', async (_event, pageId: string) => {
    // TODO: Implement collaborators functionality
    return { data: [] };
  });

  // ==================== Plugin Handlers ====================

  ipcMain.handle('plugin:search', async (_event, dto: any) => {
    const pluginApi = getPluginApi();
    return await pluginApi.searchPlugins(dto);
  });

  ipcMain.handle('plugin:getDetail', async (_event, id: number) => {
    const pluginApi = getPluginApi();
    return await pluginApi.getPluginDetail(id);
  });

  ipcMain.handle('plugin:install', async (_event, versionId: number, pluginId: string, version: string) => {
    const cacheService = getPluginCacheService();
    const repos = getRepositories();

    // Download and cache plugin
    const cachedInfo = await cacheService.cachePlugin(versionId, pluginId, version);

    // Save to database
    repos.plugin.install({
      id: `${pluginId}-${version}`,
      pluginId: versionId,
      name: pluginId,
      version,
      category: 'unknown', // TODO: get from plugin metadata
      isPremium: false,
      filePath: cachedInfo.filePath,
      enabled: true,
    });

    return cachedInfo;
  });

  ipcMain.handle('plugin:uninstall', async (_event, id: string) => {
    const repos = getRepositories();
    const cacheService = getPluginCacheService();

    const plugin = repos.plugin.getById(id);
    if (!plugin) {
      throw new Error('Plugin not found');
    }

    // Remove from cache
    await cacheService.removePluginCache(plugin.name, plugin.version);

    // Remove from database
    repos.plugin.uninstall(id);
  });

  ipcMain.handle('plugin:getInstalled', async () => {
    const repos = getRepositories();
    return repos.plugin.getAll();
  });

  ipcMain.handle('plugin:setEnabled', async (_event, id: string, enabled: boolean) => {
    const repos = getRepositories();
    repos.plugin.setEnabled(id, enabled);
  });

  // ==================== File Handlers ====================

  ipcMain.handle('file:upload', async (_event, data: any) => {
    // TODO: Implement file upload - for now return mock response
    return { data: { url: '' } };
  });

  ipcMain.handle('file:getRootFolder', async () => {
    // TODO: Implement root folder functionality
    return { data: null };
  });

  ipcMain.handle('file:getChildren', async (_event, parentId: string) => {
    // TODO: Implement children folder functionality
    return { data: [] };
  });

  ipcMain.handle('file:createFolder', async (_event, data: any) => {
    // TODO: Implement folder creation functionality
    return { data: null };
  });

  ipcMain.handle('file:download', async (_event, id: string) => {
    // TODO: Implement file download functionality
    return { data: null };
  });

  // ==================== Database Handlers ====================

  ipcMain.handle('db:getStats', async () => {
    const dbManager = getDatabaseManager();
    return dbManager.getStats();
  });

  ipcMain.handle('db:backup', async (_event, backupPath: string) => {
    const dbManager = getDatabaseManager();
    return await dbManager.backup(backupPath);
  });

  ipcMain.handle('db:vacuum', async () => {
    const dbManager = getDatabaseManager();
    return dbManager.vacuum();
  });

  // ==================== Storage Mode ====================

  ipcMain.handle('storage:getMode', async () => {
    const storage = getStorageAdapter();
    return storage.getMode();
  });

  console.log('IPC handlers setup complete');
}
