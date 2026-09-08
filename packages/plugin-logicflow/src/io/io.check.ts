import { strict as assert } from "node:assert";
import { createDefaultLogicFlowDocument } from "../model/data";
import { exportDocumentJson } from "./export-json";
import { readLogicFlowJsonFile } from "./import-json";

void (async () => {
  const document = createDefaultLogicFlowDocument();
  document.title = "Export test";
  document.pages.push({
    ...document.pages[0],
    id: "page-2",
    name: "Page-2",
  });
  const blob = exportDocumentJson(document);
  assert.equal(blob.type, "application/json;charset=utf-8");
  assert.deepEqual(JSON.parse(await blob.text()), document);

  const fakeFile = {
    size: JSON.stringify(document).length,
    async text() {
      return JSON.stringify(document);
    },
  } as File;
  const imported = await readLogicFlowJsonFile(fakeFile);
  assert.equal(imported.document.schemaVersion, 2);
  assert.equal(imported.document.pages.length, 2);

  const legacy = {
    graph: { nodes: [], edges: [] },
    groups: [],
    settings: { grid: true, snapline: true, background: "transparent" },
  };
  const legacyFile = {
    size: JSON.stringify(legacy).length,
    async text() {
      return JSON.stringify(legacy);
    },
  } as File;
  const migrated = await readLogicFlowJsonFile(legacyFile);
  assert.equal(migrated.document.pages[0].id, "page-1");

  console.log("LogicFlow import/export checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
