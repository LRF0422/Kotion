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
  'capture.selectRegion',
  'capture.region.context',
  'capture.region.submit',
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
  'window.toggleDevTools',
  'app.quit',
  // Plugin development (plugin-studio). These validate every path in the main
  // process against the same fs allowlist as the fs.* capabilities, and the
  // only process they can start is the bundled plugin dev-server.
  'dev.start',
  'dev.stop',
  'dev.build',
  'dev.status',
  'dev.logs',
  'dev.scaffold',
  'dev.list',
  'dev.readFile',
  'dev.writeFile',
  // Read-only reference for the agent: the standard host packages' source.
  'dev.hostApi',
  // Project file discovery (list/search) for the agent.
  'dev.files',
  // Install third-party npm packages into a plugin project.
  'dev.installDependencies',
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
