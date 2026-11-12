/**
 * The desktop capability contract, split by domain.
 *
 * One module per capability family. Read the module you need instead of the
 * whole contract: `fs.ts`, `dialog.ts`, `http.ts`, `net.ts`, `browser.ts`,
 * `secrets.ts`, `notifications.ts`, `background.ts`, `capture.ts`, `ssh.ts`,
 * `dev.ts`, plus `capabilities.ts` (the name union), `contract.ts` (name →
 * params/result) and `catalog.ts` (agent-facing metadata: summary, guards, call
 * shape, example). Durable-storage payload types live in
 * `@kn/common`'s `src/storage/types.ts` (`StorageService`).
 *
 * `../desktop-bridge.ts` re-exports this directory, so existing imports keep
 * working; new code should import from the domain module it actually needs.
 */

export * from './platform'
export * from './capabilities'
export * from './storage-envelope'
export * from './system'
export * from './dialog'
export * from './fs'
export * from './window'
export * from './credentials'
export * from './capture'
export * from './http'
export * from './net'
export * from './browser'
export * from './secrets'
export * from './notifications'
export * from './background'
export * from './tasks'
export * from './dev'
export * from './ssh'
export * from './contract'
export * from './bridge'
export * from './catalog'
