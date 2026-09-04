import { createDefaultMindmapDocument } from "../data";
import { layoutMindmap } from "../layout/tree-layout";
import { normalizeDrawnixData } from "./normalize";
import {
  addMindmapChild,
  addMindmapSibling,
  createMindmapNode,
  deleteMindmapNode,
  findMindmapNode,
  setMindmapLayout,
  toggleMindmapNodeCollapsed,
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
      data: { topic: { children: [{ text: "Root " }, { text: "topic" }] } },
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
const normalizedAgain = normalizeDrawnixData(persisted);
assert(
  !normalizedAgain.migrated,
  "serialized V2 data should normalize idempotently",
);
assert(
  normalizedAgain.document.root.id === "root-id",
  "root id should survive serialization",
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
