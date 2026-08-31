import { createSpacePageService } from "./service";
import type {
    SpacePageKeepaliveRequest,
    SpacePageTransport,
    SpacePageTransportRequest,
} from "./transport";

const assert = (condition: unknown, message: string, detail?: unknown): void => {
    if (!condition) throw new Error(`${message}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`);
};

class FakeTransport implements SpacePageTransport {
    readonly requests: SpacePageTransportRequest[] = [];
    readonly keepalives: SpacePageKeepaliveRequest[] = [];
    private readonly responses = new Map<string, unknown[]>();
    failUrl?: string;

    reply(url: string, value: unknown): void {
        const values = this.responses.get(url) ?? [];
        values.push(value);
        this.responses.set(url, values);
    }

    async execute<T>(request: SpacePageTransportRequest): Promise<T> {
        this.requests.push(request);
        if (request.endpoint.url === this.failUrl) throw new Error("transport failed");
        const values = this.responses.get(request.endpoint.url) ?? [];
        return values.shift() as T;
    }

    keepalive(request: SpacePageKeepaliveRequest): Promise<unknown> {
        this.keepalives.push(request);
        return Promise.resolve();
    }
}

async function main(): Promise<void> {
    const fake = new FakeTransport();
    const service = createSpacePageService(fake);
    const changes: string[] = [];
    service.changes.subscribe((change) => changes.push(change.type));

    fake.reply("/knowledge-wiki/space/page/:id/content", {
        id: 101,
        spaceId: 202,
        parentId: null,
        title: "Page",
        content: { type: "doc", content: [] },
        createUser: 303,
        updateUser: "404",
    });
    const page = await service.pages.getPage("101");
    assert(page.id === "101" && page.spaceId === "202", "page IDs normalize to strings", page);
    assert(page.createdById === "303" && page.updatedById === "404", "legacy author IDs normalize", page);
    assert(page.legacyContent != null && !("content" in page), "page row content is legacy-only", page);

    fake.reply("/knowledge-wiki/space/page/favorites", [{ id: 11, spaceId: 22, title: "Favorite" }]);
    const favorites = await service.pages.queryFavoritePages({ pageSize: 20 });
    assert(favorites.records[0]?.id === "11" && favorites.total === 1, "array envelope becomes canonical PagedResult", favorites);

    fake.reply("/knowledge-wiki/space/page/:id/move", undefined);
    await service.pages.movePage({ pageId: "501", targetParentId: "502", targetSpaceId: "503" });
    const move = fake.requests.at(-1)!;
    assert(move.endpoint.method === "PUT", "move uses PUT");
    assert(move.params?.id === "501", "move page ID is a path parameter", move);
    assert((move.body as any).targetParentId === "502" && (move.body as any).targetSpaceId === "503", "PUT values stay in the JSON body", move);
    assert(changes.at(-1) === "page.moved", "successful move emits typed change", changes);

    fake.reply("/knowledge-wiki/space/page/:pageId/tags", []);
    await service.tags.updatePageTags({ pageId: "601", tags: ["one", "two"] });
    const tagRequest = fake.requests.at(-1)!;
    assert(Array.isArray(tagRequest.body) && tagRequest.body.join(",") === "one,two", "tag PUT uses bare string array", tagRequest);

    fake.reply("/knowledge-wiki/space/block/:blockId/backlinks", [{
        sourceType: "BLOCK",
        sourceId: 701,
        sourcePageId: 9007199254740991n,
        sourceSpaceId: 703,
        sourceBlockId: 704,
        title: "Source",
    }]);
    const relations = await service.relations.queryPageRelations({ blockId: "702" });
    const relationRequest = fake.requests.at(-1)!;
    assert(relationRequest.endpoint.url.includes(":blockId/backlinks"), "block relation selects block backlink endpoint", relationRequest);
    assert(relations[0]?.sourcePageId === "9007199254740991" && relations[0]?.sourceSpaceId === "703", "backlink IDs normalize without numeric coercion", relations);

    fake.reply("/knowledge-wiki/space/page/list", [{ id: "710", spaceId: "711", spaceName: "Team", title: "Summary" }]);
    const summaries = await service.pages.queryPages();
    assert(summaries.records[0]?.spaceName === "Team", "page summaries preserve their owning space name", summaries);

    fake.reply("/knowledge-wiki/space/page/block/detail/:id", { id: "720", pageId: "710", spaceId: "711", spaceName: "Team", text: "hit" });
    const block = await service.relations.getBlock("720");
    assert(block.spaceName === "Team", "block search metadata preserves the owning space name", block);

    fake.reply("/knowledge-wiki/space/page/:pageId/comment/list", [{
        id: "730",
        userId: "731",
        content: "parent",
        replies: [{ id: "732", userId: "733", content: "reply" }],
    }]);
    const comments = await service.comments.getPageComments("710");
    assert(comments[0]?.pageId === "710" && comments[0]?.replies?.[0]?.pageId === "710", "page-scoped comments inherit pageId", comments);

    fake.reply("/knowledge-wiki/page/:id/history", [{ kind: "AUTO" }, { rev: "4", kind: "USER" }]);
    const history = await service.documents.getPageHistory({ pageId: "710" });
    assert(history.records.length === 1 && history.records[0]?.rev === "4", "history skips malformed rows without hiding valid revisions", history);

    fake.reply("/knowledge-wiki/space/page", "740");
    const created = await service.pages.createPage({ spaceId: "711", title: "Created" });
    assert(created.id === "740" && created.spaceId === "711", "page creation tolerates a bare ID response", created);

    await service.documents.releasePageSession({ pageId: "801", clientId: "client-a" });
    const release = fake.keepalives.at(-1)!;
    assert(release.endpoint.method === "DELETE" && (release.body as any).clientId === "client-a", "session release uses keepalive DELETE JSON body", release);

    const changeCount = changes.length;
    fake.failUrl = "/knowledge-wiki/space/page/:id/trash";
    try { await service.pages.movePageToTrash("901"); } catch { /* expected */ }
    assert(changes.length === changeCount, "failed mutation emits no change", changes);

    fake.reply("/knowledge-wiki/space/page/:id/content", { id: Number.MAX_SAFE_INTEGER + 1, title: "unsafe" });
    let strictIdRejected = false;
    try { await service.pages.getPage("unsafe"); } catch { strictIdRejected = true; }
    assert(strictIdRejected, "unsafe known IDs are rejected");

    console.log("core space-page service checks passed");
}

void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
