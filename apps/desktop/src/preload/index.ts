import { contextBridge, ipcRenderer } from 'electron'

/**
 * Desktop capability bridge.
 *
 * Exposes a FIXED capability list plus invoke/on instead of raw IPC. There is
 * no generic channel escape hatch: window.api / ipcRenderer are gone.
 *
 * Plugins must not touch this global directly. They consume the `desktop`
 * core service from @kn/common:
 *   const desktop = useOptionalService('desktop')
 *   await desktop?.invoke('system.info')
 */
const CAPABILITIES = [
  'system.info',
  'system.paths',
  'http.request',
  'capture.sources',
  'dialog.openFile',
  'dialog.openFolder',
  'dialog.saveFile',
  'dialog.message',
  'fs.readFile',
  'fs.writeFile',
  'fs.exists',
  'fs.mkdir',
  'fs.remove',
  'fs.readdir',
  'fs.stat',
  'fs.copy',
  'fs.move',
  'window.setFullScreen',
  'window.isFullScreen',
  'window.setTrafficLights',
] as readonly string[]

const knDesktop = {
  platform: process.platform,
  capabilities: CAPABILITIES,
  invoke: (capability: string, params?: unknown): Promise<unknown> => {
    if (!CAPABILITIES.includes(capability)) {
      return Promise.reject(
        new Error('Unknown or unauthorized desktop capability: ' + capability),
      )
    }
    return ipcRenderer.invoke('desktop:' + capability, params)
  },
  on: (event: string, listener: (value: unknown) => void): (() => void) => {
    const channel = 'desktop:event:' + event
    const handler = (_event: unknown, value: unknown) => listener(value)
    ipcRenderer.on(channel, handler)
    return () => {
      ipcRenderer.removeListener(channel, handler)
    }
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('knDesktop', knDesktop)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (declared in index.d.ts)
  window.knDesktop = knDesktop
}
