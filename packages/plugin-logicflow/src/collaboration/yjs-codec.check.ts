import { strict as assert } from "node:assert";
import * as Y from "yjs";
import { createDefaultPage } from "../model/data";
import type { LogicFlowDocument } from "../model/types";
import {
  LOCAL_ORIGIN,
  getDiagramMap,
  getOrCreateDiagramMap,
  migrateLogicFlowDiagramMap,
  readLogicFlowDocument,
  replaceLogicFlowDocument,
  seedLogicFlowDocument,
} from "./yjs-codec";

function snapshot(): LogicFlowDocument {
  return {
    schemaVersion: 2,
    title: "Diagram",
    pages: [
      {
        ...createDefaultPage("page-1", "Page 1"),
        graph: {
          nodes: [
            {
              id: "node-a",
              type: "rect",
              x: 10,
              y: 20,
              properties: { left: 1, right: 1 },
            },
          ],
          edges: [],
        },
        layers: [
          {
            id: "layer-1",
            name: "Layer-1",
            visible: true,
            locked: false,
            elementIds: ["node-a"],
          },
        ],
      },
      createDefaultPage("page-2", "Page 2"),
    ],
    scratchpad: [],
    defaultStyles: { node: {}, edge: {} },
  };
}

function syncDocs(left: Y.Doc, right: Y.Doc): void {
  const leftUpdate = Y.encodeStateAsUpdate(left, Y.encodeStateVector(right));
  const rightUpdate = Y.encodeStateAsUpdate(right, Y.encodeStateVector(left));
  Y.applyUpdate(left, rightUpdate);
  Y.applyUpdate(right, leftUpdate);
}

const doc = new Y.Doc();
const diagrams = doc.getMap<Y.Map<unknown>>("logicflow-diagrams");
const diagram = getOrCreateDiagramMap(diagrams, "block-1");
assert.equal(getDiagramMap(diagrams, "block-1"), diagram);
assert.equal(seedLogicFlowDocument(diagram, snapshot()), true);
assert.equal(seedLogicFlowDocument(diagram, null), false);
assert.deepEqual(readLogicFlowDocument(diagram), snapshot());
assert.deepEqual((diagram.get("pageOrder") as Y.Array<string>).toArray(), [
  "page-1",
  "page-2",
]);

const left = new Y.Doc();
const leftDiagram = getOrCreateDiagramMap(
  left.getMap<Y.Map<unknown>>("logicflow-diagrams"),
  "block",
);
seedLogicFlowDocument(leftDiagram, snapshot(), "seed");
const right = new Y.Doc();
Y.applyUpdate(right, Y.encodeStateAsUpdate(left));
const rightDiagram = getDiagramMap(
  right.getMap<Y.Map<unknown>>("logicflow-diagrams"),
  "block",
)!;

const leftSnapshot = readLogicFlowDocument(leftDiagram);
leftSnapshot.pages[0].graph.nodes[0] = {
  ...leftSnapshot.pages[0].graph.nodes[0],
  x: 101,
  properties: { left: 202, right: 1 },
};
replaceLogicFlowDocument(leftDiagram, leftSnapshot);

const rightSnapshot = readLogicFlowDocument(rightDiagram);
rightSnapshot.pages[1] = {
  ...rightSnapshot.pages[1],
  name: "Renamed",
  layers: [
    {
      ...rightSnapshot.pages[1].layers[0],
      locked: true,
    },
  ],
};
rightSnapshot.scratchpad = [
  {
    id: "fragment-1",
    name: "Shared",
    fragment: { version: 1, nodes: [], edges: [], groups: [], layers: [] },
  },
];
replaceLogicFlowDocument(rightDiagram, rightSnapshot);
syncDocs(left, right);
const merged = readLogicFlowDocument(leftDiagram);
assert.equal(merged.pages[0].graph.nodes[0].x, 101);
assert.deepEqual(merged.pages[0].graph.nodes[0].properties, {
  left: 202,
  right: 1,
});
assert.equal(merged.pages[1].name, "Renamed");
assert.equal(merged.pages[1].layers[0].locked, true);
assert.equal(merged.scratchpad[0].name, "Shared");
assert.deepEqual(readLogicFlowDocument(rightDiagram), merged);

const undoDoc = new Y.Doc();
const undoDiagram = getOrCreateDiagramMap(
  undoDoc.getMap<Y.Map<unknown>>("logicflow-diagrams"),
  "undo",
);
seedLogicFlowDocument(undoDiagram, snapshot(), "seed");
const undoManager = new Y.UndoManager(undoDiagram, {
  trackedOrigins: new Set([LOCAL_ORIGIN]),
  captureTimeout: 0,
});
const changed = readLogicFlowDocument(undoDiagram);
changed.title = "Changed";
replaceLogicFlowDocument(undoDiagram, changed);
assert.equal(undoManager.canUndo(), true);
undoManager.undo();
assert.equal(readLogicFlowDocument(undoDiagram).title, "Diagram");
undoManager.destroy();

const legacyDoc = new Y.Doc();
const legacy = legacyDoc.getMap<unknown>("legacy");
const nodes = new Y.Map<unknown>();
const node = new Y.Map<unknown>();
node.set("id", "legacy-node");
node.set("type", "rect");
node.set("x", 1);
node.set("y", 2);
nodes.set("legacy-node", node);
legacy.set("nodes", nodes);
const order = new Y.Array<string>();
order.insert(0, ["legacy-node"]);
legacy.set("nodeOrder", order);
assert.equal(migrateLogicFlowDiagramMap(legacy), true);
assert.equal(migrateLogicFlowDiagramMap(legacy), false);
assert.equal(
  readLogicFlowDocument(legacy).pages[0].graph.nodes[0].id,
  "legacy-node",
);

console.log("LogicFlow Yjs v2 codec checks passed.");
