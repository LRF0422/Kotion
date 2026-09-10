import { strict as assert } from "node:assert";
import {
  getCurrentLogicFlowEditingContext,
  registerLogicFlowEditingContext,
} from "./logicflow-editing-context";

const editorA = {};
const editorB = {};
const first = registerLogicFlowEditingContext(editorA, () => ({
  diagramId: "diagram-a",
  position: 1,
  pageId: "page-a",
  selectedElementIds: ["node-a", "node-a"],
  mode: "inline",
}));
assert.deepEqual(getCurrentLogicFlowEditingContext(editorA), {
  diagramId: "diagram-a",
  position: 1,
  pageId: "page-a",
  selectedElementIds: ["node-a"],
  mode: "inline",
});

const second = registerLogicFlowEditingContext(editorA, () => ({
  diagramId: "diagram-b",
  position: 2,
  pageId: "page-b",
  selectedElementIds: [],
  mode: "workspace",
}));
assert.equal(getCurrentLogicFlowEditingContext(editorA), null);
second.activate();
assert.equal(
  getCurrentLogicFlowEditingContext(editorA)?.diagramId,
  "diagram-b",
);
first.activate();
assert.equal(
  getCurrentLogicFlowEditingContext(editorA)?.diagramId,
  "diagram-a",
);

const other = registerLogicFlowEditingContext(editorB, () => ({
  diagramId: "diagram-other",
  position: 3,
  pageId: "page-other",
  selectedElementIds: [],
  mode: "inline",
}));
assert.equal(
  getCurrentLogicFlowEditingContext(editorB)?.diagramId,
  "diagram-other",
);

first.unregister();
assert.equal(
  getCurrentLogicFlowEditingContext(editorA)?.diagramId,
  "diagram-b",
);
second.unregister();
assert.equal(getCurrentLogicFlowEditingContext(editorA), null);
other.unregister();
assert.equal(getCurrentLogicFlowEditingContext(editorB), null);

console.log("LogicFlow editing context checks passed.");
