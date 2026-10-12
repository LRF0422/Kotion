/**
 * Sync control surface for the local-first desktop database.
 *
 * Desktop stores everything locally: the SQLite repository is the source of
 * truth, the app is fully usable with no account and no network, and cloud sync
 * is an **opt-in capability** on top of it (the natural gate being a paid plan /
 * membership). This module is the contract between the part that owns the
 * database (`@kn/core`'s local-first runtime) and any UI that wants to show or
 * change that state (settings, diagnostics, status bar).
 *
 * It deliberately exposes no data operations: reading and writing stays on
 * `SpacePageService`, which is local-only until sync is enabled.
 */

/**
 * Why cloud sync cannot be turned on. Stable codes; the UI owns the wording.
 *
 * - `no-session` — nobody is signed in.
 * - `policy`     — the gate refused (e.g. the plan does not include syncing).
 * - `unavailable`— the local database could not be opened, so there is nothing
 *                  to sync and the cloud is serving the app directly.
 */
export type LocalFirstSyncBlockedReason = "no-session" | "policy" | "unavailable";

export interface LocalFirstSyncStatus {
    /** Whether the background sync engine is allowed to run. */
    syncEnabled: boolean;
    /** Why it cannot be enabled right now; absent when it can. */
    syncBlockedReason?: LocalFirstSyncBlockedReason;
    /** True when the local database proved unusable and the cloud took over. */
    degraded: boolean;
    /** `navigator.onLine` as the last sync observed it. */
    online: boolean;
    /** Queued mutations, including the one currently being pushed. */
    pending: number;
    /** Mutations the cloud rejected permanently; `retryFailed()` replays them. */
    failed: number;
    lastSyncAt: number | null;
    lastError: string | null;
    /** Local database descriptor; `engine: "unavailable"` means degraded. */
    engine: string;
    durable: boolean;
    location?: string;
    spaces: number;
    pages: number;
    blocks: number;
    documents: number;
}

/**
 * Whether this session may sync at all.
 *
 * - `true` — allowed.
 * - `false` — refused, with the reason shown to the user.
 * - `undefined` — not known yet (entitlements still loading). The runtime keeps
 *   whatever the user had chosen instead of silently switching sync off.
 */
export type LocalFirstSyncPolicy = () => boolean | undefined | Promise<boolean | undefined>;

export interface LocalFirstSyncEnableResult {
    enabled: boolean;
    /** Present when `enabled` is false. */
    reason?: LocalFirstSyncBlockedReason;
    /** The status right after the attempt. */
    status: LocalFirstSyncStatus;
}

export interface LocalFirstSyncControl {
    /** Snapshot for the settings panel / status bar. */
    status(): Promise<LocalFirstSyncStatus>;
    /** Turn cloud sync on (requires a session and a policy that allows it). */
    enable(): Promise<LocalFirstSyncEnableResult>;
    /** Turn cloud sync off; the local database keeps working and the queue is kept. */
    disable(): Promise<void>;
    /** Replace the gate (e.g. "paid plan" or "any signed-in account"). */
    setSyncPolicy(policy: LocalFirstSyncPolicy): void;
    /** Push then pull now; resolves once the attempt finished. */
    syncNow(): Promise<LocalFirstSyncStatus>;
    /** Put permanently rejected mutations back in the queue and try again. */
    retryFailed(): Promise<number>;
    /** Fires whenever the status changes (toggle, sync run, queue counts). */
    subscribe(listener: (status: LocalFirstSyncStatus) => void): () => void;
}
