import { createDefaultMindmapDocument } from "../data";
import { layoutMindmap } from "../layout/tree-layout";
import { normalizeDrawnixData } from "./normalize";
import {
  addMindmapChild,
  addMindmapSibling,
  createMindmapNode,
  deleteMindmapNode,
  extractMindmapStructure,
  findMindmapNode,
  setMindmapLayout,
  toggleMindmapNodeCollapsed,
  updateMindmapNodeHref,
  updateMindmapNodeStyle,
  updateMindmapNodeText,
} from "./operations";
import { serializeDrawnixDocument } from "./serialize";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const legacy = {
  children: [
    {
      id: "root-id",
      type: "mindmap",
      isRoot: true,
      rightNodeCount: 1,
      layout: "standard",
      fill: "#ABCDEF",
      strokeColor: "#123456",
      data: {
        topic: {
          children: [
            { text: "Root ", color: "#FEDCBA", "font-size": "18px" },
            { text: "topic" },
          ],
        },
      },
      children: [
        {
          id: "right",
          data: { topic: { children: [{ children: [{ text: "Right" }] }] } },
          children: [],
        },
        {
          id: "left",
          isCollapsed: true,
          data: { topic: { children: [{ text: "Left" }] } },
          children: [
            {
              id: "duplicate",
              data: { topic: { children: [{ text: "Child" }] } },
            },
          ],
        },
        {
          id: "duplicate",
          data: { topic: { children: [{ text: "Duplicate id" }] } },
          children: [],
        },
      ],
    },
  ],
  viewport: { offsetX: 12, offsetY: -8, zoom: 1.25 },
};

const migrated = normalizeDrawnixData(legacy);
assert(migrated.migrated, "legacy data should migrate");
assert(
  migrated.document.root.text === "Root topic",
  "Slate text leaves should be concatenated",
);
assert(
  migrated.document.root.style?.backgroundColor === "#abcdef" &&
    migrated.document.root.style.borderColor === "#123456" &&
    migrated.document.root.style.textColor === "#fedcba" &&
    migrated.document.root.style.fontSize === 18,
  "legacy node and topic styles should migrate",
);
assert(
  migrated.document.root.children[0].side === "right",
  "rightNodeCount should restore right side",
);
assert(
  migrated.document.root.children[1].side === "left",
  "remaining root children should be left",
);
assert(
  migrated.document.root.children[1].collapsed,
  "collapsed state should migrate",
);
assert(
  migrated.document.viewport?.x === 12,
  "legacy viewport x should migrate",
);
assert(
  new Set(layoutMindmap(migrated.document).nodes.map((node) => node.id))
    .size === 4,
  "collapsed descendants should be hidden",
);

const persisted = serializeDrawnixDocument(migrated.document);
const persistedLegacyRoot = persisted.children[0];
const persistedTopicLeaf = (
  persistedLegacyRoot.data as {
    topic: { children: Array<Record<string, unknown>> };
  }
).topic.children[0];
assert(
  persistedLegacyRoot.fill === "#abcdef" &&
    persistedLegacyRoot.strokeColor === "#123456" &&
    persistedTopicLeaf.color === "#fedcba" &&
    persistedTopicLeaf["font-size"] === "18px",
  "semantic styles should project back to legacy fields",
);
const normalizedAgain = normalizeDrawnixData(persisted);
assert(
  !normalizedAgain.migrated,
  "serialized V2 data should normalize idempotently",
);
assert(
  normalizedAgain.document.root.id === "root-id",
  "root id should survive serialization",
);

const sanitized = normalizeDrawnixData({
  schemaVersion: 2,
  layout: "right",
  root: {
    id: "styled-root",
    text: "Styled",
    children: [],
    style: {
      fontSize: 80.4,
      textColor: " #ABCDEF80 ",
      borderColor: "red",
      backgroundColor: "#001122",
      ignored: true,
    },
    href: "example.com/path",
  },
});
assert(
  sanitized.document.root.style?.fontSize === 48,
  "font size should round and clamp",
);
assert(
  sanitized.document.root.style?.textColor === "#abcdef80" &&
    sanitized.document.root.style.backgroundColor === "#001122" &&
    sanitized.document.root.style.borderColor === undefined,
  "colors should canonicalize and invalid values should be removed",
);
assert(
  sanitized.document.root.href === "https://example.com/path",
  "links without a scheme should normalize to https",
);

for (const href of [
  "javascript:alert(1)",
  "data:text/plain,test",
  "file:///tmp/test",
  "mailto:test@example.com",
  "/relative/path",
]) {
  const unsafe = normalizeDrawnixData({
    schemaVersion: 2,
    layout: "right",
    root: { id: "unsafe", text: "Unsafe", children: [], href },
  });
  assert(!unsafe.document.root.href, `${href} should be rejected`);
}

const sanitizedPersisted = serializeDrawnixDocument(sanitized.document);
assert(
  sanitizedPersisted.root.style !== sanitized.document.root.style,
  "serialization should deep-clone node styles",
);
const sanitizedAgain = normalizeDrawnixData(sanitizedPersisted);
assert(
  !sanitizedAgain.migrated,
  "sanitized style and link data should round-trip idempotently",
);

let document = createDefaultMindmapDocument();
document = addMindmapChild(
  document,
  document.root.id,
  createMindmapNode("new-child", "New child"),
)!;
assert(
  findMindmapNode(document.root, "new-child"),
  "child insertion should find new node",
);
document = addMindmapSibling(
  document,
  "new-child",
  createMindmapNode("sibling", "Sibling"),
)!;
assert(
  document.root.children.at(-1)?.id === "sibling",
  "sibling should insert after selected node",
);
assert(
  document.root.children.at(-1)?.side ===
    findMindmapNode(document.root, "new-child")?.side,
  "root siblings should share side",
);
document = updateMindmapNodeText(document, "sibling", "Renamed")!;
assert(
  findMindmapNode(document.root, "sibling")?.text === "Renamed",
  "text update should apply",
);

document = updateMindmapNodeStyle(document, "new-child", {
  fontSize: 20,
  textColor: "#AABBCC",
})!;
document = updateMindmapNodeStyle(document, "new-child", {
  borderColor: "#112233",
  backgroundColor: "#44556688",
})!;
assert(
  findMindmapNode(document.root, "new-child")?.style?.fontSize === 20 &&
    findMindmapNode(document.root, "new-child")?.style?.textColor ===
      "#aabbcc" &&
    findMindmapNode(document.root, "new-child")?.style?.borderColor ===
      "#112233" &&
    findMindmapNode(document.root, "new-child")?.style?.backgroundColor ===
      "#44556688",
  "style updates should merge and normalize",
);
assert(
  !findMindmapNode(document.root, "sibling")?.style,
  "style updates should not affect sibling nodes",
);
document = updateMindmapNodeStyle(document, "new-child", {
  textColor: null,
})!;
assert(
  !findMindmapNode(document.root, "new-child")?.style?.textColor &&
    findMindmapNode(document.root, "new-child")?.style?.borderColor ===
      "#112233",
  "individual style overrides should unset independently",
);

const structure = extractMindmapStructure(
  findMindmapNode(document.root, "new-child")!,
);
assert(
  structure.style?.backgroundColor === "#44556688" &&
    structure.style !== findMindmapNode(document.root, "new-child")?.style,
  "public structure extraction should preserve and clone styles",
);

document = updateMindmapNodeHref(
  document,
  "new-child",
  "knowledge.example/path",
)!;
assert(
  findMindmapNode(document.root, "new-child")?.href ===
    "https://knowledge.example/path",
  "href updates should normalize safe links",
);
assert(
  updateMindmapNodeHref(document, "new-child", "javascript:alert(1)") === null,
  "unsafe href updates should be rejected without changing the node",
);
document = updateMindmapNodeHref(document, "new-child", null)!;
assert(
  !findMindmapNode(document.root, "new-child")?.href,
  "href removal should clear only the link",
);
document = updateMindmapNodeStyle(document, "new-child", null)!;
assert(
  !findMindmapNode(document.root, "new-child")?.style,
  "full style reset should remove the empty style object",
);

const attributedNode = createMindmapNode("attributed", "Attributed", [], {
  style: { fontSize: 24, backgroundColor: "#123456" },
  href: "https://example.com/",
});
const attributedStructure = extractMindmapStructure(attributedNode);
assert(
  attributedStructure.style?.fontSize === 24 &&
    attributedStructure.href === "https://example.com/",
  "public node creation and extraction should preserve attributes",
);

assert(
  deleteMindmapNode(document, document.root.id) === null,
  "root deletion should be rejected",
);
document = deleteMindmapNode(document, "sibling")!;
assert(
  !findMindmapNode(document.root, "sibling"),
  "subtree deletion should remove node",
);

document = toggleMindmapNodeCollapsed(document, document.root.id)!;
assert(
  layoutMindmap(document).nodes.length === 1,
  "collapsed root should hide descendants",
);
document = setMindmapLayout(document, "downward");
assert(document.layout === "downward", "layout should update");

console.log("drawnix model checks passed");
