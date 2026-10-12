/**
 * Durable key-value storage for the app shell, its plugins and the desktop
 * main process.
 *
 * See `types.ts` for the contract and the semantics every implementation must
 * honour, `kv-engine.ts` for the shared implementation of those semantics, and
 * `memory-storage.ts` / `local-storage.ts` for the two in-renderer backends.
 *
 * The desktop implementation lives in the main process
 * (`apps/desktop/src/main/storage/`) and is reached through the `storage.*`
 * desktop capabilities; `@kn/core` exposes it as the `storage` service.
 */

export * from './types';
export * from './kv-engine';
export * from './memory-storage';
export * from './local-storage';
