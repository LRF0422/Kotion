import { strict as assert } from "node:assert";
import {
  createDefaultLogicFlowDocument,
  createDefaultPage,
} from "../model/data";
import type { ClipboardAdapter } from "./clipboard";
import { copySelection, pasteSelection } from "./clipboard";
import {
  deleteElements,
  reverseEdges,
  setElementsLocked,
} from "./element-commands";
import { reorderElements } from "./layer-commands";
import { duplicatePage } from "./page-commands";
import { createSelectionState, MIXED_VALUE, commonProperty } from "./selection";
import { insertScratchpadItem, saveSelectionToScratchpad } from "./scratchpad";

const page = {
  ...createDefaultPage(),
  graph: {
    nodes: [
      { id: "a", type: "rect", x: 0, y: 0, properties: { fill: "red" } },
      { id: "b", type: "rect", x: 100, y: 0, properties: { fill: "blue" } },
    ],
    edges: [
      {
        id: "ab",
        type: "polyline",
        sourceNodeId: "a",
        targetNodeId: "b",
      },
    ],
  },
  groups: [{ id: "group", nodeIds: ["a", "b"] }],
  layers: [
    {
      id: "layer-1",
      name: "Layer-1",
      visible: true,
      locked: false,
      elementIds: ["a", "b", "ab"],
    },
  ],
};

const mixed = createSelectionState(page, ["a", "ab"]);
assert.equal(mixed.kind, "mixed");
assert.equal(
  commonProperty(createSelectionState(page, ["a", "b"]), "fill"),
  MIXED_VALUE,
);

const locked = setElementsLocked(page, ["a"], true);
assert.equal(locked.graph.nodes[0].properties?.locked, true);
assert.equal(deleteElements(locked, ["a"]).graph.nodes.length, 2);

const reversed = reverseEdges(page, ["ab"]);
assert.equal(reversed.graph.edges[0].sourceNodeId, "b");
assert.equal(reversed.graph.edges[0].targetNodeId, "a");

assert.deepEqual(reorderElements(page, ["a"], "front").layers[0].elementIds, [
  "b",
  "ab",
  "a",
]);

const document = { ...createDefaultLogicFlowDocument(), pages: [page] };
const duplicated = duplicatePage(document, "page-1");
assert.equal(duplicated.pages.length, 2);
assert.notEqual(duplicated.pages[1].graph.nodes[0].id, "a");
assert.equal(duplicated.pages[1].graph.edges.length, 1);

let text = "";
const clipboard: ClipboardAdapter = {
  async writeText(value) {
    text = value;
  },
  async readText() {
    return text;
  },
};
void (async () => {
  await copySelection(page, ["a", "b"], clipboard);
  const pasted = await pasteSelection(page, { x: 20, y: 30 }, clipboard);
  assert.equal(pasted.graph.nodes.length, 4);
  assert.equal(pasted.graph.edges.length, 2);
  assert.equal(new Set(pasted.graph.nodes.map((node) => node.id)).size, 4);

  const withScratchpad = saveSelectionToScratchpad(
    document,
    page,
    ["a", "b"],
    "Pair",
  );
  assert.equal(withScratchpad.scratchpad.length, 1);
  const inserted = insertScratchpadItem(page, withScratchpad.scratchpad[0], {
    x: 50,
    y: 50,
  });
  assert.equal(inserted.graph.nodes.length, 4);
  assert.equal(inserted.graph.edges.length, 2);

  console.log("LogicFlow command checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
