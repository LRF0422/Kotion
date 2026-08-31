import { createSpacePageChangeStream } from "./change-stream";

const assert = (condition: unknown, message: string): void => {
    if (!condition) throw new Error(message);
};

const stream = createSpacePageChangeStream();
const seen: string[] = [];
let typedPageId: string | undefined;

const unsubscribeAll = stream.subscribe(change => {
    seen.push(change.type);
});
const unsubscribePage = stream.subscribe("page.updated", change => {
    typedPageId = change.payload.page.id;
});

stream.emit("page.updated", {
    page: { id: "page-1", title: "Updated" },
}, { source: "check", timestamp: 123 });

assert(seen.join(",") === "page.updated", "global listeners should receive emitted changes");
assert(typedPageId === "page-1", "typed listeners should receive narrowed payloads");

unsubscribePage();
stream.emit("space.archived", { spaceId: "space-1" });
stream.emit("page.document.changed", {
    pageId: "page-1",
    spaceId: "space-1",
    scope: "content",
});
assert(
    seen.join(",") === "page.updated,space.archived,page.document.changed",
    "global listeners should receive lifecycle and document changes"
);
assert(typedPageId === "page-1", "unsubscribed typed listeners should not be called again");

unsubscribeAll();
stream.emit("page.restoredFromTrash", { pageId: "page-1", spaceId: "space-1" });
assert(seen.length === 3, "unsubscribed global listeners should not be called again");

console.log("space-page change stream checks passed");
