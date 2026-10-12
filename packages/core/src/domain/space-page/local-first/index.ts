/**
 * Local-first runtime: the `SpacePageService` the app registers plus the sync
 * engine that keeps the local database converged with the cloud.
 *
 * `createLocalFirstRuntime` is the only entry point `@kn/core`'s app shell
 * needs: it wires the service's "I queued something" hint to the engine's
 * debounced flush, so an edit made in the UI is pushed as soon as the network
 * allows without the UI ever waiting for it.
 */

import type { SpacePageLocalStore, SpacePageService } from "@kn/common";
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
    /** Start the periodic/online-driven sync. Safe to call after login. */
    start(): void;
    stop(): void;
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

    return {
        service,
        sync: engine,
        start: () => engine?.start(),
        stop: () => engine?.stop(),
    };
};

export type { LocalFirstSyncEngine, LocalFirstSyncState };
