import { ipcMain, dialog, app } from 'electron';
import * as fs from 'fs-extra';

/**
 * Setup IPC handlers.
 *
 * The desktop app no longer persists data locally — all business data goes
 * through the cloud HTTP API straight from the renderer (see use-api.tsx).
 * Only desktop-native capabilities (system info, native dialogs, raw file
 * system) remain here.
 */
export function setupIpcHandlers() {
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

  // ==================== Dialog Handlers ====================

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

  // ==================== FileSystem Handlers ====================

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
