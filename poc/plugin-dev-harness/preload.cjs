const { contextBridge, ipcRenderer } = require('electron')

const CAPABILITIES = ['fs.readFile', 'fs.writeFile']

contextBridge.exposeInMainWorld('knDesktop', {
  platform: process.platform,
  capabilities: CAPABILITIES,
  invoke: (capability, params) => {
    if (!CAPABILITIES.includes(capability)) {
      return Promise.reject(new Error('unauthorized capability: ' + capability))
    }
    return ipcRenderer.invoke('desktop:' + capability, params)
  },
})
