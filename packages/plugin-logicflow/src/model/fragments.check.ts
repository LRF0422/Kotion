import { strict as assert } from "node:assert";
import {
  extractDiagramFragment,
  offsetDiagramFragment,
  remapDiagramFragment,
} from "./fragments";
import type { Page } from "./types";

const page: Page = {
  id: "page-1",
  name: "Page-1",
  graph: {
    nodes: [
      { id: "a", type: "rect", x: 100, y: 200 },
      { id: "b", type: "rect", x: 150, y: 260 },
      { id: "outside", type: "rect", x: 500, y: 500 },
    ],
    edges: [
      {
        id: "ab",
        type: "polyline",
        sourceNodeId: "a",
        targetNodeId: "b",
        startPoint: { x: 100, y: 200 },
        endPoint: { x: 150, y: 260 },
        pointsList: [
          { x: 100, y: 200 },
          { x: 150, y: 260 },
        ],
      },
      {
        id: "external",
        type: "line",
        sourceNodeId: "b",
        targetNodeId: "outside",
      },
    ],
  },
  groups: [{ id: "pair", name: "Pair", nodeIds: ["a", "b", "outside"] }],
  layers: [
    {
      id: "layer-1",
      name: "Main",
      visible: true,
      locked: false,
      elementIds: ["a", "ab", "outside", "external"],
    },
    {
      id: "layer-2",
      name: "Second",
      visible: false,
      locked: true,
      elementIds: ["b"],
    },
  ],
  settings: { grid: true, snapline: true, background: "transparent" },
};

const fragment = extractDiagramFragment(page, ["a", "b"]);
assert.equal(fragment.version, 1);
assert.deepEqual(
  fragment.nodes.map(({ id, x, y }) => ({ id, x, y })),
  [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 50, y: 60 },
  ],
);
assert.deepEqual(
  fragment.edges.map((edge) => edge.id),
  ["ab"],
);
assert.deepEqual(fragment.edges[0].pointsList, [
  { x: 0, y: 0 },
  { x: 50, y: 60 },
]);
assert.deepEqual(fragment.groups[0].nodeIds, ["a", "b"]);
assert.deepEqual(
  fragment.layers.map((layer) => layer.elementIds),
  [["a", "ab"], ["b"]],
);

const remapped = remapDiagramFragment(
  fragment,
  (kind, sourceId) => `${kind}-${sourceId}-new`,
);
assert.deepEqual(
  remapped.nodes.map((node) => node.id),
  ["node-a-new", "node-b-new"],
);
assert.equal(remapped.edges[0].id, "edge-ab-new");
assert.equal(remapped.edges[0].sourceNodeId, "node-a-new");
assert.equal(remapped.edges[0].targetNodeId, "node-b-new");
assert.deepEqual(remapped.groups[0].nodeIds, ["node-a-new", "node-b-new"]);
assert.deepEqual(remapped.layers[0].elementIds, ["node-a-new", "edge-ab-new"]);

const offset = offsetDiagramFragment(fragment, { x: 25, y: -10 });
assert.deepEqual(
  offset.nodes.map(({ x, y }) => ({ x, y })),
  [
    { x: 25, y: -10 },
    { x: 75, y: 50 },
  ],
);
assert.deepEqual(offset.edges[0].startPoint, { x: 25, y: -10 });
assert.deepEqual(offset.edges[0].endPoint, { x: 75, y: 50 });

console.log("LogicFlow fragment checks passed.");
