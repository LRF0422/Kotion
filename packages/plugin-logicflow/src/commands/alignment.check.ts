import { strict as assert } from "node:assert";
import { createDefaultPage } from "../model/data";
import { alignNodes, distributeNodes } from "./alignment";
import { expandGroupedSelection, groupNodes, ungroupNodes } from "./groups";
import type { Page } from "../model/types";

const page: Page = {
  ...createDefaultPage(),
  graph: {
    nodes: [
      { id: "a", type: "rect", x: 0, y: 0, width: 100, height: 60 },
      { id: "b", type: "rect", x: 200, y: 100, width: 80, height: 40 },
      { id: "c", type: "rect", x: 500, y: 200, width: 100, height: 60 },
    ],
    edges: [],
  },
};

const aligned = alignNodes(page, ["a", "b"], "left");
assert.equal(aligned.graph.nodes[0].x, 0);
assert.equal(aligned.graph.nodes[1].x, -10);

const distributed = distributeNodes(page, ["a", "b", "c"], "horizontal");
assert.equal(distributed.graph.nodes[0].x, 0);
assert.equal(distributed.graph.nodes[2].x, 500);
assert.equal(distributed.graph.nodes[1].x, 250);

const grouped = groupNodes(page, "g", ["a", "b"]);
assert.deepEqual(expandGroupedSelection(grouped, ["a"]).sort(), ["a", "b"]);
assert.equal(ungroupNodes(grouped, ["a"]).groups.length, 0);

console.log("LogicFlow alignment and grouping checks passed.");
