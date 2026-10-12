/**
 * Builds the host's storage service.
 *
 * Priority: the desktop capability bridge (SQLite in the main process), then
 * `localStorage`, then memory. The service is always returned — a host that
 * cannot store anything still gets a working (non-durable) service, so callers
 * never have to null-check the hot path. `engine`/`durable` on the service, and
 * `info()` for details, make the degradation visible where it matters.
 */

import {
    createLocalStorageService,
    createMemoryStorage,
    isLocalStorageAvailable,
    logger,
    type DesktopBridge,
    type StorageService,
} from '@kn/common'

export function createAppStorage(desktop?: DesktopBridge): StorageService {
    const bridged = desktop?.storage
    if (bridged) return bridged

    if (isLocalStorageAvailable()) {
        try {
            return createLocalStorageService()
        } catch (error) {
            logger.warn('storage: localStorage is unusable, falling back to memory', error)
        }
    }

    logger.warn('storage: no durable backend on this host — data will not survive a reload')
    return createMemoryStorage()
}
