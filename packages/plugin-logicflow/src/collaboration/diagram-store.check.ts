import { strict as assert } from "node:assert";
import * as Y from "yjs";
import { createDefaultLogicFlowDocument } from "../model/data";
import {
  getLogicFlowDiagramsMap,
  readAuthoritativeLogicFlowDocument,
  replaceAuthoritativeLogicFlowDocument,
} from "./diagram-store";
import { LOCAL_ORIGIN, getDiagramMap } from "./yjs-codec";

const fallback = createDefaultLogicFlowDocument();
fallback.title = "Fallback";
const doc = new Y.Doc();
const diagrams = getLogicFlowDiagramsMap(doc);
assert.equal(diagrams.size, 0);
assert.equal(
  readAuthoritativeLogicFlowDocument(doc, "diagram-1", fallback).title,
  "Fallback",
);
assert.equal(
  diagrams.size,
  0,
  "read-only access must not create a diagram map",
);

const authoritative = createDefaultLogicFlowDocument();
authoritative.title = "Authoritative";
replaceAuthoritativeLogicFlowDocument(doc, "diagram-1", authoritative, "seed");
assert.equal(diagrams.size, 1);
assert.equal(
  readAuthoritativeLogicFlowDocument(doc, "diagram-1", fallback).title,
  "Authoritative",
);

const diagramMap = getDiagramMap(diagrams, "diagram-1")!;
const undoManager = new Y.UndoManager(diagramMap, {
  trackedOrigins: new Set([LOCAL_ORIGIN]),
  captureTimeout: 0,
});
const changed = createDefaultLogicFlowDocument();
changed.title = "Changed by Agent";
replaceAuthoritativeLogicFlowDocument(doc, "diagram-1", changed);
assert.equal(
  readAuthoritativeLogicFlowDocument(doc, "diagram-1", fallback).title,
  "Changed by Agent",
);
assert.equal(undoManager.canUndo(), true);
undoManager.undo();
assert.equal(
  readAuthoritativeLogicFlowDocument(doc, "diagram-1", fallback).title,
  "Authoritative",
);
undoManager.destroy();
doc.destroy();

console.log("LogicFlow authoritative diagram store checks passed.");
