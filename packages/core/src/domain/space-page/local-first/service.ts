/**
 * Local-first `SpacePageService`.
 *
 * The port itself (see `@kn/common/domain/space-page/operations`) predates
 * offline support: every method used to be one HTTP call. This implementation
 * keeps that port unchanged so no consumer has to know which side answered:
 *
 * - **Reads** hit the local database first (instant, works with no network) and
 *   fall back to the cloud only for data that has never been cached. Whatever
 *   the cloud returns is written back, so the next read is local.
 * - **Writes** land in the local database immediately, are recorded in the
 *   outbox with `dirty: true`, and are replayed to the cloud by the sync engine.
 *   A mutation that fails only because the network is down is therefore a
 *   success from the user's point of view, and it survives a restart.
 * - **Collaboration features** (members, invitations, shares, comments,
 *   templates, activity, tags, history) stay cloud-only and are delegated
 *   verbatim: they are inherently multi-user and have no meaningful offline
 *   answer. Offline they reject with the transport error — the same feedback the
 *   app gave before local-first, which is the honest behaviour.
 *
 * The rules that keep this honest:
 *
 * 1. A metadata write is local-first by design: it lands in the local database
 *    and in the outbox, and the engine replays it. Only a write whose *id or
 *    validation verdict has to come from the server* (`createPage`,
 *    `createSpace`, `updateSpace`) tries the cloud first, falling back to the
 *    offline path on a connectivity failure — there a 4xx is a real error and is
 *    rethrown. For the queued kinds a server-side rejection surfaces later as a
 *    `failed` outbox entry, not as a synchronous error.
 * 2. A page created without a network gets a `local-page-…` id. The sync engine
 *    re-keys it onto the cloud id (`remapPage`) the moment the create succeeds,
 *    so nothing downstream ever sees the temporary id.
 */

import {
    LocalStoreError,
    createSpacePageChangeStream,
    fromLocalDocumentRecord,
    toLocalDocumentRecord,
    type ApplyPageOperationsRequest,
    type ApplyPageOperationsResult,
    type BlockSummary,
    type CreatePageRequest,
    type CreateSpaceRequest,
    type LocalBlockQuery,
    type LocalPageQuery,
    type LocalPageRecord,
    type LocalRecordMeta,
    type LocalSpaceQuery,
    type LocalSpaceRecord,
    type LocalStoreInfo,
    type MovePageRequest,
    type LocalHistoryRecord,
    type PageHistoryItem,
    type PageMetadata,
    type PageMetadataPatch,
    type PageRecord,
    type PageSummary,
    type PageTreeNode,
    type PagedResult,
    type QueryBlocksRequest,
    type QueryPagesRequest,
    type QueryPageTreeRequest,
    type Space,
    type SpacePageLocalStore,
    type SpacePageService,
    type UpdatePageTitleRequest,
    type UpdateSpaceRequest,
} from "@kn/common";

/**
 * Local-only bookkeeping keys, stripped before a record goes back out through
 * the `SpacePageService` contract.
 *
 * `updatedAt` is deliberately absent: it is a real optional field of
 * `PageMetadata`/`Space` and belongs to the payload, which is exactly why the
 * local write time is spelled `localUpdatedAt` throughout.
 */
const LOCAL_META_KEYS = [
    "localUpdatedAt",
    "remoteUpdatedAt",
    "dirty",
    "deleted",
    "partial",
    "rank",
    "personal",
] as const;

export type LocalFirstDiagnostic =
    | { type: "cache.miss"; entity: string; id: string }
    | { type: "write.queued"; kind: string; entityId: string }
    | { type: "remote.failed"; operation: string; message: string; offline: boolean };

export interface LocalFirstServiceOptions {
    local: SpacePageLocalStore;
    /** The cloud-backed service used for cache misses and outbox replay. */
    remote: SpacePageService;
    now?: () => number;
    /** Network probe; defaults to `navigator.onLine` (assumed online elsewhere). */
    isOnline?: () => boolean;
    /**
     * Whether cloud sync is switched on.
     *
     * Desktop is local-only by default: the SQLite repository is the source of
     * truth and the app never reaches the cloud behind the user's back. When
     * this returns `false`, every database read is answered from the local store
     * and every write (including `createPage`) goes straight to the local
     * database and the outbox — nothing is sent, and nothing is expected back.
     * Collaboration features (members, invitations, comments…) are not part of
     * this switch; they are inherently online and stay delegated.
     */
    isSyncEnabled?: () => boolean;
    /** Stable per-installation id; used by the document operation protocol. */
    clientId?: string;
    onDiagnostic?: (event: LocalFirstDiagnostic) => void;
    /**
     * Called after a mutation has been queued. `createLocalFirstRuntime` wires
     * this to the sync engine's "flush soon" hint; leaving it unset means the
     * next scheduled sync picks the change up.
     */
    requestFlush?: () => void;
}

export interface LocalFirstSpacePageService extends SpacePageService {
    /** The local database behind this service (diagnostics, storage UI). */
    readonly local: SpacePageLocalStore;
    readonly remote: SpacePageService;
    readonly durable: boolean;
    /** True when the cloud is unreachable or the last call failed on the network. */
    readonly offline: boolean;
    /**
     * True once the local database proved unusable and every namespace call is
     * being served by the cloud service instead.
     */
    readonly degraded: boolean;
    info(): Promise<LocalStoreInfo>;
}

/**
 * Thrown when a read cannot be answered: the cache has never seen the record
 * and the cloud is unreachable.
 *
 * Deliberately *not* a {@link LocalStoreError}: `LOCAL_STORE_UNAVAILABLE` means
 * "the database itself is broken" and is what switches the service into
 * cloud-only mode, so a plain cache miss must not be spelled the same way.
 */
export class LocalFirstOfflineError extends Error {
    readonly code = "LOCAL_FIRST_OFFLINE";

    constructor(message: string) {
        super(message);
        this.name = "LocalFirstOfflineError";
    }
}

/** True when an error means "no usable network", not "the server said no". */
export function isOfflineError(error: unknown): boolean {
    if (error instanceof LocalFirstOfflineError) return true;
    if (error instanceof LocalStoreError) return error.code === "LOCAL_STORE_UNAVAILABLE";
    if (!error || typeof error !== "object") return false;
    const candidate = error as {
        code?: unknown;
        message?: unknown;
        response?: unknown;
        isAxiosError?: unknown;
    };
    if (candidate.code === "ERR_NETWORK" || candidate.code === "ECONNABORTED" || candidate.code === "ETIMEDOUT") {
        return true;
    }
    if (candidate.isAxiosError === true && candidate.response === undefined) return true;
    if (
        typeof candidate.message === "string" &&
        /network|failed to fetch|fetch failed|timeout|offline|ENOTFOUND|ECONNREFUSED/i.test(candidate.message)
    ) {
        return true;
    }
    return false;
}

const stripMeta = <T>(record: Record<string, unknown>): T => {
    const copy: Record<string, unknown> = { ...record };
    for (const key of LOCAL_META_KEYS) delete copy[key];
    return copy as T;
};

const applyChildCounts = (nodes: PageTreeNode[]): void => {
    for (const node of nodes) {
        const children = node.children ?? [];
        node.childCount = children.length;
        node.hasChildren = children.length > 0;
        if (children.length) applyChildCounts(children);
        else delete node.children;
    }
};

/** Group cached pages into the tree the page list renders, keeping row order. */
export function buildPageTree(records: LocalPageRecord[]): PageTreeNode[] {
    const nodes = new Map<string, PageTreeNode>();
    for (const record of records) nodes.set(record.id, stripMeta<PageTreeNode>(record as unknown as Record<string, unknown>));
    const roots: PageTreeNode[] = [];
    for (const record of records) {
        const node = nodes.get(record.id);
        if (!node) continue;
        const parentId = typeof record.parentId === "string" && record.parentId ? record.parentId : null;
        const parent = parentId ? nodes.get(parentId) : undefined;
        if (parent) (parent.children ??= []).push(node);
        else roots.push(node);
    }
    applyChildCounts(roots);
    return roots;
}

/**
 * Depth-first flatten of a page tree into cacheable rows.
 *
 * The hierarchy is recorded twice, on purpose: `parentId` is taken from the
 * node's position in the tree (a server tree need not repeat it), which is what
 * lets `buildPageTree` rebuild the same shape from flat rows later, and `rank`
 * keeps the sibling order the server sent. A node that declares a parent while
 * sitting at the top of a *filtered* tree keeps its declared parent.
 */
export function flattenTree(nodes: PageTreeNode[]): Array<PageMetadata & { rank?: number }> {
    const out: Array<PageMetadata & { rank?: number }> = [];
    const visit = (list: PageTreeNode[], parentId: string | null): void => {
        list.forEach((node, index) => {
            const rest = { ...node } as PageTreeNode & { rank?: number };
            delete rest.children;
            delete rest.childCount;
            delete rest.hasChildren;
            rest.rank = index;
            const resolvedParent = parentId ?? node.parentId ?? null;
            if (resolvedParent === null) delete rest.parentId;
            else rest.parentId = resolvedParent;
            out.push(rest as PageMetadata & { rank?: number });
            if (node.children?.length) visit(node.children, node.id);
        });
    };
    visit(nodes, null);
    return out;
}

const paged = <T>(
    records: T[],
    total: number,
    request: { current?: number; page?: number; pageSize?: number } = {},
): PagedResult<T> => {
    const pageSize = Number(request.pageSize) > 0 ? Number(request.pageSize) : records.length;
    const current = Number(request.current ?? request.page) > 0 ? Number(request.current ?? request.page) : 1;
    const pages = pageSize > 0 ? Math.max(Math.ceil(total / pageSize), 1) : 1;
    return { records, current, pageSize, total, pages, hasNext: current < pages };
};

const pageSummaryFrom = (record: LocalPageRecord): PageSummary =>
    stripMeta<PageSummary>(record as unknown as Record<string, unknown>);

const localEdit = (now: number): LocalRecordMeta => ({ localUpdatedAt: now, dirty: true });

/**
 * `sync_state` key marking that a space's page tree has been pulled (or
 * fetched) at least once.
 *
 * Without it, any single cached row for a space (a recent-pages hit, a search
 * result) would make `getPageTree` serve a one-node tree instead of asking the
 * cloud. The marker is also written by the sync engine's pull.
 */
export const pageTreeSyncedKey = (spaceId: string): string => `pageTree.synced.${spaceId}`;

export const createLocalFirstSpacePageService = (options: LocalFirstServiceOptions): LocalFirstSpacePageService => {
    const { local, remote } = options;
    const now = options.now ?? (() => Date.now());
    const isOnline =
        options.isOnline ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
    const clientId =
        options.clientId ?? `local-${Math.random().toString(36).slice(2, 10)}-${now().toString(36)}`;
    const diagnose = options.onDiagnostic ?? (() => {});
    const changes = createSpacePageChangeStream();
    let observedOffline = false;

    const requestFlush = (): void => {
        observedOffline = false;
        options.requestFlush?.();
    };

    /** Queue a document operation (shared by the apply/reconcile/flush paths). */
    const queueDocument = async (
        pageId: string,
        kind: "document.apply" | "document.reconcile",
        request: unknown,
    ): Promise<void> => {
        await local.enqueue([
            {
                kind,
                entity: "document",
                entityId: pageId,
                payload: { pageId, request: request as Record<string, unknown> },
            },
        ]);
        requestFlush();
    };

    /**
     * Whether the local database is answering.
     *
     * The `spacepage.*` capabilities can exist while the database could not be
     * opened (unusable native module, corrupt file, read-only disk); the main
     * process still registers every handler and answers
     * `LOCAL_STORE_UNAVAILABLE`. Rather than failing every read and write, the
     * first such failure flips this off and the namespaces in the assembled
     * service fall back to the cloud — the app's pre-local-first behaviour.
     */
    let localUsable = true;
    let forwardedRemoteChanges = false;

    const isUnavailable = (error: unknown): boolean =>
        error instanceof LocalStoreError && error.code === "LOCAL_STORE_UNAVAILABLE";

    const degrade = (error: unknown): void => {
        if (!localUsable) return;
        localUsable = false;
        observedOffline = true;
        diagnose({
            type: "remote.failed",
            operation: "local.degraded",
            message: error instanceof Error ? error.message : String(error),
            offline: false,
        });
        if (!forwardedRemoteChanges) {
            forwardedRemoteChanges = true;
            try {
                // In degraded mode our own implementations never run, so the
                // cloud's events are the only ones left to forward.
                remote.changes.subscribe((change) => changes.publish(change));
            } catch {
                // A host without a change stream simply has no events to forward.
            }
        }
    };

    /**
     * Wrap a namespace so a call that cannot reach the local database is retried
     * against the cloud — once, transparently, and from then on without touching
     * the broken store again.
     */
    const degradeNamespace = <T extends object>(
        name: "spaces" | "pages" | "relations" | "documents",
        impl: T,
    ): T =>
        new Proxy(impl, {
            get(target, property, receiver) {
                const value = Reflect.get(target, property, receiver) as unknown;
                if (typeof value !== "function") return value;
                const localCall = (...args: unknown[]): unknown =>
                    (value as (...callArgs: unknown[]) => unknown).apply(target, args);
                const remoteCall = (...args: unknown[]): unknown => {
                    const remoteNamespace = (remote as unknown as Record<string, Record<string, unknown>>)[name];
                    const fallback = remoteNamespace?.[String(property)];
                    if (typeof fallback !== "function") {
                        throw new LocalStoreError(
                            "LOCAL_STORE_UNAVAILABLE",
                            `local store is unavailable and the cloud has no ${name}.${String(property)}`,
                        );
                    }
                    return fallback.apply(remoteNamespace, args);
                };
                return (...args: unknown[]) => {
                    if (!localUsable) return remoteCall(...args);
                    try {
                        const result = localCall(...args);
                        if (result && typeof (result as Promise<unknown>).then === "function") {
                            return (result as Promise<unknown>).catch((error: unknown) => {
                                if (!isUnavailable(error)) throw error;
                                degrade(error);
                                return remoteCall(...args);
                            });
                        }
                        return result;
                    } catch (error) {
                        if (!isUnavailable(error)) throw error;
                        degrade(error);
                        return remoteCall(...args);
                    }
                };
            },
        });

    /**
     * Cloud sync is opt-in on desktop. `true` when the caller did not say,
     * which keeps the web build (and tests) on the cloud-backed path.
     */
    const syncEnabled = (): boolean => options.isSyncEnabled?.() ?? true;

    const noteFailure = (operation: string, error: unknown): boolean => {
        const offline = isOfflineError(error);
        if (offline) observedOffline = true;
        diagnose({
            type: "remote.failed",
            operation,
            message: error instanceof Error ? error.message : String(error),
            offline,
        });
        return offline;
    };

    /**
     * Run a cloud call, returning `undefined` when it cannot be used so the
     * caller can serve the request from cache instead.
     *
     * Two ways in: the platform already knows there is no network (cheap and
     * deterministic — no five-second TCP timeout for every read on a plane), or
     * the call was attempted and failed on connectivity. Real errors
     * (validation, auth, conflicts) still throw.
     */
    const tryRemote = async <T>(operation: string, run: () => Promise<T>): Promise<T | undefined> => {
        if (!syncEnabled()) {
            // Local-only: never touch the network for database reads/writes. The
            // queued mutations stay in the outbox and are replayed the moment the
            // user turns syncing on.
            diagnose({ type: "remote.failed", operation, message: "sync disabled", offline: false });
            return undefined;
        }
        if (!isOnline()) {
            observedOffline = true;
            diagnose({ type: "remote.failed", operation, message: "offline", offline: true });
            return undefined;
        }
        try {
            const value = await run();
            observedOffline = false;
            return value;
        } catch (error) {
            if (!noteFailure(operation, error)) throw error;
            return undefined;
        }
    };

    /**
     * Fold the page identity the writer just sent into the local row.
     *
     * Title, icon, cover and tags live on the editor's `title` node, i.e. inside
     * the document. The cloud medium gets them for free because the server
     * derives them from the saved document; the local medium has no server to do
     * that, so without this the sidebar, search and offline reads would keep
     * showing the old title until (and if) a sync round-trip happened.
     */
    const applyPageMetadata = async (pageId: string, patch?: PageMetadataPatch): Promise<void> => {
        if (!patch) return;
        const keys = ["title", "icon", "cover", "tags"] as const;
        if (!keys.some((key) => patch[key] !== undefined)) return;
        const cached = await local.getPage(pageId);
        const next = {
            ...(cached ?? { id: pageId, title: "" }),
            ...(patch.title === undefined ? {} : { title: patch.title }),
            ...(patch.icon === undefined ? {} : { icon: patch.icon }),
            ...(patch.cover === undefined ? {} : { cover: patch.cover ?? undefined }),
            ...(patch.tags === undefined ? {} : { tags: patch.tags }),
            ...localEdit(now()),
        } as LocalPageRecord;
        await local.upsertPages([next]);
        changes.emit("page.updated", {
            page: stripMeta<PageMetadata>(next as unknown as Record<string, unknown>),
            spaceId: next.spaceId,
        });
        if (next.spaceId) changes.emit("page.tree.changed", { spaceId: String(next.spaceId), pageId });
    };

    /**
     * Cache page records.
     *
     * `partial` marks rows that came from a summary source (tree/list/recent/
     * search) instead of the full page endpoint: they lack the fields only a
     * full read returns, so `getPage` refreshes them from the cloud before
     * trusting them.
     */
    const cachePages = async (
        records: Array<PageMetadata & { rank?: number }>,
        meta: LocalRecordMeta,
        partial = false,
    ): Promise<void> => {
        if (!records.length) return;
        const withFlag: LocalRecordMeta = { ...meta, ...(partial ? { partial: true } : {}) };
        await local.upsertPages(records.map((record) => ({ ...record, ...withFlag }) as LocalPageRecord));
    };

    const cacheSpaces = async (records: Space[], meta: LocalRecordMeta): Promise<void> => {
        if (!records.length) return;
        await local.upsertSpaces(records.map((record) => ({ ...record, ...meta }) as LocalSpaceRecord));
    };

    const cacheBlocks = async (records: BlockSummary[], meta: LocalRecordMeta): Promise<void> => {
        if (!records.length) return;
        await local.upsertBlocks(records.map((record) => ({ ...record, ...meta })));
    };

    const enqueue = async (draft: {
        kind: string;
        entity: "space" | "page" | "block" | "document";
        entityId: string;
        payload: Record<string, unknown>;
        coalesceKey?: string;
    }): Promise<void> => {
        await local.enqueue([draft]);
        diagnose({ type: "write.queued", kind: draft.kind, entityId: draft.entityId });
        requestFlush();
    };

    const cachePage = async (
        page: PageMetadata,
        extra: LocalRecordMeta = {},
        rank?: number,
    ): Promise<PageMetadata> => {
        await local.upsertPages([
            { ...page, ...(rank === undefined ? {} : { rank }), ...extra } as LocalPageRecord,
        ]);
        return page;
    };

    /** The cached page, fetching it when the cache has never seen it. */
    const hydratePage = async (pageId: string): Promise<LocalPageRecord | null> => {
        const cached = await local.getPage(pageId);
        if (cached) return cached;
        diagnose({ type: "cache.miss", entity: "page", id: pageId });
        const page = await tryRemote("pages.getPage", () => remote.pages.getPage(pageId));
        if (!page) return null;
        await cachePage(page, { remoteUpdatedAt: null, dirty: false });
        return local.getPage(pageId);
    };

    const isTreeSynced = async (spaceId: string): Promise<boolean> => {
        try {
            return (await local.getState<number>(pageTreeSyncedKey(spaceId))) != null;
        } catch {
            // A store that cannot answer is treated as "not synced": worst case
            // we ask the cloud, which is what the cached tree would have to do
            // anyway when it is genuinely absent.
            return false;
        }
    };

    const markTreeSynced = async (spaceId: string): Promise<void> => {
        try {
            await local.setState(pageTreeSyncedKey(spaceId), now());
        } catch {
            // The marker is an optimisation; losing it only costs a re-fetch.
        }
    };

    const localPageQuery = (request: QueryPagesRequest): LocalPageQuery => {
        const pageSize = Number(request.pageSize) > 0 ? Number(request.pageSize) : undefined;
        const current = Number(request.current ?? request.page) > 0 ? Number(request.current ?? request.page) : 1;
        return {
            ...(request.spaceId ? { spaceId: String(request.spaceId) } : {}),
            ...(request.parentId === undefined ? {} : { parentId: request.parentId ?? "root" }),
            ...(request.status ? { status: request.status } : {}),
            ...(request.favorite === undefined ? {} : { favorite: Boolean(request.favorite) }),
            ...(request.pinned === undefined ? {} : { pinned: Boolean(request.pinned) }),
            ...(typeof request.searchValue === "string" && request.searchValue.trim()
                ? { search: request.searchValue }
                : {}),
            ...(pageSize ? { limit: pageSize } : {}),
            ...(pageSize ? { offset: (current - 1) * pageSize } : {}),
        };
    };

    const queryPagesLocally = async (
        request: QueryPagesRequest,
        orderBy: LocalPageQuery["orderBy"],
    ): Promise<PagedResult<PageSummary>> => {
        const query: LocalPageQuery = { ...localPageQuery(request), orderBy };
        const countQuery: LocalPageQuery = { ...query };
        delete countQuery.limit;
        delete countQuery.offset;
        const [records, total] = await Promise.all([local.listPages(query), local.countPages(countQuery)]);
        return paged(records.map(pageSummaryFrom), total, request);
    };

    const spaces: SpacePageService["spaces"] = {
        async getSpace(spaceId) {
            const cached = await local.getSpace(String(spaceId));
            if (cached && !cached.deleted) return stripMeta<Space>(cached as unknown as Record<string, unknown>);
            diagnose({ type: "cache.miss", entity: "space", id: String(spaceId) });
            const space = await tryRemote("spaces.getSpace", () => remote.spaces.getSpace(spaceId));
            if (!space) {
                if (cached) return stripMeta<Space>(cached as unknown as Record<string, unknown>);
                throw new LocalFirstOfflineError(
                    `space ${String(spaceId)} is not cached and the cloud is unreachable`,
                );
            }
            await cacheSpaces([space], { remoteUpdatedAt: null, dirty: false });
            return space;
        },

        async getPersonalSpace() {
            const [cached] = await local.listSpaces({ personal: true, limit: 1 });
            if (cached) return stripMeta<Space>(cached as unknown as Record<string, unknown>);
            const space = await tryRemote("spaces.getPersonalSpace", () => remote.spaces.getPersonalSpace());
            if (!space) {
                throw new LocalFirstOfflineError("the personal space has not been synced yet");
            }
            await local.upsertSpaces([
                { ...space, personal: true, remoteUpdatedAt: null, dirty: false } as LocalSpaceRecord,
            ]);
            return space;
        },

        async querySpaces(request = {}) {
            const query: LocalSpaceQuery = {
                ...(typeof request.searchValue === "string" && request.searchValue.trim()
                    ? { search: request.searchValue }
                    : {}),
                ...(request.type ? { type: request.type } : {}),
                ...(request.archived === undefined ? {} : { archived: Boolean(request.archived) }),
                ...(request.favorite === undefined ? {} : { favorite: Boolean(request.favorite) }),
                ...(Number(request.pageSize) > 0
                    ? {
                          limit: Number(request.pageSize),
                          offset:
                              ((Number(request.current ?? request.page) > 0
                                  ? Number(request.current ?? request.page)
                                  : 1) -
                                  1) *
                              Number(request.pageSize),
                      }
                    : {}),
            };
            const [records, total] = await Promise.all([local.listSpaces(query), local.countSpaces(query)]);
            if (total > 0) {
                return paged(
                    records.map((record) => stripMeta<Space>(record as unknown as Record<string, unknown>)),
                    total,
                    request,
                );
            }

            const result = await tryRemote("spaces.querySpaces", () => remote.spaces.querySpaces(request));
            if (!result) {
                throw new LocalFirstOfflineError("no spaces are cached and the cloud is unreachable");
            }
            await cacheSpaces(result.records, { remoteUpdatedAt: null, dirty: false });
            // `type: "PERSONAL"` is the only signal the cloud gives for the user's
            // own space; remembering it is what makes `getPersonalSpace()` work
            // offline afterwards.
            const personal = result.records.filter((space) => space.type === "PERSONAL");
            if (personal.length) {
                await local.upsertSpaces(
                    personal.map(
                        (space) =>
                            ({ ...space, personal: true, remoteUpdatedAt: null, dirty: false }) as LocalSpaceRecord,
                    ),
                );
            }
            return result;
        },

        async createSpace(request: CreateSpaceRequest) {
            const created = await tryRemote("spaces.createSpace", () => remote.spaces.createSpace(request));
            if (created?.id) {
                await local.upsertSpaces([
                    {
                        ...created,
                        ...(created.type === "PERSONAL" ? { personal: true } : {}),
                        remoteUpdatedAt: null,
                        dirty: false,
                    } as LocalSpaceRecord,
                ]);
                changes.emit("space.created", { space: created });
                return created;
            }
            if (created) return created;

            const localId = `local-space-${Math.random().toString(36).slice(2, 10)}`;
            const record: LocalSpaceRecord = {
                ...(request as unknown as Partial<Space>),
                id: localId,
                name: request.name,
                ...(request.type === "PERSONAL" ? { personal: true } : {}),
                remoteUpdatedAt: null,
                ...localEdit(now()),
            } as LocalSpaceRecord;
            await local.upsertSpaces([record]);
            await enqueue({
                kind: "space.create",
                entity: "space",
                entityId: localId,
                payload: { ...(request as unknown as Record<string, unknown>), id: localId, localId },
                coalesceKey: `space.create:${localId}`,
            });
            const space = stripMeta<Space>(record as unknown as Record<string, unknown>);
            changes.emit("space.created", { space });
            return space;
        },

        async updateSpace(request: UpdateSpaceRequest) {
            const spaceId = String(request.id);
            const updated = await tryRemote("spaces.updateSpace", () => remote.spaces.updateSpace(request));
            if (updated?.id) {
                await cacheSpaces([updated], { remoteUpdatedAt: null, dirty: false });
                changes.emit("space.updated", { space: updated, spaceId });
                return updated;
            }

            const cached = await local.getSpace(spaceId);
            const merged: LocalSpaceRecord = {
                ...(cached ?? { id: spaceId, name: "" }),
                ...(request as unknown as Partial<Space>),
                id: spaceId,
                ...localEdit(now()),
            } as LocalSpaceRecord;
            await local.upsertSpaces([merged]);
            await enqueue({
                kind: "space.update",
                entity: "space",
                entityId: spaceId,
                payload: { ...(request as unknown as Record<string, unknown>), id: spaceId },
                coalesceKey: `space.update:${spaceId}`,
            });
            const space = stripMeta<Space>(merged as unknown as Record<string, unknown>);
            changes.emit("space.updated", { space, spaceId });
            return space;
        },

        async archiveSpace(spaceId) {
            const id = String(spaceId);
            const cached = await hydrateSpace(id);
            if (cached) {
                await local.upsertSpaces([{ ...cached, archived: true, ...localEdit(now()) } as LocalSpaceRecord]);
                await enqueue({
                    kind: "space.archive",
                    entity: "space",
                    entityId: id,
                    payload: { spaceId: id },
                    coalesceKey: `space.archive:${id}`,
                });
            } else {
                await remote.spaces.archiveSpace(spaceId);
            }
            changes.emit("space.archived", { spaceId: id });
        },

        async unarchiveSpace(spaceId) {
            const id = String(spaceId);
            const cached = await hydrateSpace(id);
            if (cached) {
                await local.upsertSpaces([{ ...cached, archived: false, ...localEdit(now()) } as LocalSpaceRecord]);
                await enqueue({
                    kind: "space.unarchive",
                    entity: "space",
                    entityId: id,
                    payload: { spaceId: id },
                    coalesceKey: `space.archive:${id}`,
                });
            } else {
                await remote.spaces.unarchiveSpace(spaceId);
            }
            changes.emit("space.unarchived", { spaceId: id });
        },

        async deleteSpace(spaceId) {
            const id = String(spaceId);
            const cached = await local.getSpace(id);
            if (isOnline() && !(await isUnsyncedCreation(id, "space.create"))) {
                const done = await tryRemote("spaces.deleteSpace", async () => {
                    await remote.spaces.deleteSpace(spaceId);
                    return true;
                });
                if (done) {
                    await local.deleteSpaces([id]);
                    changes.emit("space.deleted", { spaceId: id });
                    return;
                }
            }
            if (await isUnsyncedCreation(id, "space.create")) {
                // Never left this device: drop it and its queued ops outright.
                await local.deleteSpaces([id]);
            } else {
                await enqueue({
                    kind: "space.delete",
                    entity: "space",
                    entityId: id,
                    payload: { spaceId: id },
                    coalesceKey: `space.delete:${id}`,
                });
                await local.deleteSpaces([id]);
            }
            changes.emit("space.deleted", { spaceId: id });
        },

        async toggleSpaceFavorite(spaceId) {
            const id = String(spaceId);
            const cached = await hydrateSpace(id);
            if (!cached) {
                await remote.spaces.toggleSpaceFavorite(spaceId);
                changes.emit("space.favorite.changed", { spaceId: id });
                return;
            }
            const favorite = !cached.favorite;
            await local.upsertSpaces([{ ...cached, favorite, ...localEdit(now()) } as LocalSpaceRecord]);
            await enqueue({
                kind: "space.favorite",
                entity: "space",
                entityId: id,
                payload: { spaceId: id, favorite },
                // Deliberately not coalesced: the port only exposes a *toggle*,
                // so replacing two queued toggles with the last one would invert
                // what the user actually did.
            });
            changes.emit("space.favorite.changed", { spaceId: id, favorite });
        },
    };

    /** Cached space, fetching it when the cache has never seen it. */
    /**
     * True when this device created the entity and the cloud has not accepted it.
     *
     * `dirty` alone is not the test: any local edit sets it, so basing a
     * tombstone decision on it would throw away pages the cloud already knows —
     * and they would reappear on the next pull. The queued create is the
     * evidence, and discarding is only correct while it is there.
     */
    const isUnsyncedCreation = async (entityId: string, kind: string): Promise<boolean> => {
        try {
            const entries = await local.listOutbox({ entityId, limit: 50 });
            return entries.some((entry) => entry.kind === kind);
        } catch {
            return false;
        }
    };

    const hydrateSpace = async (spaceId: string): Promise<LocalSpaceRecord | null> => {
        const cached = await local.getSpace(spaceId);
        if (cached) return cached;
        diagnose({ type: "cache.miss", entity: "space", id: spaceId });
        const space = await tryRemote("spaces.getSpace", () => remote.spaces.getSpace(spaceId));
        if (!space) return null;
        await cacheSpaces([space], { remoteUpdatedAt: null, dirty: false });
        return local.getSpace(spaceId);
    };

    const pages: SpacePageService["pages"] = {
        async getPage(pageId) {
            const cached = await local.getPage(String(pageId));
            if (cached && !cached.deleted && !cached.partial) {
                return stripMeta<PageRecord>(cached as unknown as Record<string, unknown>);
            }
            diagnose({ type: "cache.miss", entity: "page", id: String(pageId) });
            const page = await tryRemote("pages.getPage", () => remote.pages.getPage(pageId));
            if (!page) {
                if (cached) return stripMeta<PageRecord>(cached as unknown as Record<string, unknown>);
                throw new LocalFirstOfflineError(
                    `page ${String(pageId)} is not cached and the cloud is unreachable`,
                );
            }
            if (cached?.dirty) {
                // The row holds a local edit the cloud has not accepted yet, so
                // the full record is merged *under* it: the local values win for
                // the fields both have, the cloud fills in the rest.
                const merged = {
                    ...page,
                    ...stripMeta<PageMetadata>(cached as unknown as Record<string, unknown>),
                    localUpdatedAt: cached.localUpdatedAt,
                    ...(cached.remoteUpdatedAt == null
                        ? {}
                        : { remoteUpdatedAt: cached.remoteUpdatedAt }),
                    dirty: true,
                    partial: false,
                } as unknown as LocalPageRecord;
                await local.upsertPages([merged]);
                return stripMeta<PageRecord>(merged as unknown as Record<string, unknown>);
            }
            await cachePage(page, { remoteUpdatedAt: null, dirty: false });
            return page;
        },

        async getPageMetadata(pageId) {
            const page = await pages.getPage(pageId);
            return page as PageMetadata;
        },

        async getPageTree(request: QueryPageTreeRequest) {
            const spaceId = String(request.spaceId);
            // "Some rows exist for this space" is not the same as "the tree has
            // been pulled": a recent-pages or search hit leaves one row behind,
            // and serving a one-node tree from it would look like data loss. The
            // marker is what makes the cached tree trustworthy.
            if (await isTreeSynced(spaceId)) {
                return buildPageTree(await local.listPages({ spaceId, limit: 5000 }));
            }

            diagnose({ type: "cache.miss", entity: "pageTree", id: spaceId });
            const tree = await tryRemote("pages.getPageTree", () => remote.pages.getPageTree(request));
            if (!tree) {
                const records = await local.listPages({ spaceId, limit: 5000 });
                if (records.length) return buildPageTree(records);
                throw new LocalFirstOfflineError(
                    `space ${spaceId} has no cached page tree and the cloud is unreachable`,
                );
            }
            await cachePages(flattenTree(tree), { remoteUpdatedAt: null, dirty: false }, true);
            await markTreeSynced(spaceId);
            return tree;
        },

        async queryPages(request = {}) {
            // A space-scoped list is only as complete as that space's tree; an
            // unscoped list (search, pickers) stays best-effort local.
            const scopedSpaceId = request.spaceId ? String(request.spaceId) : undefined;
            const result =
                scopedSpaceId && !(await isTreeSynced(scopedSpaceId))
                    ? paged<PageSummary>([], 0, request)
                    : await queryPagesLocally(request, request.parentId === undefined ? "updated" : "rank");
            if (result.total > 0) return result;
            const remoteResult = await tryRemote("pages.queryPages", () => remote.pages.queryPages(request));
            if (!remoteResult) return result;
            await cachePages(remoteResult.records, { remoteUpdatedAt: null, dirty: false }, true);
            return remoteResult;
        },

        async queryRecentPages(request = {}) {
            const result = await queryPagesLocally({ ...request, pageSize: request.pageSize ?? 50 }, "updated");
            if (result.total > 0) return result;
            const remoteResult = await tryRemote("pages.queryRecentPages", () =>
                remote.pages.queryRecentPages(request),
            );
            if (!remoteResult) return result;
            await cachePages(remoteResult.records, { remoteUpdatedAt: null, dirty: false }, true);
            return remoteResult;
        },

        async queryFavoritePages(request = {}) {
            const result = await queryPagesLocally({ ...request, favorite: true }, "updated");
            if (result.total > 0) return result;
            const remoteResult = await tryRemote("pages.queryFavoritePages", () =>
                remote.pages.queryFavoritePages(request),
            );
            if (!remoteResult) return result;
            await cachePages(remoteResult.records, { remoteUpdatedAt: null, dirty: false }, true);
            return remoteResult;
        },

        async createPage(request: CreatePageRequest) {
            const created = await tryRemote("pages.createPage", () => remote.pages.createPage(request));
            if (created?.id) {
                const siblings = await siblingCount(String(request.spaceId), request.parentId);
                await cachePage(created, { remoteUpdatedAt: null, dirty: false }, siblings);
                if (request.content !== undefined) {
                    await local.upsertDocument(
                        toLocalDocumentRecord(
                            created.id,
                            { pageId: created.id, doc: request.content, rev: null },
                            { remoteUpdatedAt: null, dirty: false },
                        ),
                    );
                }
                changes.emit("page.created", { page: created, spaceId: created.spaceId ?? request.spaceId });
                return created;
            }
            if (created) return created;

            const localId = `local-page-${Math.random().toString(36).slice(2, 10)}`;
            const record: LocalPageRecord = {
                id: localId,
                spaceId: request.spaceId,
                parentId: request.parentId ?? null,
                title: request.title,
                ...(request.pageType === undefined ? {} : { pageType: request.pageType }),
                ...(request.icon === undefined ? {} : { icon: request.icon }),
                ...(request.tags === undefined ? {} : { tags: request.tags }),
                rank: await siblingCount(String(request.spaceId), request.parentId),
                remoteUpdatedAt: null,
                ...localEdit(now()),
            } as LocalPageRecord;
            await local.upsertPages([record]);
            if (request.content !== undefined) {
                await local.upsertDocument(
                    toLocalDocumentRecord(
                        localId,
                        { pageId: localId, doc: request.content, rev: null },
                        localEdit(now()),
                    ),
                );
            }
            await enqueue({
                kind: "page.create",
                entity: "page",
                entityId: localId,
                payload: { ...(request as unknown as Record<string, unknown>), id: localId, localId },
                coalesceKey: `page.create:${localId}`,
            });
            const page = stripMeta<PageRecord>(record as unknown as Record<string, unknown>);
            changes.emit("page.created", { page, spaceId: request.spaceId });
            changes.emit("page.tree.changed", { spaceId: String(request.spaceId), pageId: localId });
            return page;
        },

        async updatePageTitle(request: UpdatePageTitleRequest) {
            const pageId = String(request.pageId);
            const cached = await hydratePage(pageId);
            if (!cached) {
                await remote.pages.updatePageTitle(request);
                changes.emit("page.updated", { page: { id: pageId, title: request.title }, spaceId: undefined });
                return;
            }
            const next: LocalPageRecord = { ...cached, title: request.title, ...localEdit(now()) };
            await local.upsertPages([next]);
            await enqueue({
                kind: "page.title",
                entity: "page",
                entityId: pageId,
                payload: { pageId, title: request.title },
                coalesceKey: `page.title:${pageId}`,
            });
            const page = stripMeta<PageMetadata>(next as unknown as Record<string, unknown>);
            changes.emit("page.updated", { page, spaceId: next.spaceId });
            if (next.spaceId) changes.emit("page.tree.changed", { spaceId: String(next.spaceId), pageId });
        },

        async movePage(request: MovePageRequest) {
            const pageId = String(request.pageId);
            const targetSpaceId = String(request.targetSpaceId);
            const targetParentId = request.targetParentId == null ? null : String(request.targetParentId);
            const cached = await hydratePage(pageId);
            if (!cached) {
                await remote.pages.movePage(request);
                changes.emit("page.moved", { pageId, spaceId: targetSpaceId, parentId: targetParentId });
                return;
            }
            const fromSpaceId = cached.spaceId;
            const next: LocalPageRecord = {
                ...cached,
                spaceId: targetSpaceId,
                parentId: targetParentId,
                ...localEdit(now()),
            };
            await local.upsertPages([next]);
            await enqueue({
                kind: "page.move",
                entity: "page",
                entityId: pageId,
                payload: { pageId, targetParentId, targetSpaceId },
                coalesceKey: `page.move:${pageId}`,
            });
            changes.emit("page.moved", { pageId, spaceId: targetSpaceId, parentId: targetParentId });
            if (fromSpaceId) changes.emit("page.tree.changed", { spaceId: String(fromSpaceId), pageId });
            changes.emit("page.tree.changed", { spaceId: targetSpaceId, pageId });
        },

        async movePageToTrash(pageId) {
            const id = String(pageId);
            const cached = await hydratePage(id);
            if (!cached) {
                await remote.pages.movePageToTrash(pageId);
                changes.emit("page.trashed", { pageId: id });
                return;
            }
            if (await isUnsyncedCreation(id, "page.create")) {
                // Created on this device and never pushed: there is nothing to
                // delete upstream, so drop the page and its queued ops. A page
                // the cloud knows is tombstoned *and* has its trash queued.
                await local.deletePages([id]);
            } else {
                await enqueue({
                    kind: "page.trash",
                    entity: "page",
                    entityId: id,
                    payload: { pageId: id },
                    coalesceKey: `page.trash:${id}`,
                });
                await local.deletePages([id]);
            }
            changes.emit("page.trashed", { pageId: id, spaceId: cached.spaceId });
            if (cached.spaceId) changes.emit("page.tree.changed", { spaceId: String(cached.spaceId), pageId: id });
        },

        async restorePageFromTrash(pageId) {
            const id = String(pageId);
            const cached = await local.getPage(id);
            if (!cached) {
                await remote.pages.restorePageFromTrash(pageId);
                changes.emit("page.restoredFromTrash", { pageId: id });
                return;
            }
            await local.upsertPages([
                {
                    ...cached,
                    deleted: false,
                    ...(cached.status === "TRASH" ? { status: undefined } : {}),
                    ...localEdit(now()),
                } as LocalPageRecord,
            ]);
            await enqueue({
                kind: "page.restore",
                entity: "page",
                entityId: id,
                payload: { pageId: id },
                coalesceKey: `page.trash:${id}`,
            });
            changes.emit("page.restoredFromTrash", { pageId: id, spaceId: cached.spaceId });
            if (cached.spaceId) changes.emit("page.tree.changed", { spaceId: String(cached.spaceId), pageId: id });
        },

        async favoritePage(pageId) {
            const id = String(pageId);
            const cached = await hydratePage(id);
            if (!cached) {
                await remote.pages.favoritePage(pageId);
                changes.emit("page.favorite.changed", { pageId: id, favorite: true });
                return;
            }
            await local.upsertPages([{ ...cached, favorite: true, ...localEdit(now()) } as LocalPageRecord]);
            await enqueue({
                kind: "page.favorite",
                entity: "page",
                entityId: id,
                payload: { pageId: id, favorite: true },
                coalesceKey: `page.favorite:${id}`,
            });
            changes.emit("page.favorite.changed", { pageId: id, favorite: true, spaceId: cached.spaceId });
        },

        async unfavoritePage(pageId) {
            const id = String(pageId);
            const cached = await hydratePage(id);
            if (!cached) {
                await remote.pages.unfavoritePage(pageId);
                changes.emit("page.favorite.changed", { pageId: id, favorite: false });
                return;
            }
            await local.upsertPages([{ ...cached, favorite: false, ...localEdit(now()) } as LocalPageRecord]);
            await enqueue({
                kind: "page.favorite",
                entity: "page",
                entityId: id,
                payload: { pageId: id, favorite: false },
                coalesceKey: `page.favorite:${id}`,
            });
            changes.emit("page.favorite.changed", { pageId: id, favorite: false, spaceId: cached.spaceId });
        },

        async togglePagePin(spaceId, pageId) {
            const id = String(pageId);
            const cached = await hydratePage(id);
            if (!cached) {
                await remote.pages.togglePagePin(spaceId, pageId);
                changes.emit("page.pin.changed", { spaceId: String(spaceId), pageId: id });
                return;
            }
            const pinned = !cached.pinned;
            await local.upsertPages([{ ...cached, pinned, ...localEdit(now()) } as LocalPageRecord]);
            await enqueue({
                kind: "page.pin",
                entity: "page",
                entityId: id,
                payload: { spaceId: String(spaceId), pageId: id, pinned },
                // Not coalesced: `togglePagePin` flips, so both clicks must be
                // replayed for the server to end up where the user left it.
            });
            changes.emit("page.pin.changed", { spaceId: String(spaceId), pageId: id, pinned });
        },

        async getPinnedPages(spaceId) {
            const space = String(spaceId);
            const records = await local.listPages({ spaceId: space, pinned: true, limit: 200 });
            if (records.length) return records.map(pageSummaryFrom);
            const remotePins = await tryRemote("pages.getPinnedPages", () => remote.pages.getPinnedPages(spaceId));
            if (!remotePins) return [];
            // The pin list is a summary source, and being on it is the only pin
            // signal it carries — record that so the next read is local.
            await cachePages(
                remotePins.map((record) => ({ ...record, pinned: true })),
                { remoteUpdatedAt: null, dirty: false },
                true,
            );
            return remotePins;
        },
    };

    /** Local revisions are prefixed so a reader can tell them from server ones. */
    const LOCAL_REV_PREFIX = "local-";
    const isLocalRev = (rev: unknown): boolean => String(rev).startsWith(LOCAL_REV_PREFIX);

    const toHistoryItem = (record: LocalHistoryRecord): PageHistoryItem => ({
        rev: record.rev,
        kind: record.kind,
        label: record.label,
        createdAt: record.createdAt,
        current: record.current,
        metadata: { ...record.metadata, local: true, clientId: record.clientId, remoteRev: record.remoteRev },
    });

    const siblingCount = async (spaceId: string, parentId: unknown): Promise<number> => {
        const query: LocalPageQuery =
            parentId === undefined || parentId === null
                ? { spaceId, parentId: "root" }
                : { spaceId, parentId: String(parentId) };
        return local.countPages(query);
    };

    const relations: SpacePageService["relations"] = {
        async queryBlocksPage(request: QueryBlocksRequest) {
            const pageSize = Number((request as { pageSize?: number }).pageSize);
            const current = Number((request as { current?: number }).current) || 1;
            const query: LocalBlockQuery = {
                ...(request.pageId ? { pageId: String(request.pageId) } : {}),
                ...(request.spaceId ? { spaceId: String(request.spaceId) } : {}),
                ...(pageSize > 0 ? { limit: pageSize, offset: (current - 1) * pageSize } : {}),
            };
            const countQuery: LocalBlockQuery = { ...query };
            delete countQuery.limit;
            delete countQuery.offset;
            const [records, total] = await Promise.all([
                local.listBlocks(query),
                local.countBlocks(countQuery),
            ]);
            if (total > 0) {
                return {
                    records: records.map((record) =>
                        stripMeta<BlockSummary>(record as unknown as Record<string, unknown>),
                    ),
                    total,
                    current,
                    pageSize: pageSize > 0 ? pageSize : total,
                } as PagedResult<BlockSummary>;
            }
            diagnose({
                type: "cache.miss",
                entity: "blocks",
                id: String(request.pageId ?? request.spaceId ?? "all"),
            });
            const result = await tryRemote("relations.queryBlocksPage", () =>
                remote.relations.queryBlocksPage(request),
            );
            if (!result) return { records: [], total: 0, current: 1, pageSize: 0 } as PagedResult<BlockSummary>;
            await cacheBlocks(result.records, { remoteUpdatedAt: null, dirty: false });
            return result;
        },

        async queryBlocks(request: QueryBlocksRequest) {
            return (await relations.queryBlocksPage(request)).records;
        },

        async getBlock(blockId) {
            const cached = await local.getBlock(String(blockId));
            if (cached && !cached.deleted) {
                return stripMeta<BlockSummary>(cached as unknown as Record<string, unknown>);
            }
            const block = await tryRemote("relations.getBlock", () => remote.relations.getBlock(blockId));
            if (!block) {
                if (cached) return stripMeta<BlockSummary>(cached as unknown as Record<string, unknown>);
                throw new LocalFirstOfflineError(
                    `block ${String(blockId)} is not cached and the cloud is unreachable`,
                );
            }
            await cacheBlocks([block], { remoteUpdatedAt: null, dirty: false });
            return block;
        },

        async searchBlocks(request) {
            const records = await local.listBlocks({
                ...(request.spaceId ? { spaceId: String(request.spaceId) } : {}),
                ...(request.pageId ? { pageId: String(request.pageId) } : {}),
                ...(request.keyword ? { search: request.keyword } : {}),
                limit: 50,
            });
            if (records.length) {
                return records.map((record) =>
                    stripMeta<BlockSummary>(record as unknown as Record<string, unknown>),
                );
            }
            const hits = await tryRemote("relations.searchBlocks", () => remote.relations.searchBlocks(request));
            if (!hits) return [];
            await cacheBlocks(hits, { remoteUpdatedAt: null, dirty: false });
            return hits;
        },

        // Derived graph/backlink data is computed server-side from the whole
        // space; a local approximation would be silently wrong, so it stays
        // online-only and answers with "nothing" rather than a wrong graph.
        async queryPageRelations(request) {
            const result = await tryRemote("relations.queryPageRelations", () =>
                remote.relations.queryPageRelations(request),
            );
            return result ?? [];
        },

        async getSpaceGraph(request = {}) {
            const graph = await tryRemote("relations.getSpaceGraph", () => remote.relations.getSpaceGraph(request));
            return graph ?? { nodes: [], edges: [] };
        },

        async reindexBlocks() {
            await remote.relations.reindexBlocks?.();
        },
    };

    const documents: SpacePageService["documents"] = {
        async getPageDocument(pageId) {
            const cached = await local.getDocument(String(pageId));
            if (cached && (cached.doc !== undefined || cached.content !== undefined)) {
                return { ...fromLocalDocumentRecord(cached), pageId: cached.pageId };
            }
            diagnose({ type: "cache.miss", entity: "document", id: String(pageId) });
            const document = await tryRemote("documents.getPageDocument", () =>
                remote.documents.getPageDocument(pageId),
            );
            if (!document) {
                if (cached) return { ...fromLocalDocumentRecord(cached), pageId: cached.pageId };
                throw new LocalFirstOfflineError(
                    `document ${String(pageId)} is not cached and the cloud is unreachable`,
                );
            }
            const resolvedPageId = document.pageId ?? String(pageId);
            await local.upsertDocument(
                toLocalDocumentRecord(
                    resolvedPageId,
                    { ...document, pageId: resolvedPageId },
                    { remoteUpdatedAt: null, dirty: false },
                ),
            );
            return { ...document, pageId: resolvedPageId };
        },

        /**
         * Checkpoints are served by the *local* medium: the revision log lives in
         * this database, so Ctrl+S and the version panel work with no account and
         * no network. When sync is on, the same checkpoint is mirrored to the
         * cloud so other devices see it; a mirror failure never fails the local
         * checkpoint.
         */
        async createPageCheckpoint(pageId, clientIdValue, label, snapshot) {
            const id = String(pageId);
            const cached = await local.getDocument(id);
            const doc = snapshot?.doc !== undefined ? snapshot.doc : (cached?.doc ?? cached?.content ?? null);
            const record = await local.appendHistory({
                pageId: id,
                kind: "USER",
                label: label ?? null,
                clientId: clientIdValue,
                doc,
                metadata: { ...(label == null ? {} : { label }), actor: clientIdValue },
            });
            if (snapshot?.metadata) await applyPageMetadata(id, snapshot.metadata);

            const item = toHistoryItem(record);
            changes.emit("page.history.changed", { pageId: id, history: item, rev: item.rev });

            if (syncEnabled()) {
                void tryRemote("documents.createPageCheckpoint", () =>
                    remote.documents.createPageCheckpoint(pageId, clientIdValue, label, snapshot),
                )
                    .then(async (remoteItem) => {
                        if (remoteItem?.rev != null) await local.markHistorySynced(id, record.rev, remoteItem.rev);
                    })
                    .catch(() => {
                        // The local checkpoint stands; the mirror is best effort.
                    });
            }
            return item;
        },

        async getPageHistory(request) {
            const id = String(request.pageId);
            const localRecords = await local.listHistory(
                id,
                Number((request as { pageSize?: number }).pageSize) || 100,
            );
            const localItems = localRecords.map(toHistoryItem);
            if (!syncEnabled()) return paged(localItems, localItems.length, request);

            const remoteResult = await tryRemote("documents.getPageHistory", () =>
                remote.documents.getPageHistory(request),
            );
            if (!remoteResult) return paged(localItems, localItems.length, request);
            // Server revisions plus the checkpoints that only exist on this
            // device, so an offline Ctrl+S is still visible in the panel.
            const localOnly = localItems.filter((item) => {
                const matching = localRecords.find((record) => String(record.rev) === String(item.rev));
                return !matching?.remoteRev;
            });
            return {
                ...remoteResult,
                records: [...remoteResult.records, ...localOnly],
                total: remoteResult.total + localOnly.length,
            };
        },

        async getPageHistoryDocument(pageId, rev) {
            const id = String(pageId);
            const version = String(rev);
            if (!isLocalRev(version)) return remote.documents.getPageHistoryDocument(pageId, rev);
            const record = await local.getHistoryDocument(id, version);
            if (!record) {
                throw new LocalFirstOfflineError(`checkpoint ${version} of page ${id} is not stored locally`);
            }
            return {
                pageId: id,
                doc: record.doc ?? null,
                rev: record.rev,
                kind: record.kind,
                createdAt: record.createdAt,
                current: record.current,
            };
        },

        async restorePageRevision(request) {
            const id = String(request.pageId);
            const target = String(request.targetRev);
            if (!isLocalRev(target)) return remote.documents.restorePageRevision(request);

            const record = await local.getHistoryDocument(id, target);
            if (!record) {
                throw new LocalFirstOfflineError(`checkpoint ${target} of page ${id} is not stored locally`);
            }
            const doc = record.doc ?? null;
            // The local document becomes the restored content; the cloud is asked
            // to adopt it (reconcile) as soon as syncing allows.
            await local.upsertDocument(toLocalDocumentRecord(id, { pageId: id, doc }, localEdit(now())));
            await enqueue({
                kind: "document.reconcile",
                entity: "document",
                entityId: id,
                payload: { pageId: id, request: { baseRev: null, clientId: request.clientId, doc } },
            });
            await local.appendHistory({
                pageId: id,
                kind: "RESTORE",
                label: `restore ${target}`,
                clientId: request.clientId,
                doc,
                metadata: { restoredFromRev: target },
            });
            const result = {
                metadata: { queued: true, localFirst: true, restoredFromRev: target },
            } as ApplyPageOperationsResult;
            changes.emit("page.history.changed", { pageId: id, rev: target });
            changes.emit("page.document.changed", { pageId: id, scope: "content", result });
            return result;
        },

        async claimPageSession(request) {
            const state = await tryRemote("documents.claimPageSession", () =>
                remote.documents.claimPageSession(request),
            );
            if (state) return state;
            // Offline the local document owns the page: there is no other editor
            // to contend with, so the caller is the host by definition.
            return {
                role: "HOST" as const,
                alive: true,
                hostSelf: true,
                metadata: { offline: true, clientId },
            };
        },

        async heartbeatPageSession(request) {
            const state = await tryRemote("documents.heartbeatPageSession", () =>
                remote.documents.heartbeatPageSession(request),
            );
            return (
                state ?? {
                    role: "HOST" as const,
                    alive: true,
                    hostSelf: true,
                    metadata: { offline: true, clientId },
                }
            );
        },

        releasePageSession(request) {
            if (!isOnline()) return undefined;
            try {
                const result = remote.documents.releasePageSession(request);
                // A fire-and-forget caller must not see an unhandled rejection.
                return result && typeof (result as Promise<unknown>).then === "function"
                    ? (result as Promise<unknown>).catch(() => undefined)
                    : result;
            } catch (error) {
                if (isOfflineError(error)) return undefined;
                throw error;
            }
        },

        async applyPageOperations(pageId, request: ApplyPageOperationsRequest) {
            const result = await tryRemote("documents.applyPageOperations", () =>
                remote.documents.applyPageOperations(pageId, request),
            );
            if (result) {
                await applyPageMetadata(String(pageId), request.metadata);
                changes.emit("page.document.changed", { pageId: String(pageId), scope: "content", result });
                return result;
            }
            await applyPageMetadata(String(pageId), request.metadata);
            await enqueue({
                kind: "document.apply",
                entity: "document",
                entityId: String(pageId),
                payload: { pageId: String(pageId), request: request as unknown as Record<string, unknown> },
            });
            // No `rev` on purpose: the caller must not believe the revision it
            // queued is the server's. Editors keep their own pending state until
            // the sync engine reports a real revision back.
            return {
                opsApplied: request.ops.length,
                metadata: { queued: true, localFirst: true },
            } as ApplyPageOperationsResult;
        },

        async reconcilePageDocument(pageId, request) {
            const result = await tryRemote("documents.reconcilePageDocument", () =>
                remote.documents.reconcilePageDocument(pageId, request),
            );
            if (result) {
                await local.upsertDocument(
                    toLocalDocumentRecord(
                        String(pageId),
                        { pageId: String(pageId), doc: request.doc, rev: result.rev ?? null },
                        { remoteUpdatedAt: null, dirty: false },
                    ),
                );
                await applyPageMetadata(String(pageId), request.metadata);
                changes.emit("page.document.changed", { pageId: String(pageId), scope: "content", result });
                return result;
            }
            await local.upsertDocument(
                toLocalDocumentRecord(
                    String(pageId),
                    { pageId: String(pageId), doc: request.doc },
                    localEdit(now()),
                ),
            );
            await enqueue({
                kind: "document.reconcile",
                entity: "document",
                entityId: String(pageId),
                payload: { pageId: String(pageId), request: request as unknown as Record<string, unknown> },
            });
            return { metadata: { queued: true, localFirst: true } } as ApplyPageOperationsResult;
        },

        flushPageOperations(pageId, request) {
            // The page's identity rides along with the batch, so the local row is
            // right even when this last write never leaves the device.
            void applyPageMetadata(String(pageId), request.metadata).catch(() => undefined);
            if (isOnline()) {
                try {
                    const result = remote.documents.flushPageOperations(pageId, request);
                    if (result && typeof (result as Promise<unknown>).then === "function") {
                        // The keepalive transport rejects asynchronously: without
                        // this catch the final batch of a session would be lost
                        // with no outbox entry, because the caller swallows the
                        // returned promise.
                        return (result as Promise<unknown>).catch((error: unknown) => {
                            if (!isOfflineError(error)) throw error;
                            return queueDocument(String(pageId), "document.apply", request);
                        });
                    }
                    return result;
                } catch (error) {
                    if (!isOfflineError(error)) throw error;
                }
            }
            return queueDocument(String(pageId), "document.apply", request);
        },

        async claimPageSeed(request) {
            const claimed = await tryRemote("documents.claimPageSeed", () => remote.documents.claimPageSeed(request));
            return claimed ?? true;
        },

        releasePageSeed(request) {
            if (!isOnline()) return undefined;
            try {
                const result = remote.documents.releasePageSeed(request);
                return result && typeof (result as Promise<unknown>).then === "function"
                    ? (result as Promise<unknown>).catch(() => undefined)
                    : result;
            } catch (error) {
                if (isOfflineError(error)) return undefined;
                throw error;
            }
        },
    };

    const service: LocalFirstSpacePageService = {
        spaces: degradeNamespace("spaces", spaces),
        pages: degradeNamespace("pages", pages),
        // Cloud-only feature areas, delegated wholesale on purpose: an offline
        // answer would be fabricated, and the pre-existing error surface
        // (toast + retry) is the honest behaviour.
        templates: remote.templates,
        members: remote.members,
        collaboration: remote.collaboration,
        shares: remote.shares,
        comments: remote.comments,
        tags: remote.tags,
        activity: remote.activity,
        relations: degradeNamespace("relations", relations),
        documents: degradeNamespace("documents", documents),
        changes,
        local,
        remote,
        durable: local.durable,
        get offline() {
            return observedOffline || !isOnline();
        },
        get degraded() {
            return !localUsable;
        },
        async info() {
            try {
                return await local.info();
            } catch {
                return {
                    engine: "unavailable" as const,
                    durable: false,
                    schemaVersion: 0,
                    spaces: 0,
                    pages: 0,
                    blocks: 0,
                    documents: 0,
                    checkpoints: 0,
                    pendingChanges: 0,
                };
            }
        },
    };

    return service;
};
