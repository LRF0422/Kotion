/* ------------------------------------------------------------------ *
 * Remembered login credentials
 *
 * The password is encrypted by Electron's `safeStorage`, which is backed by
 * the OS keychain (macOS Keychain / Windows DPAPI / Linux keyring), and only
 * the ciphertext is written to the app's userData directory. The plaintext
 * never reaches disk and never leaves the device.
 *
 * This is an at-rest guarantee, not a renderer-isolation boundary: callers of
 * `credentials.load` receive the plaintext password, so treat the capability
 * as available to the app shell as a whole (the desktop app also runs
 * remote-fetched plugin bundles in that shell).
 * ------------------------------------------------------------------ */

/** Credentials the user asked the desktop app to remember between launches. */
export interface DesktopSavedCredentials {
    /** Login account (email / username). Always safe to display. */
    account: string
    /** Decrypted password, or `''` when only the account was remembered. */
    password: string
    /** Whether the login page should sign in automatically on startup. */
    autoLogin: boolean
    /** Epoch ms of the last write; absent when nothing has been saved yet. */
    updatedAt?: number
}

/** What `credentials.save` accepts. */
export interface DesktopSaveCredentialsInput {
    account: string
    /** `''` (or omitted) stores the account only, without a password. */
    password?: string
    autoLogin?: boolean
}
