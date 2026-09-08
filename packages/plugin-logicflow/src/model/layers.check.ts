import { strict as assert } from "node:assert";
import { createDefaultPage } from "./data";
import {
  addLayer,
  deleteLayer,
  moveElementsToLayer,
  normalizeLayers,
  reorderLayer,
  setLayerLocked,
  setLayerVisibility,
} from "./layers";

const graph = {
  nodes: [
    { id: "a", type: "rect", x: 0, y: 0 },
    { id: "b", type: "rect", x: 1, y: 1 },
  ],
  edges: [{ id: "ab", type: "line", sourceNodeId: "a", targetNodeId: "b" }],
};
const normalized = normalizeLayers(
  [
    {
      id: "foreground",
      name: "Foreground",
      visible: true,
      locked: false,
      elementIds: ["a", "a", "missing"],
    },
    {
      id: "background",
      name: "Background",
      visible: false,
      locked: true,
      elementIds: ["a", "b"],
    },
  ],
  graph,
);
assert.equal(normalized[0].id, "layer-1");
assert.deepEqual(normalized[0].elementIds, ["ab"]);
assert.deepEqual(normalized[1].elementIds, ["a"]);
assert.deepEqual(normalized[2].elementIds, ["b"]);
assert.deepEqual(normalized.flatMap((layer) => layer.elementIds).sort(), [
  "a",
  "ab",
  "b",
]);

let page = {
  ...createDefaultPage(),
  graph,
  layers: normalizeLayers([], graph),
};
page = addLayer(page, { id: "notes", name: "Notes" });
page = moveElementsToLayer(page, ["b", "ab"], "notes");
assert.deepEqual(
  page.layers.find((layer) => layer.id === "notes")?.elementIds,
  ["b", "ab"],
);
page = setLayerVisibility(page, "notes", false);
page = setLayerLocked(page, "notes", true);
assert.equal(page.layers.find((layer) => layer.id === "notes")?.visible, false);
assert.equal(page.layers.find((layer) => layer.id === "notes")?.locked, true);
page = reorderLayer(page, "notes", 0);
assert.equal(page.layers[0].id, "notes");
page = deleteLayer(page, "notes");
assert.equal(page.layers.length, 1);
assert.deepEqual(page.layers[0].elementIds, ["a", "b", "ab"]);
assert.equal(
  deleteLayer(page, page.layers[0].id),
  page,
  "must retain last layer",
);

console.log("LogicFlow layer checks passed.");
