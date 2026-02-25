import { ipcMain, dialog, app } from 'electron';
import * as fs from 'fs-extra';
import {
  getAuthManager,
  getStorageAdapter,
  getPluginCacheService,
  getAuthApi,
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
    const authApi = getAuthApi();
    try {
      const users = await authApi.searchUsers(query);
      return { data: users };
    } catch (error) {
      console.error('Failed to search users:', error);
      return { data: [] };
    }
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
    const storage = getStorageAdapter();
    try {
      await storage.addSpaceFavorite(parseInt(id));
      return { success: true };
    } catch (error) {
      console.error('Failed to add space to favorites:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('space:removeFavorite', async (_event, id: string) => {
    const storage = getStorageAdapter();
    try {
      await storage.removeSpaceFavorite(parseInt(id));
      return { success: true };
    } catch (error) {
      console.error('Failed to remove space from favorites:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('space:getFavorites', async () => {
    const storage = getStorageAdapter();
    try {
      const favorites = await storage.getFavoriteSpaces();
      return { data: favorites };
    } catch (error) {
      console.error('Failed to get favorite spaces:', error);
      return { data: [] };
    }
  });

  ipcMain.handle('space:getMembers', async (_event, _id: string) => {
    // Members are stored locally - for now return current user as member
    const authManager = getAuthManager();
    const userInfo = authManager.getUserInfo();
    if (userInfo) {
      return { data: [{ ...userInfo, role: 'owner' }] };
    }
    return { data: [] };
  });

  ipcMain.handle('space:getTemplates', async () => {
    const storage = getStorageAdapter();
    try {
      const templates = await storage.getSpaceTemplates();
      return { data: templates };
    } catch (error) {
      console.error('Failed to get space templates:', error);
      return { data: [] };
    }
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

  ipcMain.handle('page:getFavorites', async () => {
    const storage = getStorageAdapter();
    try {
      const favorites = await storage.getFavoritePages();
      return { data: favorites };
    } catch (error) {
      console.error('Failed to get favorite pages:', error);
      return { data: [] };
    }
  });

  ipcMain.handle('page:getTemplates', async () => {
    const storage = getStorageAdapter();
    try {
      const templates = await storage.getPageTemplates();
      return { data: templates };
    } catch (error) {
      console.error('Failed to get templates:', error);
      return { data: [] };
    }
  });

  ipcMain.handle('page:saveAsTemplate', async (_event, id: string) => {
    const storage = getStorageAdapter();
    try {
      await storage.savePageAsTemplate(parseInt(id));
      return { success: true };
    } catch (error) {
      console.error('Failed to save page as template:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('page:addFavorite', async (_event, id: string) => {
    const storage = getStorageAdapter();
    try {
      await storage.addPageFavorite(parseInt(id));
      return { success: true };
    } catch (error) {
      console.error('Failed to add page to favorites:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('page:removeFavorite', async (_event, id: string) => {
    const storage = getStorageAdapter();
    try {
      await storage.removePageFavorite(parseInt(id));
      return { success: true };
    } catch (error) {
      console.error('Failed to remove page from favorites:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('page:getBlocks', async (_event, params: { pageId: number }) => {
    const storage = getStorageAdapter();
    try {
      const blocks = await storage.getPageBlocks(params.pageId);
      return { data: blocks };
    } catch (error) {
      console.error('Failed to get page blocks:', error);
      return { data: [] };
    }
  });

  ipcMain.handle('page:getBlockInfo', async (_event, id: string) => {
    const storage = getStorageAdapter();
    try {
      const block = await storage.getBlockById(id);
      return { data: block };
    } catch (error) {
      console.error('Failed to get block info:', error);
      return { data: null };
    }
  });

  ipcMain.handle('page:createBlock', async (_event, block: {
    id: string;
    pageId: number;
    type: string;
    content?: any;
    properties?: Record<string, any>;
    parentId?: string;
    order?: number;
  }) => {
    const storage = getStorageAdapter();
    try {
      await storage.createBlock(block);
      return { success: true };
    } catch (error) {
      console.error('Failed to create block:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('page:updateBlock', async (_event, blockId: string, data: any) => {
    const storage = getStorageAdapter();
    try {
      await storage.updateBlock(blockId, data);
      return { success: true };
    } catch (error) {
      console.error('Failed to update block:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('page:deleteBlock', async (_event, blockId: string) => {
    const storage = getStorageAdapter();
    try {
      await storage.deleteBlock(blockId);
      return { success: true };
    } catch (error) {
      console.error('Failed to delete block:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('page:getCollaborators', async (_event, _pageId: string) => {
    // Collaborators are stored locally - for now return current user as collaborator
    const authManager = getAuthManager();
    const userInfo = authManager.getUserInfo();
    if (userInfo) {
      return { data: [{ ...userInfo, permission: 'owner' }] };
    }
    return { data: [] };
  });

  ipcMain.handle('page:search', async (_event, keyword: string, spaceId?: number) => {
    const storage = getStorageAdapter();
    try {
      const pages = await storage.searchPages(keyword, spaceId);
      return { data: pages };
    } catch (error) {
      console.error('Failed to search pages:', error);
      return { data: [] };
    }
  });

  ipcMain.handle('page:getTrash', async (_event, spaceId?: number) => {
    const storage = getStorageAdapter();
    try {
      const pages = await storage.getTrashPages(spaceId);
      return { data: pages };
    } catch (error) {
      console.error('Failed to get trash pages:', error);
      return { data: [] };
    }
  });

  ipcMain.handle('page:permanentDelete', async (_event, id: string) => {
    const storage = getStorageAdapter();
    try {
      await storage.permanentDeletePage(parseInt(id));
      return { success: true };
    } catch (error) {
      console.error('Failed to permanently delete page:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('page:emptyTrash', async (_event, spaceId?: number) => {
    const storage = getStorageAdapter();
    try {
      await storage.emptyTrash(spaceId);
      return { success: true };
    } catch (error) {
      console.error('Failed to empty trash:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // ==================== Plugin Config Handlers ====================

  ipcMain.handle('pluginConfig:getAll', async () => {
    const db = getDatabaseManager().getDatabase();
    const rows = db.prepare(
      "SELECT key, value FROM settings WHERE key LIKE 'plugin_config:%'"
    ).all() as { key: string; value: string }[];
    const list = rows.map((row) => {
      const pluginKey = row.key.replace('plugin_config:', '');
      const config = JSON.parse(row.value);
      return { pluginKey, config, updatedAt: config._updatedAt || '' };
    });
    return { code: 200, data: list };
  });

  ipcMain.handle('pluginConfig:getOrSave', async (_event, data: any) => {
    const db = getDatabaseManager().getDatabase();

    if (typeof data === 'string') {
      // GET single config – data is the pluginKey
      const row = db.prepare(
        "SELECT value FROM settings WHERE key = ?"
      ).get(`plugin_config:${data}`) as { value: string } | undefined;
      if (!row) return { code: 200, data: null };
      const config = JSON.parse(row.value);
      return { code: 200, data: { pluginKey: data, config, updatedAt: config._updatedAt || '' } };
    }

    // POST save – data is { config: {...}, _id: pluginKey } (combined by handleElectronRequest)
    if (data && typeof data === 'object' && data.config && data._id) {
      const pluginKey = data._id;
      const config = data.config;
      const now = Date.now();
      const value = JSON.stringify({ ...config, _updatedAt: new Date(now).toISOString() });
      db.prepare(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)"
      ).run(`plugin_config:${pluginKey}`, value, now);
      return { code: 200, data: { pluginKey, config }, msg: 'ok' };
    }

    return { code: 400, msg: 'Invalid plugin config request' };
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

  ipcMain.handle('file:upload', async (_event, data: { filePath: string; parentId?: number; repoKey?: string }) => {
    const fileApi = getFileApi();
    try {
      // Read file from local path
      const fileBuffer = await fs.readFile(data.filePath);
      const fileName = data.filePath.split(/[\\/]/).pop() || 'unknown';

      // Create a File-like object for the API
      const file = new File([fileBuffer], fileName);

      const result = await fileApi.uploadFile(file, {
        parentId: data.parentId,
        repoKey: data.repoKey,
      });
      return { data: result };
    } catch (error) {
      console.error('Failed to upload file:', error);
      return { data: null, error: (error as Error).message };
    }
  });

  ipcMain.handle('file:getRootFolder', async () => {
    const fileApi = getFileApi();
    try {
      const rootFolder = await fileApi.getRootFolder();
      return { data: rootFolder };
    } catch (error) {
      console.error('Failed to get root folder:', error);
      return { data: null };
    }
  });

  ipcMain.handle('file:getChildren', async (_event, parentId: string, repoKey?: string) => {
    const fileApi = getFileApi();
    try {
      const children = await fileApi.getFolderChildren({
        parentId: parentId ? parseInt(parentId) : undefined,
        repoKey,
      });
      return { data: children };
    } catch (error) {
      console.error('Failed to get folder children:', error);
      return { data: [] };
    }
  });

  ipcMain.handle('file:createFolder', async (_event, data: { name: string; parentId?: number; repoKey?: string }) => {
    const fileApi = getFileApi();
    try {
      await fileApi.createFile({
        name: data.name,
        type: 'folder',
        parentId: data.parentId,
        repoKey: data.repoKey,
      });
      return { success: true };
    } catch (error) {
      console.error('Failed to create folder:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('file:download', async (_event, id: string) => {
    const fileApi = getFileApi();
    try {
      // Show save dialog to get destination path
      const result = await dialog.showSaveDialog({
        title: 'Save File',
        defaultPath: app.getPath('downloads'),
      });

      if (result.canceled || !result.filePath) {
        return { data: null, canceled: true };
      }

      await fileApi.downloadFile(parseInt(id), result.filePath);
      return { data: { path: result.filePath } };
    } catch (error) {
      console.error('Failed to download file:', error);
      return { data: null, error: (error as Error).message };
    }
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

  // ==================== System/Desktop Handlers ====================

  ipcMain.handle('system:getAppInfo', async () => {
    return {
      version: app.getVersion(),
      name: app.getName(),
      platform: process.platform,
      arch: process.arch,
      userDataPath: app.getPath('userData'),
      locale: app.getLocale(),
    };
  });

  ipcMain.handle('system:getPaths', async () => {
    return {
      userData: app.getPath('userData'),
      downloads: app.getPath('downloads'),
      documents: app.getPath('documents'),
      desktop: app.getPath('desktop'),
      temp: app.getPath('temp'),
    };
  });

  ipcMain.handle('dialog:openFile', async (_event, options?: {
    title?: string;
    filters?: { name: string; extensions: string[] }[];
    multiSelections?: boolean;
  }) => {
    const result = await dialog.showOpenDialog({
      title: options?.title || 'Select File',
      filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }],
      properties: options?.multiSelections
        ? ['openFile', 'multiSelections']
        : ['openFile'],
    });

    if (result.canceled) {
      return { canceled: true, filePaths: [] };
    }
    return { canceled: false, filePaths: result.filePaths };
  });

  ipcMain.handle('dialog:openFolder', async (_event, options?: {
    title?: string;
  }) => {
    const result = await dialog.showOpenDialog({
      title: options?.title || 'Select Folder',
      properties: ['openDirectory'],
    });

    if (result.canceled) {
      return { canceled: true, folderPath: null };
    }
    return { canceled: false, folderPath: result.filePaths[0] };
  });

  ipcMain.handle('dialog:saveFile', async (_event, options?: {
    title?: string;
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }) => {
    const result = await dialog.showSaveDialog({
      title: options?.title || 'Save File',
      defaultPath: options?.defaultPath || app.getPath('downloads'),
      filters: options?.filters || [{ name: 'All Files', extensions: ['*'] }],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true, filePath: null };
    }
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle('dialog:showMessage', async (_event, options: {
    type?: 'none' | 'info' | 'error' | 'question' | 'warning';
    title?: string;
    message: string;
    detail?: string;
    buttons?: string[];
  }) => {
    const result = await dialog.showMessageBox({
      type: options.type || 'info',
      title: options.title || '',
      message: options.message,
      detail: options.detail,
      buttons: options.buttons || ['OK'],
    });

    return { response: result.response };
  });

  ipcMain.handle('fs:readFile', async (_event, filePath: string, encoding?: BufferEncoding) => {
    try {
      const content = await fs.readFile(filePath, encoding || 'utf-8');
      return { data: content };
    } catch (error) {
      console.error('Failed to read file:', error);
      return { data: null, error: (error as Error).message };
    }
  });

  ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string | Buffer, encoding?: BufferEncoding) => {
    try {
      await fs.writeFile(filePath, content, encoding || 'utf-8');
      return { success: true };
    } catch (error) {
      console.error('Failed to write file:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('fs:exists', async (_event, filePath: string) => {
    return fs.pathExists(filePath);
  });

  ipcMain.handle('fs:mkdir', async (_event, dirPath: string) => {
    try {
      await fs.ensureDir(dirPath);
      return { success: true };
    } catch (error) {
      console.error('Failed to create directory:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('fs:remove', async (_event, path: string) => {
    try {
      await fs.remove(path);
      return { success: true };
    } catch (error) {
      console.error('Failed to remove path:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('fs:readdir', async (_event, dirPath: string) => {
    try {
      const files = await fs.readdir(dirPath, { withFileTypes: true });
      return {
        data: files.map(f => ({
          name: f.name,
          isDirectory: f.isDirectory(),
          isFile: f.isFile(),
        })),
      };
    } catch (error) {
      console.error('Failed to read directory:', error);
      return { data: [], error: (error as Error).message };
    }
  });

  ipcMain.handle('fs:stat', async (_event, filePath: string) => {
    try {
      const stat = await fs.stat(filePath);
      return {
        data: {
          size: stat.size,
          isDirectory: stat.isDirectory(),
          isFile: stat.isFile(),
          createdAt: stat.birthtime.getTime(),
          modifiedAt: stat.mtime.getTime(),
        },
      };
    } catch (error) {
      console.error('Failed to get file stats:', error);
      return { data: null, error: (error as Error).message };
    }
  });

  ipcMain.handle('fs:copy', async (_event, src: string, dest: string) => {
    try {
      await fs.copy(src, dest);
      return { success: true };
    } catch (error) {
      console.error('Failed to copy:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('fs:move', async (_event, src: string, dest: string) => {
    try {
      await fs.move(src, dest);
      return { success: true };
    } catch (error) {
      console.error('Failed to move:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  console.log('IPC handlers setup complete');
}
