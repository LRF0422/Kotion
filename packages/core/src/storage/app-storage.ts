/**
 * Builds the host's storage service.
 *
 * Desktop and web have different rules on purpose:
 *
 *   - **Desktop** is SQLite or session memory. There is deliberately no
 *     `localStorage` step: the storage service exists for plugins' data, and
 *     silently moving it to an evictable, origin-scoped store is worse than
 *     telling the truth. If the main process reports `STORAGE_UNAVAILABLE`
 *     (corrupt/unopenable database), the resilient wrapper switches to memory
 *     for the rest of the session and `durable` becomes `false`.
 *   - **Web** keeps `localStorage`, then memory. There is no database there.
 *
 * The service is always returned — a host that cannot store anything still gets
 * a working (non-durable) service, so callers never have to null-check the hot
 * path. `engine`/`durable`, and `info()` for details, make the degradation
 * visible where it matters.
 */

import {
    createLocalStorageService,
    createMemoryStorage,
    createResilientStorage,
    isLocalStorageAvailable,
    logger,
    type DesktopBridge,
    type StorageService,
} from '@kn/common'

export function createAppStorage(desktop?: DesktopBridge): StorageService {
    if (desktop) {
        const bridged = desktop.storage
        if (!bridged) {
            // A desktop build whose preload predates the capability, or a host
            // that failed to register the handlers. Keep the app usable for one
            // session, but never pretend the data is durable.
            logger.error(
                'storage: this desktop build exposes no storage.* capability — data will not survive a restart',
            )
            return createMemoryStorage()
        }

        const storage = createResilientStorage(bridged, createMemoryStorage(), {
            onDegrade: (error) => logger.error('storage: SQLite is unavailable, continuing with session memory', error),
        })
        // Open the app database once so a broken data directory degrades before
        // the first real write. Deliberately a read in `app.*`: asking for
        // `info()` would open every plugin database (and reset any file written
        // by a newer build) just because the app started.
        void storage.get('app.migration', '__healthcheck__').catch(() => undefined)
        return storage
    }

    if (isElectronRenderer()) {
        // We are in Electron but the preload bridge is missing (a broken build).
        // Treat it like a desktop with no storage: session memory, never
        // `localStorage`. The rule is per-runtime, not per-parameter.
        logger.error('storage: Electron renderer without the desktop bridge — data will not survive a restart')
        return createMemoryStorage()
    }

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

/**
 * True inside an Electron renderer, even when the preload bridge did not load.
 *
 * `desktop` being `undefined` is not proof of "web": a broken preload produces
 * the same value. Since the storage rule inverts on that fact, detect the
 * runtime too (sandboxed preloads still expose both signals).
 */
function isElectronRenderer(): boolean {
    try {
        const version = (globalThis as { process?: { versions?: { electron?: string } } }).process?.versions?.electron
        if (version) return true
        return typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)
    } catch {
        return false
    }
}
