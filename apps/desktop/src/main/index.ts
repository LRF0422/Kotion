import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { initDatabase } from './db'
import { registerAllIpcHandlers } from './ipc'

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit()
}

let mainWindow: BrowserWindow | null = null

const createWindow = () => {
    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        },
        titleBarStyle: 'hiddenInset',
        show: false
    })

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show()
    })

    // Load the app
    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
        mainWindow.webContents.openDevTools()
    } else {
        mainWindow.loadFile(join(__dirname, '../../dist/index.html'))
    }

    mainWindow.on('closed', () => {
        mainWindow = null
    })
}

// Initialize the app
app.whenReady().then(async () => {
    // Initialize database
    await initDatabase()

    // Register all IPC handlers
    registerAllIpcHandlers()

    // Create the main window
    createWindow()

    app.on('activate', () => {
        // On macOS re-create window when dock icon is clicked
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

// Handle app quit
app.on('before-quit', () => {
    // Cleanup if needed
})

// Export for type checking
export { mainWindow }
