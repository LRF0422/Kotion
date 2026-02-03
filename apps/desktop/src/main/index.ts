import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { initializeServices } from './services';
import { setupIpcHandlers } from './ipc';

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null = null;

// Disable GPU acceleration for better compatibility
app.disableHardwareAcceleration();

// Handle creating/removing shortcuts on Windows when installing/uninstalling
if (require('electron-squirrel-startup')) {
  app.quit();
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Load the index.html
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  try {
    // Initialize services (database, auth, storage, etc.)
    await initializeServices(app);
    
    // Setup IPC handlers
    setupIpcHandlers();
    
    // Create main window
    createWindow();

    app.on('activate', () => {
      // On macOS re-create window when dock icon is clicked
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    console.error('Failed to initialize app:', error);
    app.quit();
  }
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app shutdown
app.on('before-quit', async () => {
  // Cleanup services
  const { cleanupServices } = await import('./services');
  await cleanupServices();
});
