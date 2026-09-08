import { strict as assert } from "node:assert";
import { normalizeLogicFlowData } from "./normalize";
import { serializeLogicFlowDocument } from "./serialize";
import { stableStringify } from "./stable-stringify";
import { LOGICFLOW_SCHEMA_VERSION } from "./types";

const empty = normalizeLogicFlowData(null).document;
assert.equal(empty.schemaVersion, LOGICFLOW_SCHEMA_VERSION);
assert.equal(empty.pages.length, 1);
assert.deepEqual(empty.pages[0].graph, { nodes: [], edges: [] });
assert.equal(empty.pages[0].layers[0].id, "layer-1");
assert.deepEqual(empty.scratchpad, []);
assert.deepEqual(empty.defaultStyles, { node: {}, edge: {} });

const v1 = {
  schemaVersion: 1,
  graph: {
    nodes: [
      { id: "a", type: "rect", x: 10, y: 20, properties: { label: "A" } },
      { id: "b", type: "circle", x: 30, y: 40 },
    ],
    edges: [
      {
        id: "ab",
        type: "polyline",
        sourceNodeId: "a",
        targetNodeId: "b",
        properties: { weight: 2 },
      },
    ],
  },
  groups: [{ id: "group", name: "Pair", nodeIds: ["a", "b"] }],
  settings: { grid: false, snapline: false, background: "solid" },
} as const;
const migrated = normalizeLogicFlowData(v1);
assert.equal(migrated.migrated, true);
assert.equal(migrated.document.schemaVersion, 2);
assert.equal(migrated.document.pages.length, 1);
assert.equal(migrated.document.pages[0].id, "page-1");
assert.equal(migrated.document.pages[0].name, "Page-1");
assert.deepEqual(migrated.document.pages[0].graph, v1.graph);
assert.deepEqual(migrated.document.pages[0].groups, v1.groups);
assert.deepEqual(migrated.document.pages[0].settings, v1.settings);
assert.deepEqual(migrated.document.pages[0].layers[0].elementIds, [
  "a",
  "b",
  "ab",
]);

const normalized = normalizeLogicFlowData({
  nodes: [
    { id: "same", type: "rect", x: 1, y: 2, text: "A" },
    { id: "same", type: "circle", x: 3, y: 4, text: { value: "B" } },
  ],
  edges: [
    {
      id: "edge",
      type: "polyline",
      sourceNodeId: "same",
      targetNodeId: "same-2",
    },
    { id: "bad", sourceNodeId: "missing", targetNodeId: "same" },
  ],
}).document;
assert.deepEqual(
  normalized.pages[0].graph.nodes.map((node) => node.id),
  ["same", "same-2"],
);
assert.equal(normalized.pages[0].graph.edges.length, 1);
assert.equal(normalized.pages[0].graph.edges[0].targetNodeId, "same-2");

const malicious = normalizeLogicFlowData({
  graph: {
    nodes: [
      {
        id: "safe",
        type: "rect",
        x: 0,
        y: 0,
        properties: JSON.parse('{"__proto__":{"polluted":true},"ok":"yes"}'),
      },
    ],
    edges: [],
  },
}).document;
assert.deepEqual(malicious.pages[0].graph.nodes[0].properties, { ok: "yes" });
assert.equal(({} as { polluted?: boolean }).polluted, undefined);

const once = serializeLogicFlowDocument(migrated.document);
const twice = serializeLogicFlowDocument(once);
assert.equal(stableStringify(once), stableStringify(twice));
assert.equal(normalizeLogicFlowData(once).migrated, false);

console.log("LogicFlow model checks passed.");
