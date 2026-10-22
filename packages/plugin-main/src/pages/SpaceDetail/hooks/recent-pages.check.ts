import {
  MAX_RECENT_ITEMS,
  RECENT_PAGES_STORAGE_KEY,
  dropRecentPage,
  isLivePageStatus,
  parseRecentPages,
  recordRecentPage,
  serializeRecentPages,
  toRecentPageItems,
  type RecentPageItem,
} from "./recent-pages";

let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, extra?: unknown): void {
  if (condition) {
    pass++;
    console.log("  ok   " + name);
  } else {
    fail++;
    console.log(
      "  FAIL " +
        name +
        (extra !== undefined ? "  -> " + JSON.stringify(extra) : ""),
    );
  }
}

const item = (id: string, status?: string): RecentPageItem => ({
  id,
  title: "Page " + id,
  ...(status ? { status } : {}),
});

function main(): void {
  console.log("\nrecent-pages\n");

  check("storage key remains the documented legacy key", RECENT_PAGES_STORAGE_KEY === "kn:recent-pages");
  check("the recent section caps at eight entries", MAX_RECENT_ITEMS === 8);

  // --- status gate ------------------------------------------------------
  check("ACTIVE counts as live", isLivePageStatus("ACTIVE"));
  check("DRAFT counts as live", isLivePageStatus("DRAFT"));
  check("unknown/missing status counts as live (old cached entries)", isLivePageStatus(undefined));
  check("TRASH is not live", !isLivePageStatus("TRASH"));
  check("DELETED is not live", !isLivePageStatus("DELETED"));
  // The backend's IBaseEnum serializer sends {value, desc} objects; the domain
  // normalizer unwraps them, but the list must not break if one slips through.
  check("enum-shaped ACTIVE counts as live", isLivePageStatus({ value: "ACTIVE", desc: "激活" }));
  check("enum-shaped TRASH is not live", !isLivePageStatus({ value: "TRASH", desc: "回收中" }));
  check("enum-shaped DELETED is not live", !isLivePageStatus({ value: "DELETED", desc: "已删除" }));

  // --- API result mapping -------------------------------------------------
  const fromApi = toRecentPageItems([
    { id: "1", title: "One", status: "ACTIVE", spaceId: "9", updatedAt: 1700000000000 },
    { id: "2", title: "Gone", status: "TRASH" },
    { id: "3", title: "Deleted", status: "DELETED" },
    { id: "4", title: "Draft", status: "DRAFT", icon: { icon: "📄" } },
    { id: "5", title: "Enum gone", status: { value: "TRASH", desc: "回收中" } },
    { id: "6", title: "Enum live", status: { value: "ACTIVE", desc: "激活" } },
  ]);
  check(
    "trashed/deleted API rows never reach the recent list",
    fromApi.map((page) => page.id).join(",") === "1,4,6",
    fromApi.map((page) => page.id),
  );
  check(
    "API rows are mapped with a string update time and icon",
    fromApi[0].updatedAt === "1700000000000" && fromApi[1].icon?.icon === "📄",
    fromApi,
  );
  check(
    "enum-shaped status is stored as its bare value",
    fromApi[2].status === "ACTIVE",
    fromApi[2],
  );
  check(
    "an eleven-row result is capped to the recent limit",
    toRecentPageItems(Array.from({ length: 11 }, (_, index) => ({ id: String(index), title: "p", status: "ACTIVE" }))).length
      === MAX_RECENT_ITEMS,
  );

  // --- recording a visit --------------------------------------------------
  const visits = recordRecentPage(
    [item("a"), item("b", "ACTIVE"), item("c", "TRASH")],
    { id: "b", title: "B again", status: "ACTIVE" },
    "2026-10-22T00:00:00.000Z",
  );
  check(
    "a re-visited page moves to the front exactly once",
    visits.map((page) => page.id).join(",") === "b,a",
    visits.map((page) => page.id),
  );
  check(
    "the visit timestamp is the recording time",
    visits[0].updatedAt === "2026-10-22T00:00:00.000Z",
  );
  check(
    "a trashed page is refused and pre-existing trash rows are swept",
    recordRecentPage([item("a"), item("c", "TRASH")], { id: "c", title: "C", status: "TRASH" })
      .map((page) => page.id)
      .join(",") === "a",
  );
  const overflow = recordRecentPage(
    Array.from({ length: MAX_RECENT_ITEMS }, (_, index) => item("old-" + index)),
    { id: "new", title: "New" },
  );
  check(
    "recording trims the oldest entry past the cap",
    overflow.length === MAX_RECENT_ITEMS && overflow[0].id === "new" && !overflow.some((page) => page.id === "old-7"),
    overflow.map((page) => page.id),
  );

  // --- dropping one page --------------------------------------------------
  check(
    "dropping a page removes every occurrence",
    dropRecentPage([item("a"), item("b"), item("a")], "a").map((page) => page.id).join(",") === "b",
  );

  // --- localStorage fallback ----------------------------------------------
  check("missing storage parses to an empty list", parseRecentPages(null).length === 0);
  check("malformed JSON parses to an empty list", parseRecentPages("{not json").length === 0);
  check("a non-array JSON value parses to an empty list", parseRecentPages('{"id":"a"}').length === 0);
  check(
    "a trashed entry stored by an older build is not resurrected",
    parseRecentPages(JSON.stringify([item("a", "TRASH"), item("b", "ACTIVE")])).map((page) => page.id).join(",") === "b",
  );
  check(
    "an enum-shaped status in stored data is unwrapped before the live check",
    parseRecentPages(JSON.stringify([
      { id: "gone", title: "Gone", status: { value: "TRASH", desc: "回收中" } },
      { id: "live", title: "Live", status: { value: "ACTIVE", desc: "激活" } },
    ])).map((page) => `${page.id}:${page.status}`).join(",") === "live:ACTIVE",
  );
  check(
    "duplicate and malformed stored entries are dropped",
    parseRecentPages(JSON.stringify([item("a"), item("a"), { title: "no id" }, null, 7])).map((page) => page.id).join(",") === "a",
  );
  const roundTrip = parseRecentPages(serializeRecentPages([item("a", "ACTIVE"), item("b")]));
  check(
    "serialize/parse round-trips ids and titles",
    roundTrip.length === 2 && roundTrip[0].id === "a" && roundTrip[1].title === "Page b",
    roundTrip,
  );

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
