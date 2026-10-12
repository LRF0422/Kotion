/**
 * Runtime checks for the local-first service + sync engine.
 *
 * The cloud side is a fake `SpacePageService` that records every call and
 * answers from a reply table, so "did this read go to the network?" is an
 * assertion instead of a guess. The local side is a contract-faithful in-memory
 * `SpacePageLocalStore` — including the two rules the real SQLite store
 * enforces (a dirty row survives a clean upsert; an outbox entry may coalesce).
 *
 * Run with: pnpm --filter @kn/core check:local-first
 */

import { createLocalFirstSpacePageService } from "./service";
import { createLocalFirstSyncEngine } from "./sync";
import { LocalStoreError, type SpacePageLocalStore } from "@kn/common";

/**
 * The in-memory fake answers synchronously (no `await` noise in the cases) while
 * the real store crosses IPC and is async; the service awaits either way. The
 * cast states that intent instead of scattering `async` over a test double.
 */
const asLocal = (store: MemoryLocalStore): SpacePageLocalStore => store as unknown as SpacePageLocalStore;

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

let pass = 0;
let fail = 0;

const check = (name: string, condition: boolean, actual?: unknown): void => {
    if (condition) {
        pass += 1;
        console.log("  ok   " + name);
    } else {
        fail += 1;
        console.log("  FAIL " + name + (actual === undefined ? "" : "  -> " + JSON.stringify(actual)));
    }
};

const checkEqual = (name: string, actual: unknown, expected: unknown): void => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    check(name + (ok ? "" : ` (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`), ok);
};

const online = (): boolean => true;
const offline = (): boolean => false;

// ---------------------------------------------------------------------------
// In-memory SpacePageLocalStore
// ---------------------------------------------------------------------------

const META_KEYS = ["localUpdatedAt", "remoteUpdatedAt", "dirty", "deleted", "rank", "personal"];

const host = (record: Record<string, unknown>): Record<string, unknown> => {
    const copy: Record<string, unknown> = { ...record };
    for (const key of META_KEYS) delete copy[key];
    return copy;
};

const replaceExact = (value: unknown, from: string, to: string): unknown => {
    if (value === from) return to;
    if (Array.isArray(value)) return value.map((item) => replaceExact(item, from, to));
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            out[key] = replaceExact(item, from, to);
        }
        return out;
    }
    return value;
};

class MemoryLocalStore {
    durable = false;
    readonly spaces = new Map<string, any>();
    readonly pages = new Map<string, any>();
    readonly blocks = new Map<string, any>();
    readonly documents = new Map<string, any>();
    readonly outbox: any[] = [];
    readonly state = new Map<string, unknown>();
    /** Every upsert that was skipped because the row had a queued edit. */
    readonly preserved: string[] = [];
    private seq = 0;
    private clock = 1_000_000;

    private stamp(): number {
        return (this.clock += 1000);
    }

    info(): any {
        return {
            engine: "memory",
            durable: false,
            schemaVersion: 2,
            spaces: this.spaces.size,
            pages: this.pages.size,
            blocks: this.blocks.size,
            documents: this.documents.size,
            pendingChanges: this.outbox.length,
        };
    }

    getSpace(id: string): any {
        return this.spaces.get(id) ?? null;
    }

    listSpaces(query: any = {}): any[] {
        return [...this.spaces.values()]
            .filter((row) => (query.includeDeleted ? true : !row.deleted))
            .filter((row) => (query.type ? row.type === query.type : true))
            .filter((row) => (query.favorite === undefined ? true : Boolean(row.favorite) === query.favorite))
            .filter((row) => (query.personal === undefined ? true : Boolean(row.personal) === query.personal))
            .filter((row) => (query.archived === undefined ? true : Boolean(row.archived) === query.archived))
            .filter((row) => (query.search ? String(row.name ?? "").includes(query.search) : true))
            .slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 1000));
    }

    countSpaces(query: any = {}): number {
        const { limit, offset, ...rest } = query;
        return this.listSpaces(rest).length;
    }

    upsertSpaces(records: any[]): number {
        let affected = 0;
        for (const record of records) {
            const existing = this.spaces.get(record.id);
            if (existing && existing.dirty && !record.dirty) {
                this.preserved.push(`space:${record.id}`);
                if (record.remoteUpdatedAt != null) existing.remoteUpdatedAt = record.remoteUpdatedAt;
                continue;
            }
            this.spaces.set(record.id, { ...record, localUpdatedAt: record.localUpdatedAt ?? this.stamp() });
            affected += 1;
        }
        return affected;
    }

    deleteSpaces(ids: string[]): number {
        let affected = 0;
        for (const id of ids) {
            const row = this.spaces.get(id);
            if (!row) continue;
            if (row.dirty) {
                this.spaces.delete(id);
                this.dropOutbox(id);
            } else {
                this.spaces.set(id, { ...row, deleted: true });
            }
            affected += 1;
        }
        return affected;
    }

    remapSpace(from: string, to: string): { affected: number } {
        let affected = 0;
        const row = this.spaces.get(from);
        if (row) {
            this.spaces.delete(from);
            this.spaces.set(to, { ...row, id: to });
            affected += 1;
        }
        for (const [id, page] of this.pages) {
            if (page.spaceId === from) {
                this.pages.set(id, { ...page, spaceId: to });
                affected += 1;
            }
        }
        for (const [id, block] of this.blocks) {
            if (block.spaceId === from) {
                this.blocks.set(id, { ...block, spaceId: to });
                affected += 1;
            }
        }
        this.rewriteOutbox(from, to);
        return { affected };
    }

    getPage(id: string): any {
        return this.pages.get(id) ?? null;
    }

    listPages(query: any = {}): any[] {
        const rows = [...this.pages.values()]
            .filter((row) => (query.includeDeleted ? true : !row.deleted))
            .filter((row) => (query.spaceId === undefined ? true : row.spaceId === query.spaceId))
            .filter((row) => {
                if (query.parentId === undefined || query.parentId === "*") return true;
                const parent = row.parentId ?? null;
                if (query.parentId === "root" || query.parentId === null) return parent === null;
                return parent === query.parentId;
            })
            .filter((row) => (query.status === undefined ? true : row.status === query.status))
            .filter((row) => (query.favorite === undefined ? true : Boolean(row.favorite) === query.favorite))
            .filter((row) => (query.pinned === undefined ? true : Boolean(row.pinned) === query.pinned))
            .filter((row) => (query.search ? String(row.title ?? "").includes(query.search) : true));
        const ordered = query.orderBy === "updated"
            ? [...rows].sort((a, b) => Number(b.remoteUpdatedAt ?? b.localUpdatedAt ?? 0) - Number(a.remoteUpdatedAt ?? a.localUpdatedAt ?? 0))
            : [...rows].sort((a, b) => Number(a.rank ?? 0) - Number(b.rank ?? 0) || String(a.id).localeCompare(String(b.id)));
        return ordered.slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 1000));
    }

    countPages(query: any = {}): number {
        const { limit, offset, ...rest } = query;
        return this.listPages(rest).length;
    }

    upsertPages(records: any[]): number {
        let affected = 0;
        for (const record of records) {
            const existing = this.pages.get(record.id);
            if (existing && existing.dirty && !record.dirty) {
                this.preserved.push(`page:${record.id}`);
                if (record.remoteUpdatedAt != null) existing.remoteUpdatedAt = record.remoteUpdatedAt;
                continue;
            }
            this.pages.set(record.id, { ...record, localUpdatedAt: record.localUpdatedAt ?? this.stamp() });
            affected += 1;
        }
        return affected;
    }

    deletePages(ids: string[]): number {
        let affected = 0;
        for (const id of ids) {
            const row = this.pages.get(id);
            if (!row) continue;
            if (row.dirty) {
                this.pages.delete(id);
                this.documents.delete(id);
                this.dropOutbox(id);
            } else {
                this.pages.set(id, { ...row, deleted: true });
            }
            affected += 1;
        }
        return affected;
    }

    remapPage(from: string, to: string): { affected: number } {
        let affected = 0;
        const row = this.pages.get(from);
        if (row) {
            this.pages.delete(from);
            this.pages.set(to, { ...row, id: to });
            affected += 1;
        }
        for (const [id, page] of this.pages) {
            if (page.parentId === from) {
                this.pages.set(id, { ...page, parentId: to });
                affected += 1;
            }
        }
        for (const [id, block] of this.blocks) {
            if (block.pageId === from) {
                this.blocks.set(id, { ...block, pageId: to });
                affected += 1;
            }
        }
        const doc = this.documents.get(from);
        if (doc) {
            this.documents.delete(from);
            this.documents.set(to, { ...doc, pageId: to });
            affected += 1;
        }
        this.rewriteOutbox(from, to);
        return { affected };
    }

    getDocument(pageId: string): any {
        return this.documents.get(pageId) ?? null;
    }

    upsertDocument(record: any): void {
        const existing = this.documents.get(record.pageId);
        if (existing && existing.dirty && !record.dirty) {
            this.preserved.push(`document:${record.pageId}`);
            return;
        }
        this.documents.set(record.pageId, { ...record, localUpdatedAt: record.localUpdatedAt ?? this.stamp() });
    }

    getBlock(id: string): any {
        return this.blocks.get(id) ?? null;
    }

    listBlocks(query: any = {}): any[] {
        const rows = [...this.blocks.values()]
            .filter((row) => (query.includeDeleted ? true : !row.deleted))
            .filter((row) => (query.pageId === undefined ? true : row.pageId === query.pageId))
            .filter((row) => (query.spaceId === undefined ? true : row.spaceId === query.spaceId))
            .filter((row) =>
                query.search
                    ? String(row.text ?? "").toLowerCase().includes(String(query.search).toLowerCase())
                    : true,
            );
        return rows.slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 1000));
    }

    countBlocks(query: any = {}): number {
        const { limit, offset, ...rest } = query;
        return this.listBlocks(rest).length;
    }

    upsertBlocks(records: any[]): number {
        let affected = 0;
        for (const record of records) {
            const existing = this.blocks.get(record.id);
            if (existing && existing.dirty && !record.dirty) continue;
            this.blocks.set(record.id, { ...record, localUpdatedAt: record.localUpdatedAt ?? this.stamp() });
            affected += 1;
        }
        return affected;
    }

    deleteBlocks(ids: string[]): number {
        let affected = 0;
        for (const id of ids) {
            const row = this.blocks.get(id);
            if (!row) continue;
            if (row.dirty) this.blocks.delete(id);
            else this.blocks.set(id, { ...row, deleted: true });
            affected += 1;
        }
        return affected;
    }

    enqueue(entries: any[]): number[] {
        const ids: number[] = [];
        for (const entry of entries) {
            const id = ++this.seq;
            const existing = entry.coalesceKey
                ? this.outbox.find((row) => row.coalesceKey === entry.coalesceKey && row.state !== "done")
                : undefined;
            if (existing) {
                Object.assign(existing, { ...entry, id: existing.id, state: "pending", attempts: 0, lastError: null });
                ids.push(existing.id);
                continue;
            }
            this.outbox.push({ ...entry, id, state: "pending", attempts: 0, lastError: null, createdAt: id, updatedAt: id });
            ids.push(id);
        }
        return ids;
    }

    listOutbox(query: any = {}): any[] {
        return this.outbox
            .filter((row) => (query.state === undefined ? true : row.state === query.state))
            .filter((row) => (query.entityId === undefined ? true : row.entityId === query.entityId))
            .slice(0, query.limit ?? 1000);
    }

    countOutbox(state?: string): number {
        return this.outbox.filter((row) => (state === undefined ? true : row.state === state)).length;
    }

    ackOutbox(ids: number[]): number {
        let affected = 0;
        for (const id of ids) {
            const index = this.outbox.findIndex((row) => row.id === id);
            if (index >= 0) {
                this.outbox.splice(index, 1);
                affected += 1;
            }
        }
        return affected;
    }

    failOutbox(id: number, error: string): void {
        const row = this.outbox.find((entry) => entry.id === id);
        if (!row) return;
        row.state = "failed";
        row.attempts += 1;
        row.lastError = error;
    }

    retryOutbox(ids?: number[]): number {
        let affected = 0;
        for (const row of this.outbox) {
            if (row.state !== "failed") continue;
            if (ids && !ids.includes(row.id)) continue;
            row.state = "pending";
            row.lastError = null;
            affected += 1;
        }
        return affected;
    }

    markSynced(entity: string, ids: string[]): number {
        const map: Record<string, Map<string, any>> = {
            space: this.spaces,
            page: this.pages,
            block: this.blocks,
            document: this.documents,
        };
        let affected = 0;
        const table = map[entity];
        if (!table) return 0;
        for (const id of ids) {
            const row = table.get(id);
            if (!row) continue;
            table.set(id, { ...row, dirty: false });
            affected += 1;
        }
        return affected;
    }

    getState<T>(key: string): T | null {
        return (this.state.get(key) as T) ?? null;
    }

    setState(key: string, value: unknown): void {
        this.state.set(key, value);
    }

    clear(): void {
        this.spaces.clear();
        this.pages.clear();
        this.blocks.clear();
        this.documents.clear();
        this.outbox.length = 0;
        this.state.clear();
    }

    private dropOutbox(entityId: string): void {
        for (let index = this.outbox.length - 1; index >= 0; index -= 1) {
            if (this.outbox[index].entityId === entityId) this.outbox.splice(index, 1);
        }
    }

    private rewriteOutbox(from: string, to: string): void {
        for (const row of this.outbox) {
            if (row.entityId === from) row.entityId = to;
            row.payload = replaceExact(row.payload, from, to);
        }
    }
}

// ---------------------------------------------------------------------------
// Fake cloud SpacePageService
// ---------------------------------------------------------------------------

interface FakeRemote {
    service: any;
    calls: string[];
    callArgs: any[][];
    replies: Map<string, (...args: any[]) => unknown>;
    reset(): void;
}

const makeRemote = (): FakeRemote => {
    const calls: string[] = [];
    const callArgs: any[][] = [];
    const replies = new Map<string, (...args: any[]) => unknown>();

    const fn = (path: string) => async (...args: any[]): Promise<unknown> => {
        calls.push(path);
        callArgs.push(args);
        const reply = replies.get(path);
        if (!reply) throw new Error(`not stubbed: ${path}`);
        return reply(...args);
    };

    const service = {
        spaces: {
            getSpace: fn("spaces.getSpace"),
            getPersonalSpace: fn("spaces.getPersonalSpace"),
            querySpaces: fn("spaces.querySpaces"),
            createSpace: fn("spaces.createSpace"),
            updateSpace: fn("spaces.updateSpace"),
            archiveSpace: fn("spaces.archiveSpace"),
            unarchiveSpace: fn("spaces.unarchiveSpace"),
            deleteSpace: fn("spaces.deleteSpace"),
            toggleSpaceFavorite: fn("spaces.toggleSpaceFavorite"),
        },
        pages: {
            getPage: fn("pages.getPage"),
            getPageMetadata: fn("pages.getPageMetadata"),
            getPageTree: fn("pages.getPageTree"),
            queryPages: fn("pages.queryPages"),
            queryRecentPages: fn("pages.queryRecentPages"),
            queryFavoritePages: fn("pages.queryFavoritePages"),
            createPage: fn("pages.createPage"),
            updatePageTitle: fn("pages.updatePageTitle"),
            movePage: fn("pages.movePage"),
            movePageToTrash: fn("pages.movePageToTrash"),
            restorePageFromTrash: fn("pages.restorePageFromTrash"),
            favoritePage: fn("pages.favoritePage"),
            unfavoritePage: fn("pages.unfavoritePage"),
            togglePagePin: fn("pages.togglePagePin"),
            getPinnedPages: fn("pages.getPinnedPages"),
        },
        templates: {},
        members: {},
        collaboration: {},
        shares: {},
        comments: {},
        tags: {},
        activity: {},
        relations: {
            queryPageRelations: fn("relations.queryPageRelations"),
            getSpaceGraph: fn("relations.getSpaceGraph"),
            queryBlocks: fn("relations.queryBlocks"),
            queryBlocksPage: fn("relations.queryBlocksPage"),
            getBlock: fn("relations.getBlock"),
            searchBlocks: fn("relations.searchBlocks"),
        },
        documents: {
            getPageDocument: fn("documents.getPageDocument"),
            getPageHistory: fn("documents.getPageHistory"),
            getPageHistoryDocument: fn("documents.getPageHistoryDocument"),
            createPageCheckpoint: fn("documents.createPageCheckpoint"),
            restorePageRevision: fn("documents.restorePageRevision"),
            claimPageSession: fn("documents.claimPageSession"),
            heartbeatPageSession: fn("documents.heartbeatPageSession"),
            releasePageSession: fn("documents.releasePageSession"),
            applyPageOperations: fn("documents.applyPageOperations"),
            reconcilePageDocument: fn("documents.reconcilePageDocument"),
            flushPageOperations: fn("documents.flushPageOperations"),
            claimPageSeed: fn("documents.claimPageSeed"),
            releasePageSeed: fn("documents.releasePageSeed"),
        },
        changes: { emit() {}, publish() {}, subscribe: () => () => {} },
    };

    return {
        service,
        calls,
        callArgs,
        replies,
        reset() {
            calls.length = 0;
            callArgs.length = 0;
            replies.clear();
        },
    };
};

const networkError = (): Error => Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
const rejected = (): Error => Object.assign(new Error("Request failed with status code 422"), { response: { status: 422 } });

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const pageRecord = (id: string, overrides: Record<string, unknown> = {}): any => ({
    id,
    spaceId: "s1",
    parentId: null,
    title: `Page ${id}`,
    ...overrides,
});

async function offlineBehaviour(): Promise<void> {
    console.log("\nOffline: reads come from the cache, writes from the outbox");
    const local = new MemoryLocalStore();
    const remote = makeRemote();
    const changes: string[] = [];
    const service = createLocalFirstSpacePageService({ local: asLocal(local), remote: remote.service, isOnline: offline });
    service.changes.subscribe((change: any) => changes.push(change.type));

    const created: any = await service.pages.createPage({ spaceId: "s1", title: "Offline page" });
    check("an offline createPage gets a temporary id", String(created.id).startsWith("local-page-"), created.id);
    checkEqual("the page is cached immediately", local.getPage(created.id)?.title, "Offline page");
    check("the cached page is marked dirty", local.getPage(created.id)?.dirty === true);
    checkEqual("one create is queued", local.listOutbox().map((entry) => entry.kind), ["page.create"]);
    checkEqual("no cloud call was made", remote.calls.length, 0);
    checkEqual("the create emits a change", changes, ["page.created", "page.tree.changed"]);

    const withContent: any = await service.pages.createPage({ spaceId: "s1", title: "With body", content: { type: "doc" } });
    checkEqual(
        "an offline create with content caches its document",
        local.getDocument(withContent.id)?.doc,
        { type: "doc" },
    );

    local.upsertPages([pageRecord("p1", { dirty: false })]);
    await service.pages.updatePageTitle({ pageId: "p1", title: "Renamed offline" });
    checkEqual("the title is written locally", local.getPage("p1")?.title, "Renamed offline");
    checkEqual("the title is queued", local.listOutbox({ state: "pending" }).at(-1)?.kind, "page.title");
    check("the rename emits page.updated", changes.includes("page.updated"));

    await service.pages.movePage({ pageId: "p1", targetParentId: "p0", targetSpaceId: "s2" });
    checkEqual("the move is reflected locally", [local.getPage("p1")?.spaceId, local.getPage("p1")?.parentId], ["s2", "p0"]);
    checkEqual("the move is queued", local.listOutbox({ state: "pending" }).at(-1)?.kind, "page.move");

    await service.pages.togglePagePin("s2", "p1");
    checkEqual("the pin flips locally", local.getPage("p1")?.pinned, true);

    await service.spaces.updateSpace({ id: "s9", name: "Offline space" } as any);
    checkEqual("a space edit is cached", local.getSpace("s9")?.name, "Offline space");
    checkEqual("a space edit is queued", local.listOutbox({ state: "pending" }).at(-1)?.kind, "space.update");

    local.upsertPages([pageRecord("p2", { dirty: false }), pageRecord("p3", { parentId: "p2", dirty: false })]);
    const tree: any = await service.pages.getPageTree({ spaceId: "s1" });
    checkEqual("the tree is built from cached pages", tree.length >= 1, true);
    const roots = tree.map((node: any) => node.id);
    check("cached roots are present", roots.includes("p2"), roots);
    checkEqual("children are nested", tree.find((node: any) => node.id === "p2")?.children?.[0]?.id, "p3");
    checkEqual("building the tree made no cloud call", remote.calls.length, 0);

    local.upsertBlocks([
        { id: "b1", pageId: "p1", spaceId: "s2", text: "Hello local-first" },
        { id: "b2", pageId: "p1", spaceId: "s2", text: "Other" },
    ]);
    const blocks: any = await service.relations.queryBlocksPage({ pageId: "p1" });
    checkEqual("blocks are served from the cache", blocks.records.length, 2);
    checkEqual("block totals are local", blocks.total, 2);
    const hits: any = await service.relations.searchBlocks({ spaceId: "s2", keyword: "local" });
    checkEqual("offline block search is a local text search", hits.map((block: any) => block.id), ["b1"]);

    let uncachedDocument: any;
    try {
        await service.documents.getPageDocument("p1");
    } catch (error) {
        uncachedDocument = error;
    }
    check("a missing document with no network rejects as unavailable", uncachedDocument instanceof LocalStoreError, uncachedDocument);

    const queued: any = await service.documents.applyPageOperations("p1", {
        baseRev: 3,
        idempotencyKey: "k1",
        clientId: "c1",
        ops: [{ op: "insert", blockId: "b1" }],
    } as any);
    checkEqual("an offline document edit is queued", queued.metadata?.queued, true);
    checkEqual("and it carries no server revision", queued.rev, undefined);
    checkEqual("a document.apply entry is in the outbox", local.listOutbox({ state: "pending" }).at(-1)?.kind, "document.apply");

    const session: any = await service.documents.claimPageSession({ pageId: "p1", clientId: "c1" } as any);
    checkEqual("offline, the local editor is the host", session.role, "HOST");
    checkEqual("and it says so", session.metadata?.offline, true);

    local.upsertSpaces([{ id: "s3", name: "Personal", type: "PERSONAL", personal: true }]);
    const personal: any = await service.spaces.getPersonalSpace();
    checkEqual("the personal space is resolvable offline", personal.id, "s3");

    let unavailable: any;
    try {
        await service.spaces.getSpace("never-seen");
    } catch (error) {
        unavailable = error;
    }
    check("an uncached space with no network throws a coded error", unavailable instanceof LocalStoreError, unavailable);
    checkEqual("with the unavailable code", unavailable?.code, "LOCAL_STORE_UNAVAILABLE");
}

async function onlineBehaviour(): Promise<void> {
    console.log("\nOnline: reads are local-first, cache misses fill the cache");
    const local = new MemoryLocalStore();
    const remote = makeRemote();
    const service = createLocalFirstSpacePageService({ local: asLocal(local), remote: remote.service, isOnline: online });

    remote.replies.set("spaces.querySpaces", () => ({
        records: [
            { id: "s1", name: "Team" },
            { id: "sp2", name: "Mine", type: "PERSONAL" },
        ],
        total: 2,
        current: 1,
        pageSize: 20,
    }));
    const first: any = await service.spaces.querySpaces({ pageSize: 20 });
    checkEqual("a cold space list comes from the cloud", first.records.length, 2);
    checkEqual("the cloud was asked once", remote.calls.filter((call) => call === "spaces.querySpaces").length, 1);
    const second: any = await service.spaces.querySpaces({ pageSize: 20 });
    checkEqual("the warm space list is local", second.records.length, 2);
    checkEqual("and makes no second call", remote.calls.filter((call) => call === "spaces.querySpaces").length, 1);
    check("the personal space is remembered", local.getSpace("sp2")?.personal === true);

    remote.replies.set("pages.getPage", () => pageRecord("p1"));
    const miss: any = await service.pages.getPage("p1");
    checkEqual("a cache miss reads through to the cloud", miss.id, "p1");
    check("and caches what it read", local.getPage("p1") !== null);
    check("as non-dirty", local.getPage("p1")?.dirty === false);
    remote.calls.length = 0;
    await service.pages.getPage("p1");
    checkEqual("the next read is served locally", remote.calls.length, 0);

    remote.replies.set("pages.createPage", (request: any) => ({ id: "p-cloud", spaceId: request.spaceId, title: request.title }));
    const created: any = await service.pages.createPage({ spaceId: "s1", title: "Cloud page" });
    checkEqual("an online create keeps the cloud id", created.id, "p-cloud");
    checkEqual("nothing is queued for it", local.countOutbox(), 0);

    // A metadata write always lands locally first and is pushed by the engine,
    // so the UI never waits for the network even when there is one.
    await service.pages.updatePageTitle({ pageId: "p-cloud", title: "Renamed" });
    checkEqual("an online rename is queued for the engine", local.countOutbox("pending"), 1);
    checkEqual("while the local row already shows it", local.getPage("p-cloud")?.title, "Renamed");

    console.log("\nOnline-then-offline: a network failure degrades to the cache");
    const degraded = new MemoryLocalStore();
    const flaky = makeRemote();
    const failing = createLocalFirstSpacePageService({
        local: asLocal(degraded),
        remote: flaky.service,
        isOnline: online,
    });
    degraded.upsertSpaces([{ id: "s1", name: "Cached team" }]);
    flaky.replies.set("spaces.getSpace", () => {
        throw networkError();
    });
    let degradeError: any;
    try {
        await failing.spaces.getSpace("never-seen");
    } catch (error) {
        degradeError = error;
    }
    check("a cache miss with a dead network throws a coded error", degradeError instanceof LocalStoreError, degradeError);
    check("the service reports itself offline afterwards", failing.offline === true);
    const cachedList: any = await failing.spaces.querySpaces();
    checkEqual("while cached reads keep working", cachedList.records[0]?.name, "Cached team");

    console.log("\nPartial rows (from a tree/list) are refreshed before a full read");
    const partialLocal = new MemoryLocalStore();
    const partialRemote = makeRemote();
    const partialService = createLocalFirstSpacePageService({
        local: asLocal(partialLocal),
        remote: partialRemote.service,
        isOnline: online,
    });
    partialLocal.upsertPages([{ ...pageRecord("p1"), dirty: false, partial: true }]);
    partialRemote.replies.set("pages.getPage", () => ({ ...pageRecord("p1"), permission: "WRITE" }));
    const full: any = await partialService.pages.getPage("p1");
    checkEqual("a partial row triggers a full read", partialRemote.calls, ["pages.getPage"]);
    checkEqual("the full record is returned", full.permission, "WRITE");
    checkEqual("and cached as complete", Boolean(partialLocal.getPage("p1")?.partial), false);
    partialRemote.calls.length = 0;
    await partialService.pages.getPage("p1");
    checkEqual("the next read is local again", partialRemote.calls.length, 0);

    const partialOfflineLocal = new MemoryLocalStore();
    const partialOfflineService = createLocalFirstSpacePageService({
        local: asLocal(partialOfflineLocal),
        remote: makeRemote().service,
        isOnline: offline,
    });
    partialOfflineLocal.upsertPages([{ ...pageRecord("p2", { title: "From tree" }), dirty: false, partial: true }]);
    const degradedPage: any = await partialOfflineService.pages.getPage("p2");
    checkEqual("offline, a partial row still answers", degradedPage.title, "From tree");

    const dirtyPartialLocal = new MemoryLocalStore();
    const dirtyPartialRemote = makeRemote();
    dirtyPartialLocal.upsertPages([
        { ...pageRecord("p3", { title: "Local rename", dirty: true }), partial: true },
    ]);
    dirtyPartialRemote.replies.set("pages.getPage", () => ({
        ...pageRecord("p3", { title: "Server title" }),
        permission: "ADMIN",
    }));
    const merged: any = await createLocalFirstSpacePageService({
        local: asLocal(dirtyPartialLocal),
        remote: dirtyPartialRemote.service,
        isOnline: online,
    }).pages.getPage("p3");
    checkEqual("a queued local title wins over the fetched one", merged.title, "Local rename");
    checkEqual("while the fetched extra fields are kept", merged.permission, "ADMIN");
    checkEqual("and the row stays dirty", dirtyPartialLocal.getPage("p3")?.dirty, true);

    const empty = new MemoryLocalStore();
    const alsoEmpty = makeRemote();
    alsoEmpty.replies.set("spaces.querySpaces", () => {
        throw networkError();
    });
    const nothing = createLocalFirstSpacePageService({ local: asLocal(empty), remote: alsoEmpty.service, isOnline: online });
    let emptyError: any;
    try {
        await nothing.spaces.querySpaces();
    } catch (error) {
        emptyError = error;
    }
    check("an empty cache plus a dead network is an explicit failure", emptyError instanceof LocalStoreError, emptyError);

    const strict = new MemoryLocalStore();
    const rejecting = makeRemote();
    rejecting.replies.set("spaces.querySpaces", () => {
        throw rejected();
    });
    const strictService = createLocalFirstSpacePageService({ local: asLocal(strict), remote: rejecting.service, isOnline: online });
    let strictError: any;
    try {
        await strictService.spaces.querySpaces();
    } catch (error) {
        strictError = error;
    }
    check("a 4xx is NOT treated as offline", strictError instanceof LocalStoreError === false, strictError);
    checkEqual("the real error survives", (strictError as Error)?.message, "Request failed with status code 422");

    console.log("\nA space tree is only served locally once it has been pulled");
    const treeLocal = new MemoryLocalStore();
    const treeRemote = makeRemote();
    const treeService = createLocalFirstSpacePageService({
        local: treeLocal,
        remote: treeRemote.service,
        isOnline: online,
    });
    // One row for the space, but from a *summary* source: not a tree.
    treeLocal.upsertPages([{ ...pageRecord("only-one", { spaceId: "s7" }), dirty: false, partial: true }]);
    treeRemote.replies.set("pages.getPageTree", () => [
        { id: "only-one", spaceId: "s7", title: "Server page", children: [{ id: "child", spaceId: "s7", title: "Child" }] },
    ]);
    const fetchedTree: any = await treeService.pages.getPageTree({ spaceId: "s7" });
    checkEqual("an unmarked space goes to the cloud", treeRemote.calls, ["pages.getPageTree"]);
    checkEqual("the cloud tree is returned", fetchedTree[0]?.children?.[0]?.id, "child");
    checkEqual("the fetched nodes are cached", treeLocal.getPage("child") !== null, true);
    checkEqual("the tree is marked as synced", treeLocal.getState("pageTree.synced.s7") != null, true);

    treeRemote.calls.length = 0;
    const cachedTree: any = await treeService.pages.getPageTree({ spaceId: "s7" });
    checkEqual("the next tree read is local", treeRemote.calls.length, 0);
    checkEqual("and contains the cached child", cachedTree[0]?.children?.[0]?.id, "child");

    const scopedLocal = new MemoryLocalStore();
    const scopedRemote = makeRemote();
    const scopedService = createLocalFirstSpacePageService({
        local: scopedLocal,
        remote: scopedRemote.service,
        isOnline: online,
    });
    scopedLocal.upsertPages([{ ...pageRecord("solo", { spaceId: "s8" }), dirty: false, partial: true }]);
    scopedRemote.replies.set("pages.queryPages", () => ({ records: [], total: 0, current: 1, pageSize: 20 }));
    await scopedService.pages.queryPages({ spaceId: "s8" });
    checkEqual("a space-scoped list follows the same rule", scopedRemote.calls, ["pages.queryPages"]);
}

async function syncBehaviour(): Promise<void> {
    console.log("\nSync: the outbox is replayed in order");
    const local = new MemoryLocalStore();
    const remote = makeRemote();
    remote.replies.set("pages.updatePageTitle", () => undefined);
    remote.replies.set("pages.movePage", () => undefined);
    // The pull half of a sync must have answers too, otherwise it would be the
    // unstubbed call that shows up in the log.
    remote.replies.set("spaces.querySpaces", () => ({ records: [], total: 0, current: 1, pageSize: 200 }));
    remote.replies.set("pages.queryRecentPages", () => ({ records: [], total: 0, current: 1, pageSize: 100 }));

    local.upsertPages([pageRecord("p1")]);
    await local.enqueue([
        { kind: "page.title", entity: "page", entityId: "p1", payload: { pageId: "p1", title: "A" }, coalesceKey: "page.title:p1" },
        { kind: "page.move", entity: "page", entityId: "p1", payload: { pageId: "p1", targetSpaceId: "s2", targetParentId: null }, coalesceKey: "page.move:p1" },
    ]);
    local.pages.set("p1", { ...local.getPage("p1"), dirty: true });

    const engine = createLocalFirstSyncEngine({ local: asLocal(local), remote: remote.service, isOnline: online, intervalMs: 0 });
    const state = await engine.syncNow();
    checkEqual(
        "both entries were replayed, in order",
        remote.calls.filter((call) => call === "pages.updatePageTitle" || call === "pages.movePage"),
        ["pages.updatePageTitle", "pages.movePage"],
    );
    checkEqual("the outbox is empty", local.countOutbox(), 0);
    checkEqual("the row is no longer dirty", local.getPage("p1")?.dirty, false);
    checkEqual("the state reports no pending work", state.pending, 0);
    check("the state records the sync time", typeof state.lastSyncAt === "number");

    console.log("\nSync: a page created offline is re-keyed onto the cloud id");
    const remapLocal = new MemoryLocalStore();
    const remapRemote = makeRemote();
    remapRemote.replies.set("pages.createPage", () => ({ id: "p-real", spaceId: "s1", title: "New" }));
    remapRemote.replies.set("pages.updatePageTitle", () => undefined);
    remapLocal.upsertPages([pageRecord("local-page-9", { title: "New", dirty: true })]);
    await remapLocal.enqueue([
        { kind: "page.create", entity: "page", entityId: "local-page-9", payload: { id: "local-page-9", localId: "local-page-9", spaceId: "s1", title: "New" }, coalesceKey: "page.create:local-page-9" },
    ]);
    const remapEngine = createLocalFirstSyncEngine({ local: asLocal(remapLocal), remote: remapRemote.service, isOnline: online, intervalMs: 0 });
    await remapEngine.flushNow();
    checkEqual("the create was pushed", remapRemote.calls, ["pages.createPage"]);
    checkEqual("the row is now under the cloud id", remapLocal.getPage("p-real")?.title, "New");
    checkEqual("the temporary id is gone", remapLocal.getPage("local-page-9"), null);
    checkEqual("the queued create is acknowledged", remapLocal.countOutbox(), 0);

    const chainLocal = new MemoryLocalStore();
    const chainRemote = makeRemote();
    chainRemote.replies.set("pages.createPage", () => ({ id: "p-real", spaceId: "s1", title: "New" }));
    chainRemote.replies.set("pages.updatePageTitle", () => undefined);
    chainLocal.upsertPages([pageRecord("local-page-7", { title: "New", dirty: true })]);
    await chainLocal.enqueue([
        { kind: "page.create", entity: "page", entityId: "local-page-7", payload: { id: "local-page-7", localId: "local-page-7", spaceId: "s1", title: "New" }, coalesceKey: "page.create:local-page-7" },
        { kind: "page.title", entity: "page", entityId: "local-page-7", payload: { pageId: "local-page-7", title: "Renamed" }, coalesceKey: "page.title:local-page-7" },
    ]);
    const chainEngine = createLocalFirstSyncEngine({ local: asLocal(chainLocal), remote: chainRemote.service, isOnline: online, intervalMs: 0 });
    await chainEngine.flushNow();
    checkEqual("a later edit follows the create onto the real id", chainRemote.calls, ["pages.createPage", "pages.updatePageTitle"]);
    checkEqual("the rename targeted the cloud id", chainRemote.callArgs[1][0]?.pageId, "p-real");
    checkEqual("and the queue drained", chainLocal.countOutbox(), 0);

    console.log("\nSync: failures keep the queue honest");
    const offlineLocal = new MemoryLocalStore();
    const offlineRemote = makeRemote();
    offlineRemote.replies.set("pages.updatePageTitle", () => {
        throw networkError();
    });
    offlineLocal.upsertPages([pageRecord("p1")]);
    await offlineLocal.enqueue([
        { kind: "page.title", entity: "page", entityId: "p1", payload: { pageId: "p1", title: "A" }, coalesceKey: "page.title:p1" },
        { kind: "page.move", entity: "page", entityId: "p1", payload: { pageId: "p1", targetSpaceId: "s2" }, coalesceKey: "page.move:p1" },
    ]);
    const offlineEngine = createLocalFirstSyncEngine({
        local: asLocal(offlineLocal),
        remote: offlineRemote.service,
        isOnline: online,
        intervalMs: 0,
        hasSession: () => true,
    });
    await offlineEngine.flushNow();
    checkEqual("a connectivity failure stops the walk", offlineRemote.calls, ["pages.updatePageTitle"]);
    checkEqual("the entry stays pending", offlineLocal.countOutbox("pending"), 2);
    check("no entry was marked failed", offlineLocal.countOutbox("failed") === 0);
    check("the state records the network error", typeof offlineEngine.state().lastError === "string");

    const permanentLocal = new MemoryLocalStore();
    const permanentRemote = makeRemote();
    permanentRemote.replies.set("pages.updatePageTitle", () => {
        throw rejected();
    });
    permanentRemote.replies.set("pages.movePage", () => undefined);
    permanentLocal.upsertPages([pageRecord("p1")]);
    await permanentLocal.enqueue([
        { kind: "page.title", entity: "page", entityId: "p1", payload: { pageId: "p1", title: "A" }, coalesceKey: "page.title:p1" },
        { kind: "page.move", entity: "page", entityId: "p1", payload: { pageId: "p1", targetSpaceId: "s2" }, coalesceKey: "page.move:p1" },
    ]);
    const permanentEngine = createLocalFirstSyncEngine({ local: asLocal(permanentLocal), remote: permanentRemote.service, isOnline: online, intervalMs: 0 });
    await permanentEngine.flushNow();
    checkEqual("a rejected entry does not block the queue", permanentRemote.calls, ["pages.updatePageTitle", "pages.movePage"]);
    checkEqual("it is parked as failed", permanentLocal.countOutbox("failed"), 1);
    checkEqual("with the reason kept", permanentLocal.listOutbox({ state: "failed" })[0]?.lastError, "Request failed with status code 422");
    checkEqual("retryFailed puts it back", await permanentEngine.retryFailed(), 1);
    checkEqual("and it is pending again", permanentLocal.countOutbox("pending"), 1);

    console.log("\nSync: pull fills the cache without eating local edits");
    const pullLocal = new MemoryLocalStore();
    const pullRemote = makeRemote();
    pullRemote.replies.set("spaces.querySpaces", () => ({ records: [{ id: "s1", name: "Team" }], total: 1, current: 1, pageSize: 200 }));
    pullRemote.replies.set("pages.getPageTree", () => [{ id: "p1", title: "Server title", spaceId: "s1" }]);
    pullRemote.replies.set("pages.queryRecentPages", () => ({ records: [pageRecord("p1")], total: 1, current: 1, pageSize: 100 }));
    pullLocal.upsertPages([pageRecord("p1", { title: "Local title", dirty: true })]);
    await pullLocal.enqueue([{ kind: "page.title", entity: "page", entityId: "p1", payload: { title: "Local title" }, coalesceKey: "page.title:p1" }]);
    const pullEngine = createLocalFirstSyncEngine({
        local: asLocal(pullLocal),
        remote: pullRemote.service,
        isOnline: online,
        intervalMs: 0,
        hasSession: () => true,
    });
    // Push fails (the title reply is unstubbed) — the pull half must still run.
    pullRemote.replies.set("pages.updatePageTitle", () => {
        throw networkError();
    });
    await pullEngine.syncNow();
    check("spaces were pulled", pullLocal.getSpace("s1") !== null);
    checkEqual("the pull marks the space tree as synced", pullLocal.getState("pageTree.synced.s1") != null, true);
    checkEqual("the queued local title survived the pull", pullLocal.getPage("p1")?.title, "Local title");
    check("the skip is recorded", pullLocal.preserved.includes("page:p1"), pullLocal.preserved);

    console.log("\nSync: gating");
    const gateLocal = new MemoryLocalStore();
    const gateRemote = makeRemote();
    gateRemote.replies.set("spaces.querySpaces", () => ({ records: [], total: 0, current: 1, pageSize: 200 }));
    const gated = createLocalFirstSyncEngine({
        local: asLocal(gateLocal),
        remote: gateRemote.service,
        isOnline: online,
        intervalMs: 0,
        hasSession: () => false,
    });
    await gated.syncNow();
    checkEqual("without a session nothing is requested", gateRemote.calls.length, 0);

    const offlineGateLocal = new MemoryLocalStore();
    const offlineGateRemote = makeRemote();
    const offlineGated = createLocalFirstSyncEngine({
        local: asLocal(offlineGateLocal),
        remote: offlineGateRemote.service,
        isOnline: offline,
        intervalMs: 0,
        hasSession: () => true,
    });
    await offlineGated.syncNow();
    checkEqual("offline nothing is requested either", offlineGateRemote.calls.length, 0);
    checkEqual("and the state says so", offlineGated.state().online, false);
}

async function main(): Promise<void> {
    await offlineBehaviour();
    await onlineBehaviour();
    await syncBehaviour();

    console.log("\n" + pass + " passed, " + fail + " failed");
    if (fail > 0) process.exit(1);
}

void main().catch((error) => {
    console.error(error);
    process.exit(1);
});
