/** PoC Electron main: a real desktop host window loading the shell from an HTTP
 *  origin, with a fixed-capability bridge — mirrors apps/desktop's contract. */
import { app, BrowserWindow, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

ipcMain.handle('desktop:fs.writeFile', async (_e, { path, content }) => {
  await writeFile(path, content, 'utf8')
  return true
})
ipcMain.handle('desktop:fs.readFile', async (_e, { path }) => {
  return await readFile(path, 'utf8')
})

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 900,
    height: 600,
    show: true,
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  })

  const done = (code) => {
    setTimeout(() => app.exit(code), 300)
  }

  win.webContents.on('console-message', (_e, level, message) => {
    console.log('[renderer] ' + message)
    if (message.startsWith('POC_RESULT')) done(0)
    if (message.startsWith('POC_ERROR')) done(1)
  })

  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[main] did-fail-load', code, desc)
    done(2)
  })

  win.loadURL('http://localhost:4199/')
  setTimeout(() => {
    console.error('[main] TIMEOUT')
    done(3)
  }, 25000)
})

app.on('window-all-closed', () => app.quit())
