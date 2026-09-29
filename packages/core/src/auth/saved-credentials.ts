/**
 * Remembered login credentials (desktop only).
 *
 * The password is NEVER stored by the renderer. This module is a thin client
 * over the Electron main process, where `safeStorage` encrypts it with the OS
 * keychain and keeps the ciphertext in the app's userData directory (see
 * apps/desktop/src/main/credentials.ts).
 *
 * On the web there is no OS keychain to bind the secret to, so the whole
 * feature is unavailable there: `isCredentialStorageAvailable()` resolves
 * false and callers fall back to remembering only the account name in
 * `localStorage` (not a secret).
 */

import { resolveOptionalService } from "@kn/common"

/** Credentials the user asked the desktop app to remember between launches. */
export interface SavedCredentials {
    /** Login account (email / username). Not a secret. */
    account: string
    /** Decrypted password, or `''` when only the account was remembered. */
    password: string
    /** Sign in automatically when the login page mounts. */
    autoLogin: boolean
    /** Epoch ms of the last write; absent when nothing has been saved yet. */
    updatedAt?: number
}

export interface SaveCredentialsInput {
    account: string
    password?: string
    autoLogin?: boolean
}

/**
 * Remembered account name, mirrored in `localStorage`.
 *
 * This is deliberately NOT a secret: it is what lets the login form recognize
 * the returning user on the web build too, where no password can be stored.
 * The login page only writes it when the user asked to be remembered, and every
 * logout path removes it (see `signOut()` in @kn/common).
 */
const REMEMBERED_ACCOUNT_KEY = 'knowledge-remembered-account'

const getDesktop = () => resolveOptionalService('desktop')

/** Cheap, synchronous guard: is this a desktop build that ships the capability? */
export const hasCredentialStorage = (): boolean =>
    getDesktop()?.has('credentials.available') === true

let availabilityPromise: Promise<boolean> | undefined

/**
 * Whether passwords can actually be encrypted on this machine (OS keychain
 * reachable). The answer is cached for the session — a keyring does not appear
 * and disappear while the app runs.
 *
 * A negative answer caused by a transient failure (the IPC threw, or the
 * desktop service was not registered yet) is NOT cached, so the caller can ask
 * again instead of losing the feature until restart.
 */
export function isCredentialStorageAvailable(): Promise<boolean> {
    if (!availabilityPromise) {
        availabilityPromise = (async () => {
            const desktop = getDesktop()
            if (!desktop?.has('credentials.available')) return false
            try {
                return Boolean(await desktop.invoke('credentials.available'))
            } catch {
                return false
            }
        })().then((available) => {
            if (!available) availabilityPromise = undefined
            return available
        })
    }
    return availabilityPromise
}

/** Read the remembered credentials, or null when nothing is stored. */
export async function loadSavedCredentials(): Promise<SavedCredentials | null> {
    const desktop = getDesktop()
    if (!desktop?.has('credentials.load')) return null
    try {
        return await desktop.invoke('credentials.load')
    } catch {
        return null
    }
}

/**
 * Persist the credentials after a successful login.
 *
 * **Precondition**: the caller must have verified `isCredentialStorageAvailable()`.
 * With no password the account name alone is stored so the form can be
 * pre-filled; the password itself is only ever handed to the OS keychain.
 */
export async function saveCredentials(input: SaveCredentialsInput): Promise<void> {
    const account = input.account.trim()
    if (!account) return
    const desktop = getDesktop()
    if (!desktop?.has('credentials.save')) return
    const rememberPassword = typeof input.password === 'string' && input.password.length > 0
    try {
        await desktop.invoke('credentials.save', {
            account,
            password: rememberPassword ? input.password : '',
            autoLogin: rememberPassword && input.autoLogin === true,
        })
    } catch {
        // Remembering credentials is a convenience: never fail the login over it.
    }
}

/** Forget the stored password/credentials (desktop keychain entry). */
export async function clearSavedCredentials(): Promise<void> {
    const desktop = getDesktop()
    if (!desktop?.has('credentials.clear')) return
    try {
        await desktop.invoke('credentials.clear')
    } catch {
        // ignore
    }
}

// ---------------------------------------------------------------------------
// Account name only (not a secret — lets the form recognize the user)
// ---------------------------------------------------------------------------

export function getRememberedAccount(): string {
    if (typeof localStorage === 'undefined') return ''
    try {
        return localStorage.getItem(REMEMBERED_ACCOUNT_KEY) || ''
    } catch {
        return ''
    }
}

export function saveRememberedAccount(account: string): void {
    if (typeof localStorage === 'undefined') return
    try {
        const value = account.trim()
        if (value) localStorage.setItem(REMEMBERED_ACCOUNT_KEY, value)
        else localStorage.removeItem(REMEMBERED_ACCOUNT_KEY)
    } catch {
        // Storage can be unavailable in privacy-restricted browser contexts.
    }
}

/** Drop the remembered account name (logout, or "remember me" unchecked). */
export function forgetRememberedAccount(): void {
    saveRememberedAccount('')
}
