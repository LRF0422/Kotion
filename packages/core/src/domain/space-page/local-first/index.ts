/**
 * Local-first runtime: the `SpacePageService` the app registers plus the sync
 * engine that keeps the local database converged with the cloud.
 *
 * **Desktop is local-only.** The SQLite repository is the source of truth: the
 * app works with no account and no network, and nothing is uploaded until the
 * user turns cloud sync on (the gate being whatever `setSyncPolicy` says — see
 * `LocalFirstSyncControl`). Turning it on later replays the whole queue, so
 * every edit made offline is still delivered.
 *
 * The runtime also owns the one piece of session bookkeeping the cache cannot do
 * on its own: the database is per installation, not per account, so a changed
 * session (different user, different organization) must not be served the
 * previous one's spaces and pages.
 */

import {
    getAccessToken,
    type LocalFirstSyncBlockedReason,
    type LocalFirstSyncControl,
    type LocalFirstSyncEnableResult,
    type LocalFirstSyncPolicy,
    type LocalFirstSyncStatus,
    type SpacePageLocalStore,
    type SpacePageService,
} from "@kn/common";
import {
    createLocalFirstSpacePageService,
    type LocalFirstDiagnostic,
    type LocalFirstSpacePageService,
} from "./service";
import {
    createLocalFirstSyncEngine,
    type LocalFirstSyncEngine,
    type LocalFirstSyncState,
} from "./sync";

export * from "./service";
export * from "./sync";

/** `sync_state` key holding the identity the cached rows belong to. */
const SESSION_KEY = "localFirst.session";
/** `sync_state` key holding the user's sync choice (survives restarts). */
const SYNC_ENABLED_KEY = "localFirst.syncEnabled";

export interface LocalFirstRuntimeOptions {
    local: SpacePageLocalStore;
    /** The cloud-backed service (the pre-local-first `createSpacePageService()`). */
    remote: SpacePageService;
    now?: () => number;
    isOnline?: () => boolean;
    /** Defaults to "an access token exists" so sync waits for login. */
    hasSession?: () => boolean;
    /** Defaults to "allowed": the host may install a membership gate instead. */
    syncPolicy?: LocalFirstSyncPolicy;
    /**
     * Whether syncing starts enabled for a fresh installation. `false` (the
     * default) means the desktop app is purely local until the user opts in.
     */
    syncEnabledByDefault?: boolean;
    clientId?: string;
    intervalMs?: number;
    debounceMs?: number;
    onDiagnostic?: (event: LocalFirstDiagnostic) => void;
}

export interface LocalFirstRuntime extends LocalFirstSyncControl {
    /** Register this as the `spacePageService` core service. */
    readonly service: LocalFirstSpacePageService;
    readonly sync: LocalFirstSyncEngine;
    /** True once the local database proved unusable and the cloud took over. */
    readonly degraded: boolean;
    /** True while the background sync engine is allowed to reach the cloud. */
    isSyncEnabled(): boolean;
    /** Start the runtime: session bookkeeping first, then sync if enabled. */
    start(): void;
    stop(): void;
    /**
     * Drop the cache when the signed-in session changed (logout, another user,
     * another organization). Resolves `true` when it actually cleared.
     */
    resetForSession(): Promise<boolean>;
}

/** Identity of the current sign-in: the token's subject plus its context. */
export function sessionIdentity(token: string | null = getAccessToken()): string {
    if (!token) return "anonymous";
    try {
        const payload = token.split(".")[1];
        if (!payload) return "unknown";
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const claims = JSON.parse(
            decodeURIComponent(
                atob(normalized)
                    .split("")
                    .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
                    .join(""),
            ),
        ) as Record<string, unknown>;
        const subject = claims.sub ?? claims.user_id ?? claims.uid ?? "";
        const context = claims.ctx_id ?? claims.tenant_id ?? "";
        return `${String(subject)}|${String(context)}`;
    } catch {
        return "unknown";
    }
}

export const createLocalFirstRuntime = (options: LocalFirstRuntimeOptions): LocalFirstRuntime => {
    let engine: LocalFirstSyncEngine | undefined;
    let syncEnabled = options.syncEnabledByDefault ?? false;
    let policy: LocalFirstSyncPolicy = options.syncPolicy ?? (() => true);
    const listeners = new Set<(status: LocalFirstSyncStatus) => void>();
    const hasSession = options.hasSession ?? (() => Boolean(getAccessToken()));

    const service = createLocalFirstSpacePageService({
        local: options.local,
        remote: options.remote,
        ...(options.now ? { now: options.now } : {}),
        ...(options.isOnline ? { isOnline: options.isOnline } : {}),
        ...(options.clientId ? { clientId: options.clientId } : {}),
        ...(options.onDiagnostic ? { onDiagnostic: options.onDiagnostic } : {}),
        // Local-only until the user turns cloud sync on.
        isSyncEnabled: () => syncEnabled,
        // Late-bound: the engine is built after the service it notifies.
        requestFlush: () => {
            if (syncEnabled) engine?.requestFlush();
        },
    });

    engine = createLocalFirstSyncEngine({
        local: options.local,
        remote: options.remote,
        ...(options.now ? { now: options.now } : {}),
        ...(options.isOnline ? { isOnline: options.isOnline } : {}),
        ...(options.hasSession ? { hasSession: options.hasSession } : {}),
        ...(options.intervalMs === undefined ? {} : { intervalMs: options.intervalMs }),
        ...(options.debounceMs === undefined ? {} : { debounceMs: options.debounceMs }),
        ...(options.onDiagnostic ? { onDiagnostic: options.onDiagnostic } : {}),
    });

    /** `undefined` = the gate does not know yet (entitlements still loading). */
    const policyAllows = async (): Promise<boolean | undefined> => {
        try {
            return await policy();
        } catch {
            // A throwing gate (e.g. an unloaded entitlement store) means "unknown",
            // never "denied": sync must not silently switch itself off.
            return undefined;
        }
    };

    const blockedReason = async (): Promise<LocalFirstSyncBlockedReason | undefined> => {
        if (service.degraded) return "unavailable";
        if (!hasSession()) return "no-session";
        const allowed = await policyAllows();
        if (allowed === false) return "policy";
        return undefined;
    };

    const persist = async (enabled: boolean): Promise<void> => {
        try {
            await options.local.setState(SYNC_ENABLED_KEY, enabled);
        } catch {
            // The choice still applies for this run; only persistence failed.
        }
    };

    const notify = (): void => {
        void runtime.status().then((status) => {
            for (const listener of listeners) {
                try {
                    listener(status);
                } catch {
                    // A misbehaving listener must not break the runtime.
                }
            }
        });
    };

    const runtime: LocalFirstRuntime = {
        service,
        sync: engine,
        get degraded() {
            return service.degraded;
        },
        isSyncEnabled: () => syncEnabled,

        start() {
            void (async () => {
                // Clear before the first push: a queue left behind by another
                // account must never be replayed with this account's token.
                await runtime.resetForSession().catch(() => false);
                try {
                    const stored = await options.local.getState<boolean>(SYNC_ENABLED_KEY);
                    syncEnabled = stored ?? (options.syncEnabledByDefault ?? false);
                } catch {
                    // Unusable store: the degraded path serves the cloud anyway.
                    syncEnabled = false;
                }
                if (syncEnabled) {
                    const allowed = await policyAllows();
                    if (allowed === false || (await blockedReason()) === "no-session") {
                        // The plan lapsed (or the session ended) since last run.
                        syncEnabled = false;
                        await persist(false);
                    }
                }
                if (syncEnabled) engine?.start();
                notify();
            })();
        },

        stop() {
            engine?.stop();
        },

        async resetForSession() {
            const identity = sessionIdentity();
            try {
                const stored = await options.local.getState<string>(SESSION_KEY);
                if (stored === identity) return false;
                await options.local.clear();
                await options.local.setState(SESSION_KEY, identity);
                // `clear()` dropped the stored choice with everything else.
                await persist(syncEnabled);
                return true;
            } catch {
                // An unusable store has nothing to protect; the degraded path in
                // the service serves the cloud directly.
                return false;
            }
        },

        setSyncPolicy(next: LocalFirstSyncPolicy) {
            policy = next;
            notify();
        },

        async status(): Promise<LocalFirstSyncStatus> {
            const engineState: LocalFirstSyncState = engine.state();
            let info;
            try {
                info = await service.info();
            } catch {
                info = undefined;
            }
            const reason = syncEnabled ? undefined : await blockedReason();
            return {
                syncEnabled,
                ...(reason ? { syncBlockedReason: reason } : {}),
                degraded: service.degraded,
                online: engineState.online,
                pending: engineState.pending,
                failed: engineState.failed,
                lastSyncAt: engineState.lastSyncAt,
                lastError: engineState.lastError,
                engine: info?.engine ?? "unavailable",
                durable: info?.durable ?? false,
                ...(info?.location ? { location: info.location } : {}),
                spaces: info?.spaces ?? 0,
                pages: info?.pages ?? 0,
                blocks: info?.blocks ?? 0,
                documents: info?.documents ?? 0,
            };
        },

        async enable(): Promise<LocalFirstSyncEnableResult> {
            const reason = await blockedReason();
            if (reason) return { enabled: false, reason, status: await runtime.status() };
            syncEnabled = true;
            await persist(true);
            engine?.start();
            notify();
            // A first sync is what makes the feature feel real, but the user's
            // click must not wait on the network.
            void engine.syncNow().then(notify);
            return { enabled: true, status: await runtime.status() };
        },

        async disable(): Promise<void> {
            syncEnabled = false;
            await persist(false);
            engine?.stop();
            notify();
        },

        async syncNow(): Promise<LocalFirstSyncStatus> {
            if (!syncEnabled) return runtime.status();
            await engine.syncNow();
            notify();
            return runtime.status();
        },

        async retryFailed(): Promise<number> {
            const count = await engine.retryFailed();
            notify();
            return count;
        },

        subscribe(listener: (status: LocalFirstSyncStatus) => void): () => void {
            listeners.add(listener);
            const unsubscribeEngine = engine.subscribe(() => notify());
            // Seed the listener so a panel renders the real state immediately.
            void runtime.status().then((status) => {
                try {
                    listener(status);
                } catch {
                    // Ignore listener errors.
                }
            });
            return () => {
                listeners.delete(listener);
                unsubscribeEngine();
            };
        },
    };

    return runtime;
};

export type { LocalFirstSyncEngine, LocalFirstSyncState };
