import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
    ping: (): void => ipcRenderer.send('ping'),
    invoke: (channel: string, ...args: any[]): Promise<any> => ipcRenderer.invoke(channel, ...args),
    send: (channel: string, ...args: any[]): void => ipcRenderer.send(channel, ...args),
    on: (channel: string, callback: (...args: any[]) => void): void => {
        ipcRenderer.on(channel, (_event, ...args) => callback(...args))
    }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled
if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld('electron', electronAPI)
        contextBridge.exposeInMainWorld('api', api)
    } catch (error) {
        console.error(error)
    }
} else {
    // @ts-ignore (define in dts)
    window.electron = electronAPI
    // @ts-ignore (define in dts)
    window.api = api
}
