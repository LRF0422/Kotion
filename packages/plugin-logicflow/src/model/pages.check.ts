import { strict as assert } from "node:assert";
import { createDefaultLogicFlowDocument } from "./data";
import {
  addPage,
  deletePage,
  renamePage,
  reorderPage,
  updatePage,
} from "./pages";

let document = createDefaultLogicFlowDocument();
const onlyPage = document.pages[0];
assert.equal(
  deletePage(document, onlyPage.id),
  document,
  "must retain last page",
);

document = addPage(document);
assert.deepEqual(
  document.pages.map((page) => [page.id, page.name]),
  [
    ["page-1", "Page-1"],
    ["page-2", "Page-2"],
  ],
);
document = addPage(document, { id: "custom", name: "Custom" }, 1);
assert.deepEqual(
  document.pages.map((page) => page.id),
  ["page-1", "custom", "page-2"],
);

document = renamePage(document, "custom", "Renamed");
assert.equal(document.pages[1].name, "Renamed");
document = updatePage(document, "custom", {
  graph: { nodes: [{ id: "node", type: "rect", x: 0, y: 0 }], edges: [] },
});
assert.deepEqual(document.pages[1].layers[0].elementIds, ["node"]);

document = reorderPage(document, "page-2", 0);
assert.deepEqual(
  document.pages.map((page) => page.id),
  ["page-2", "page-1", "custom"],
);
document = deletePage(document, "page-1");
assert.deepEqual(
  document.pages.map((page) => page.id),
  ["page-2", "custom"],
);

console.log("LogicFlow page checks passed.");
