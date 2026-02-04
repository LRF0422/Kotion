import { app, shell, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { pathToFileURL } from 'url'
import { setupIpcHandlers } from './ipc'
import { initializeServices } from './services'

// Register custom scheme before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
])

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: true, // Show immediately
    autoHideMenuBar: true,
    // Use hidden title bar for seamless integration with app UI
    titleBarStyle: 'hiddenInset',
    // Position traffic lights (macOS window controls) with proper spacing
    trafficLightPosition: { x: 16, y: 12 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Open DevTools in development mode
  if (is.dev) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the renderer
  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  console.log('Loading URL:', rendererUrl || 'app://./index.html')

  if (is.dev && rendererUrl) {
    mainWindow.loadURL(rendererUrl)
  } else {
    // Use custom protocol for production
    mainWindow.loadURL('app://./index.html')
  }
}

app.whenReady().then(async () => {
  // Initialize services first
  await initializeServices(app)

  // Setup IPC handlers after services are ready
  setupIpcHandlers()

  // Register custom protocol handler for SPA routing
  protocol.handle('app', (request) => {
    const url = new URL(request.url)
    let filePath = url.pathname

    // For SPA routing: if the path doesn't have an extension, serve index.html
    if (!filePath.includes('.') || filePath === '/') {
      filePath = '/index.html'
    }

    const fullPath = join(__dirname, '../renderer', filePath)
    return net.fetch(pathToFileURL(fullPath).toString())
  })

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.kn.desktop')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC handlers
  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
