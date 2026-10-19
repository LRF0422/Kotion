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
  // Network policy for http.request: the SSRF guard's user-facing switch. The
  // settings UI reads `net.policy.get` and writes `net.policy.set`; the main
  // process owns the file, so a renderer reset cannot silently widen access.
  'net.policy.get',
  'net.policy.set',
  // Raw TCP / TLS byte streams. The host is a transport, not a protocol client:
  // it opens the connection, moves bytes and reports open/data/close, so a
  // plugin can implement its own wire protocol (IMAP, SMTP, MQTT, …) in JS.
  // Every target passes the network policy and, on first use in this app run, a
  // user confirmation naming the host and port.
  'net.socketOpen',
  'net.socketWrite',
  'net.socketClose',
  'net.socketSessions',
  // System browser + a loopback redirect listener, so a plugin can run an
  // OAuth authorization-code flow without registering a custom URL scheme.
  // `oauthStart` binds 127.0.0.1 and answers with the redirect_uri; `oauthWait`
  // resolves with the callback query (never the body). Only http/https URLs can
  // be opened, and the user confirms the origin once per app run.
  'shell.browserOpen',
  'shell.oauthStart',
  'shell.oauthWait',
  'shell.oauthSessions',
  'shell.oauthCancel',
  // Plugin-scoped encrypted key/value storage: values are sealed with
  // safeStorage (OS keychain) before they touch disk, `list` is metadata only
  // and `secretGet` is the one call that returns plaintext. Namespaces follow
  // `plugin.<key>` / `app.<area>`.
  'storage.secretAvailable',
  'storage.secretSet',
  'storage.secretGet',
  'storage.secretHas',
  'storage.secretList',
  'storage.secretRemove',
  'storage.secretClear',
  'storage.secretNamespaces',
  // OS notifications and the app badge. The click is reported back through the
  // `notification.show` promise (`clicked`), which also focuses the window.
  'notification.available',
  'notification.show',
  'notification.setBadge',
  'notification.clear',
  // Host-driven timers. The main process owns the clock, so a scheduled task
  // keeps ticking while the plugin's panel is closed and wakes the renderer on
  // `desktop:event:background`.
  'background.schedule',
  'background.list',
  'background.cancel',
  'background.cancelAll',
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
  // Remembered login credentials. The password is encrypted at rest with
  // Electron safeStorage (OS keychain) in the main process, so the storage
  // file never holds plaintext. `credentials.load` does hand the decrypted
  // password to the app shell, so plugins must not read it opportunistically.
  'credentials.available',
  'credentials.load',
  'credentials.save',
  'credentials.clear',
  // Durable key-value storage, backed by SQLite in the main process. Answers
  // with a `{ok, value} | {ok, code, message}` envelope so failure codes
  // survive the boundary; the renderer turns them back into StorageError.
  // Callers must stay inside their own namespace (`app.*`, `plugin.<key>.*`).
  'storage.info',
  'storage.get',
  'storage.getMany',
  'storage.set',
  'storage.delete',
  'storage.keys',
  'storage.list',
  'storage.count',
  'storage.clear',
  'storage.batch',
  'storage.namespaces',
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
  // Stop a project's session and delete its files (refuses non-projects).
  'dev.remove',
  // Delete one file inside a project (confined to the project root).
  'dev.deleteFile',
  // SSH. Runs the user's own OpenSSH binaries; the main process checks the
  // network policy and asks the user before the first connection to a host in
  // this app run. No credential is ever passed through these calls — auth is
  // the user's ~/.ssh config and agent.
  'ssh.exec',
  'ssh.put',
  'ssh.get',
  // Which hosts the user has granted for this app run, and how to revoke one.
  'ssh.hosts',
  'ssh.forget',
  // SFTP directory surface (list/stat/mkdir/rename/remove), on the same gate.
  'ssh.sftpList',
  'ssh.sftpStat',
  'ssh.sftpMkdir',
  'ssh.sftpRename',
  'ssh.sftpRemove',
  // Interactive terminal: a remote pty streamed over `desktop:event:ssh`.
  'ssh.shellOpen',
  'ssh.shellWrite',
  'ssh.shellResize',
  'ssh.shellClose',
  'ssh.shells',
  // Stored credentials. `set` takes a secret in; nothing ever returns one out.
  'ssh.credentialsAvailable',
  'ssh.credentialsList',
  'ssh.credentialsSet',
  'ssh.credentialsRemove',
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
