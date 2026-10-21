/**
 * Locally remembered sign-in timestamps.
 *
 * The backend user record has no login date (neither `GET /me` nor the login
 * response carries one), so the account menu used to display a hard-coded
 * placeholder. Instead of faking it, the renderer records each successful
 * sign-in in the host storage service:
 *
 *   - `…/last-sign-in-at`     start of the current session,
 *   - `…/previous-sign-in-at` start of the session before it ("上次登录").
 *
 * Records are keyed by account, so a shared machine never shows one user's
 * session history inside another user's menu. Both timestamps are cosmetic:
 * every storage failure is swallowed so the login flow can never be blocked by
 * them.
 */

import { appStorageNamespace, resolveStorageScope } from "@kn/common"

const SIGN_IN_NAMESPACE = appStorageNamespace("auth")
const LAST_SIGN_IN_SUFFIX = "last-sign-in-at"
const PREVIOUS_SIGN_IN_SUFFIX = "previous-sign-in-at"

export interface SignInHistory {
    /** Start of the most recent successful sign-in. */
    lastSignInAt?: number
    /** Start of the sign-in before that, when there is one. */
    previousSignInAt?: number
}

const asTimestamp = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined

const accountPrefix = (account: string | undefined): string | undefined => {
    const normalized = account?.trim().toLowerCase()
    if (!normalized) return undefined
    return `sign-in/${encodeURIComponent(normalized)}`
}

const readWithAccount = async (account: string | undefined): Promise<SignInHistory> => {
    const prefix = accountPrefix(account)
    if (!prefix) return {}
    try {
        const scope = resolveStorageScope(SIGN_IN_NAMESPACE)
        if (!scope) return {}
        const [lastEntry, previousEntry] = await Promise.all([
            scope.get(`${prefix}/${LAST_SIGN_IN_SUFFIX}`),
            scope.get(`${prefix}/${PREVIOUS_SIGN_IN_SUFFIX}`),
        ])
        return {
            lastSignInAt: asTimestamp(lastEntry?.value),
            previousSignInAt: asTimestamp(previousEntry?.value),
        }
    } catch {
        return {}
    }
}

/**
 * Read the remembered timestamps for an account.
 *
 * Several identifiers can point at the same user (the login form accepts a
 * username or an email, while `GET /me` exposes a canonical account), so the
 * caller may pass every candidate; the first one with a record wins.
 */
export const readSignInHistory = async (accounts?: string | Array<string | undefined>): Promise<SignInHistory> => {
    const candidates = Array.isArray(accounts) ? accounts : [accounts]
    for (const account of candidates) {
        const history = await readWithAccount(account)
        if (history.lastSignInAt || history.previousSignInAt) return history
    }
    return {}
}

/**
 * Record one successful sign-in (called by every login screen). The timestamp
 * of the session being replaced becomes “上次登录”, and `now` starts the
 * current session.
 */
export const recordSignIn = async (account: string | undefined, now: number = Date.now()): Promise<void> => {
    const prefix = accountPrefix(account)
    if (!prefix) return
    try {
        const scope = resolveStorageScope(SIGN_IN_NAMESPACE)
        if (!scope) return
        const lastKey = `${prefix}/${LAST_SIGN_IN_SUFFIX}`
        const previousKey = `${prefix}/${PREVIOUS_SIGN_IN_SUFFIX}`
        const lastEntry = await scope.get(lastKey)
        const last = asTimestamp(lastEntry?.value)
        if (last) await scope.set(previousKey, last)
        await scope.set(lastKey, now)
    } catch {
        // Cosmetic only: never block or fail the sign-in flow.
    }
}
