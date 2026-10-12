/**
 * Background sync for the local-first Space/Page/Block database.
 *
 * Two directions, one loop:
 *
 * - **Push** walks the outbox in id order and replays each queued mutation
 *   through the cloud `SpacePageService`. Entries the cloud rejects permanently
 *   (a 4xx — the change can never succeed as-is) move to `failed` and stay
 *   visible for a retry; a connectivity failure leaves the entry `pending` and
 *   stops the walk, so ordering is never violated.
 * - **Pull** refreshes the cache: the space list, each known space's page tree
 *   and the cross-space recent list. Pulls use `dirty: false`, and the store
 *   refuses to overwrite a row that still has a queued edit, so a pull can never
 *   eat an offline change.
 *
 * Because pushing happens before pulling, a change made offline is uploaded and
 * then read back from the server, which keeps the two sides converged instead of
 * relying on the local copy being right.
 *
 * A page (or space) created while offline carries a `local-…` id. The moment the
 * cloud accepts the create, the engine re-keys the local rows and every queued
 * payload onto the real id (`remapPage`/`remapSpace`) and keeps going, so the
 * rest of the queue is replayed against the id the server knows.
 */

import {
    getAccessToken,
    type ApplyPageOperationsRequest,
    type CreatePageRequest,
    type CreateSpaceRequest,
    type LocalOutboxEntity,
    type LocalOutboxEntry,
    type MovePageRequest,
    type ReconcilePageDocumentRequest,
    type SpacePageLocalStore,
    type SpacePageService,
    type UpdatePageTitleRequest,
    type UpdateSpaceRequest,
} from "@kn/common";
import { flattenTree, isOfflineError, pageTreeSyncedKey, type LocalFirstDiagnostic } from "./service";

export type LocalFirstSyncPhase = "idle" | "pushing" | "pulling" | "error";

export interface LocalFirstSyncState {
    phase: LocalFirstSyncPhase;
    /** Entries still waiting to be pushed. */
    pending: number;
    /** Entries the cloud rejected permanently; surfaced for a manual retry. */
    failed: number;
    lastSyncAt: number | null;
    lastError: string | null;
    online: boolean;
}

export interface LocalFirstSyncOptions {
    local: SpacePageLocalStore;
    remote: SpacePageService;
    now?: () => number;
    isOnline?: () => boolean;
    /** Whether there is a session to sync with; defaults to "an access token exists". */
    hasSession?: () => boolean;
    /** Periodic sync interval. `0` disables the timer (tests drive it manually). */
    intervalMs?: number;
    /** Delay applied to `requestFlush()` so a burst of edits is one sync. */
    debounceMs?: number;
    /** Spaces refreshed per pull, and pages fetched per space. */
    spacePageSize?: number;
    maxSpacesPerPull?: number;
    onDiagnostic?: (event: LocalFirstDiagnostic) => void;
}

export interface LocalFirstSyncEngine {
    start(): void;
    stop(): void;
    /** Schedule a sync soon (after `debounceMs`). Safe to call on every edit. */
    requestFlush(): void;
    /** Push queued mutations now. Resolves with the state afterwards. */
    flushNow(): Promise<LocalFirstSyncState>;
    /** Refresh the cache from the cloud now. */
    pullNow(): Promise<LocalFirstSyncState>;
    /** Push then pull. */
    syncNow(): Promise<LocalFirstSyncState>;
    /** Move every `failed` entry back to `pending` and try again. */
    retryFailed(): Promise<number>;
    subscribe(listener: (state: LocalFirstSyncState) => void): () => void;
    state(): LocalFirstSyncState;
}

const ENTITY_OF: Record<string, LocalOutboxEntity> = {
    "space.create": "space",
    "space.update": "space",
    "space.archive": "space",
    "space.unarchive": "space",
    "space.delete": "space",
    "space.favorite": "space",
    "page.create": "page",
    "page.title": "page",
    "page.move": "page",
    "page.trash": "page",
    "page.restore": "page",
    "page.favorite": "page",
    "page.pin": "page",
    "document.apply": "document",
    "document.reconcile": "document",
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const createLocalFirstSyncEngine = (options: LocalFirstSyncOptions): LocalFirstSyncEngine => {
    const { local, remote } = options;
    const now = options.now ?? (() => Date.now());
    const isOnline =
        options.isOnline ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
    const hasSession = options.hasSession ?? (() => Boolean(getAccessToken()));
    const intervalMs = options.intervalMs ?? 30_000;
    const debounceMs = options.debounceMs ?? 800;
    const spacePageSize = options.spacePageSize ?? 200;
    const maxSpacesPerPull = options.maxSpacesPerPull ?? 50;
    const diagnose = options.onDiagnostic ?? (() => {});

    const listeners = new Set<(state: LocalFirstSyncState) => void>();
    let timer: ReturnType<typeof setInterval> | undefined;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let running: Promise<LocalFirstSyncState> | undefined;
    let rerunRequested = false;
    let stopped = true;
    let state: LocalFirstSyncState = {
        phase: "idle",
        pending: 0,
        failed: 0,
        lastSyncAt: null,
        lastError: null,
        online: isOnline(),
    };

    const publish = (patch: Partial<LocalFirstSyncState>): void => {
        state = { ...state, ...patch };
        for (const listener of listeners) {
            try {
                listener(state);
            } catch {
                // A misbehaving listener must not break the sync loop.
            }
        }
    };

    const refreshCounts = async (): Promise<void> => {
        const [pending, inflight, failed] = await Promise.all([
            local.countOutbox("pending"),
            local.countOutbox("inflight"),
            local.countOutbox("failed"),
        ]);
        // "Pending" from the user's point of view is everything not yet on the
        // server: queued *and* currently being pushed.
        publish({ pending: pending + inflight, failed, online: isOnline() });
    };

    /** Replay one queued entry; returns the id the entity now has upstream. */
    const pushEntry = async (entry: LocalOutboxEntry): Promise<string> => {
        const payload = entry.payload;
        switch (entry.kind) {
            case "space.create": {
                const created = await remote.spaces.createSpace(payload as unknown as CreateSpaceRequest);
                const id = created?.id ? String(created.id) : entry.entityId;
                if (id !== entry.entityId) await local.remapSpace(entry.entityId, id);
                return id;
            }
            case "space.update":
                await remote.spaces.updateSpace(payload as unknown as UpdateSpaceRequest);
                return entry.entityId;
            case "space.archive":
                await remote.spaces.archiveSpace(entry.entityId);
                return entry.entityId;
            case "space.unarchive":
                await remote.spaces.unarchiveSpace(entry.entityId);
                return entry.entityId;
            case "space.delete":
                await remote.spaces.deleteSpace(entry.entityId);
                return entry.entityId;
            case "space.favorite":
                await remote.spaces.toggleSpaceFavorite(entry.entityId);
                return entry.entityId;

            case "page.create": {
                const created = await remote.pages.createPage(payload as unknown as CreatePageRequest);
                const id = created?.id ? String(created.id) : entry.entityId;
                if (id !== entry.entityId) await local.remapPage(entry.entityId, id);
                return id;
            }
            case "page.title":
                await remote.pages.updatePageTitle(payload as unknown as UpdatePageTitleRequest);
                return entry.entityId;
            case "page.move":
                await remote.pages.movePage(payload as unknown as MovePageRequest);
                return entry.entityId;
            case "page.trash":
                await remote.pages.movePageToTrash(entry.entityId);
                return entry.entityId;
            case "page.restore":
                await remote.pages.restorePageFromTrash(entry.entityId);
                return entry.entityId;
            case "page.favorite":
                if (payload.favorite === false) await remote.pages.unfavoritePage(entry.entityId);
                else await remote.pages.favoritePage(entry.entityId);
                return entry.entityId;
            case "page.pin":
                await remote.pages.togglePagePin(
                    String(payload.spaceId ?? ""),
                    entry.entityId,
                );
                return entry.entityId;

            case "document.apply":
                await remote.documents.applyPageOperations(
                    entry.entityId,
                    payload.request as unknown as ApplyPageOperationsRequest,
                );
                return entry.entityId;
            case "document.reconcile":
                await remote.documents.reconcilePageDocument(
                    entry.entityId,
                    payload.request as unknown as ReconcilePageDocumentRequest,
                );
                return entry.entityId;

            default:
                throw new LocalFirstSyncError(`unknown outbox kind "${entry.kind}"`);
        }
    };

    const pushPending = async (): Promise<void> => {
        publish({ phase: "pushing" });
        for (;;) {
            if (!isOnline()) return;
            // Claim instead of read: the entry moves to `inflight`, so a second
            // sync run cannot pick the same mutation up and an edit arriving
            // during the request becomes its own entry instead of overwriting
            // the payload that is already on the wire.
            const [entry] = await local.claimOutbox({ limit: 1 });
            if (!entry) return;
            try {
                const id = await pushEntry(entry);
                // Ack before clearing the dirty flag: if the flag write fails,
                // replaying the (already accepted) entry would be worse than a
                // row that stays dirty until the next pull.
                await local.ackOutbox([entry.id]);
                const stillQueued = await local.listOutbox({ entityId: id, limit: 1 });
                if (!stillQueued.length) {
                    // `dirty` means "has a queued edit". Only the last entry for
                    // the entity may clear it, or a pull would overwrite the
                    // edits that are still waiting their turn.
                    //
                    // A document write also refreshes the page row's identity
                    // (title/icon), because the cloud derives those from the
                    // document: once it is accepted, that row is in step again.
                    await local.markSynced(ENTITY_OF[entry.kind] ?? entry.entity, [id]);
                    if (ENTITY_OF[entry.kind] === "document") await local.markSynced("page", [id]);
                }
                publish({ lastError: null });
            } catch (error) {
                const message = errorMessage(error);
                if (isOfflineError(error)) {
                    // Back to pending and stop the walk: replaying later
                    // preserves the order the user made the edits in.
                    try {
                        await local.retryOutbox([entry.id]);
                    } catch {
                        // The entry stays `inflight`; the next run releases it, and
                        // `retryOutbox()` without ids releases every stuck entry.
                    }
                    publish({ lastError: message, online: false });
                    return;
                }
                await local.failOutbox(entry.id, message);
                publish({ lastError: message });
                diagnose({
                    type: "remote.failed",
                    operation: `outbox.${entry.kind}`,
                    message,
                    offline: false,
                });
            }
        }
    };

    const pullSpaces = async (): Promise<void> => {
        const result = await remote.spaces.querySpaces({ pageSize: spacePageSize });
        await local.upsertSpaces(
            result.records.map((space) => ({
                ...space,
                ...(space.type === "PERSONAL" ? { personal: true } : {}),
                remoteUpdatedAt: null,
                dirty: false,
            })),
        );
        for (const space of result.records.slice(0, maxSpacesPerPull)) {
            const spaceId = String(space.id);
            const tree = await remote.pages.getPageTree({ spaceId });
            const records = flattenTree(tree);
            // The space's tree is now complete in the cache, which is what lets
            // `getPageTree` answer locally instead of re-fetching.
            await local.setState(pageTreeSyncedKey(spaceId), now());
            if (records.length) {
                // Tree nodes are summaries, not full page records: flag them so
                // a later `getPage` refreshes from the cloud instead of trusting them.
                await local.upsertPages(
                    records.map((record) => ({ ...record, remoteUpdatedAt: null, dirty: false, partial: true })),
                );
            }
        }
    };

    const pullRecent = async (): Promise<void> => {
        const recent = await remote.pages.queryRecentPages({ pageSize: 100 });
        if (!recent.records.length) return;
        await local.upsertPages(
            recent.records.map((record) => ({
                ...record,
                remoteUpdatedAt: null,
                dirty: false,
                partial: true,
            })),
        );
    };

    const run = async (): Promise<LocalFirstSyncState> => {
        if (running) {
            rerunRequested = true;
            return running;
        }
        running = (async (): Promise<LocalFirstSyncState> => {
            try {
                if (!isOnline()) {
                    publish({ online: false, phase: "idle" });
                    return state;
                }
                if (!hasSession()) {
                    publish({ online: true, phase: "idle" });
                    return state;
                }
                await pushPending();
                if (isOnline()) {
                    publish({ phase: "pulling" });
                    await pullSpaces();
                    await pullRecent();
                }
                publish({ phase: "idle", lastSyncAt: now(), lastError: state.lastError });
            } catch (error) {
                const message = errorMessage(error);
                const offline = isOfflineError(error);
                publish({ phase: "error", lastError: message, online: !offline });
                if (!offline) {
                    diagnose({ type: "remote.failed", operation: "sync", message, offline: false });
                }
            } finally {
                await refreshCounts().catch(() => {});
                running = undefined;
                if (rerunRequested) {
                    rerunRequested = false;
                    void run();
                }
            }
            return state;
        })();
        return running;
    };

    const engine: LocalFirstSyncEngine = {
        start() {
            if (!stopped) return;
            stopped = false;
            if (intervalMs > 0) {
                timer = setInterval(() => {
                    void run();
                }, intervalMs);
                // A timer must not hold the app's event loop open (Node tests).
                (timer as unknown as { unref?: () => void }).unref?.();
            }
            if (typeof window !== "undefined") {
                window.addEventListener("online", onOnline);
            }
            void run();
        },

        stop() {
            stopped = true;
            if (timer) clearInterval(timer);
            if (debounceTimer) clearTimeout(debounceTimer);
            timer = undefined;
            debounceTimer = undefined;
            if (typeof window !== "undefined") window.removeEventListener("online", onOnline);
        },

        requestFlush() {
            if (stopped) return;
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                debounceTimer = undefined;
                void run();
            }, debounceMs);
            (debounceTimer as unknown as { unref?: () => void }).unref?.();
        },

        async flushNow() {
            await pushPending().catch((error: unknown) =>
                publish({ phase: "error", lastError: errorMessage(error) }),
            );
            await refreshCounts().catch(() => {});
            publish({ phase: "idle" });
            return state;
        },

        async pullNow() {
            if (!isOnline() || !hasSession()) return state;
            publish({ phase: "pulling" });
            try {
                await pullSpaces();
                await pullRecent();
                publish({ phase: "idle", lastSyncAt: now() });
            } catch (error) {
                publish({ phase: "error", lastError: errorMessage(error) });
            }
            await refreshCounts().catch(() => {});
            return state;
        },

        syncNow: () => run(),

        async retryFailed() {
            const count = await local.retryOutbox();
            await refreshCounts().catch(() => {});
            // Retrying is only useful if something pushes the retried entries.
            if (count > 0) engine.requestFlush();
            return count;
        },

        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },

        state: () => state,
    };

    function onOnline(): void {
        void run();
    }

    return engine;
};

/** Raised for an outbox entry this build cannot replay. */
export class LocalFirstSyncError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "LocalFirstSyncError";
    }
}
