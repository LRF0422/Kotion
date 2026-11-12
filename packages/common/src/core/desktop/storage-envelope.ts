import type { StorageErrorCode } from '../../storage/types'

/**
 * Storage capabilities answer with an envelope instead of throwing, because
 * Electron flattens a rejected `invoke` into a message string and the
 * `StorageErrorCode` the renderer needs to degrade would be lost.
 */
export type DesktopStorageEnvelope<T> =
    | { ok: true; value: T }
    | { ok: false; code: StorageErrorCode; message: string }

