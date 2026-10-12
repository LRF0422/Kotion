/**
 * Local-first runtime: the `SpacePageService` the app registers plus the sync
 * engine that keeps the local database converged with the cloud.
 *
 * `createLocalFirstRuntime` is the only entry point `@kn/core`'s app shell
 * needs: it wires the service's "I queued something" hint to the engine's
 * debounced flush, and it owns the one piece of session bookkeeping the cache
 * cannot do on its own — the database is per installation, not per account, so
 * a changed session (different user, different organization) must not be served
 * the previous one's spaces and pages.
 */

import { getAccessToken, type SpacePageLocalStore, type SpacePageService } from "@kn/common";
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

export interface LocalFirstRuntimeOptions {
    local: SpacePageLocalStore;
    /** The cloud-backed service (the pre-local-first `createSpacePageService()`). */
    remote: SpacePageService;
    now?: () => number;
    isOnline?: () => boolean;
    /** Defaults to "an access token exists" so sync waits for login. */
    hasSession?: () => boolean;
    clientId?: string;
    intervalMs?: number;
    debounceMs?: number;
    onDiagnostic?: (event: LocalFirstDiagnostic) => void;
}

export interface LocalFirstRuntime {
    /** Register this as the `spacePageService` core service. */
    readonly service: LocalFirstSpacePageService;
    readonly sync: LocalFirstSyncEngine;
    /** True once the local database proved unusable and the cloud took over. */
    readonly degraded: boolean;
    /** Start the periodic/online-driven sync. Safe to call before login. */
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

    const service = createLocalFirstSpacePageService({
        local: options.local,
        remote: options.remote,
        ...(options.now ? { now: options.now } : {}),
        ...(options.isOnline ? { isOnline: options.isOnline } : {}),
        ...(options.clientId ? { clientId: options.clientId } : {}),
        ...(options.onDiagnostic ? { onDiagnostic: options.onDiagnostic } : {}),
        // Late-bound: the engine is built after the service it notifies.
        requestFlush: () => engine?.requestFlush(),
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

    const runtime: LocalFirstRuntime = {
        service,
        sync: engine,
        get degraded() {
            return service.degraded;
        },

        start() {
            void (async () => {
                // Clear before the first push: a queue left behind by another
                // account must never be replayed with this account's token.
                await runtime.resetForSession().catch(() => false);
                engine?.start();
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
                return true;
            } catch {
                // An unusable store has nothing to protect; the degraded path in
                // the service serves the cloud directly.
                return false;
            }
        },
    };

    return runtime;
};

export type { LocalFirstSyncEngine, LocalFirstSyncState };
