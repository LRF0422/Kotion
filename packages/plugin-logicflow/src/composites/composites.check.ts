import { strict as assert } from "node:assert";
import { normalizeLogicFlowData } from "../model/normalize";
import type { Page } from "../model/types";
import { createContainer } from "./factory";
import { buildContainerIndex } from "./graph-index";
import {
  getContainerChildren,
  getContainerMetadata,
  getContainerParent,
} from "./metadata";
import { ContainerRegistry, containerRegistry } from "./registry";
import { resizeContainerSubtree } from "./scale";
import type { ContainerDefinition } from "./types";

const uml = containerRegistry.getById("uml-class");
assert.ok(uml);
const created = createContainer(uml, { id: "class-1", x: 100, y: 80 });
assert.equal(created.children.length, 3);
assert.equal(getContainerMetadata(created.root)?.definitionId, "uml-class");
assert.deepEqual(
  getContainerChildren(created.root),
  created.children.map((node) => node.id),
);
assert.ok(
  created.children.every((node) => getContainerParent(node) === "class-1"),
);

const index = buildContainerIndex({
  nodes: [created.root, ...created.children],
});
assert.deepEqual(index.expandRoots(["class-1"], "copy"), [
  "class-1",
  ...created.children.map((node) => node.id),
]);
assert.deepEqual(index.expandRoots([created.children[0].id], "copy"), [
  created.children[0].id,
]);

const page: Page = {
  id: "page-1",
  name: "Page-1",
  graph: { nodes: [created.root, ...created.children], edges: [] },
  groups: [],
  layers: [
    {
      id: "layer-1",
      name: "Layer-1",
      visible: true,
      locked: false,
      elementIds: [created.root.id, ...created.children.map((node) => node.id)],
    },
  ],
  settings: { grid: true, snapline: true, background: "transparent" },
};
const scaled = resizeContainerSubtree(page, "class-1", {
  width: 480,
  height: 400,
});
assert.equal(
  scaled.graph.nodes.find((node) => node.id === "class-1")?.width,
  480,
);
assert.ok(
  Number(
    scaled.graph.nodes.find((node) => node.id === created.children[0].id)?.x,
  ) !== created.children[0].x ||
    Number(
      scaled.graph.nodes.find((node) => node.id === created.children[0].id)
        ?.width,
    ) > Number(created.children[0].width),
);

const normalized = normalizeLogicFlowData({
  schemaVersion: 2,
  title: "Legacy",
  pages: [
    {
      id: "page-1",
      name: "Page-1",
      graph: {
        nodes: [
          {
            id: "legacy-class",
            type: "uml-class",
            x: 240,
            y: 180,
            width: 180,
            height: 120,
            text: "Customer\n────────\n+ name\n+ save()",
          },
        ],
        edges: [],
      },
      groups: [],
      layers: [],
      settings: { grid: true, snapline: true, background: "transparent" },
    },
  ],
});
assert.equal(normalized.migrated, true);
const migratedRoot = normalized.document.pages[0].graph.nodes.find(
  (node) => node.id === "legacy-class",
);
assert.equal(migratedRoot?.type, "uml-class-group");
assert.equal(getContainerChildren(migratedRoot!).length, 3);
assert.equal(normalizeLogicFlowData(normalized.document).migrated, false);

const testDefinition: ContainerDefinition = {
  id: "test-container",
  version: 1,
  rootType: "test-container-root",
  defaultSize: { width: 100, height: 80 },
  minSize: { width: 50, height: 40 },
  zones: ({ x, y, width, height }) => [{ id: "body", x, y, width, height }],
  accepts: () => true,
  capabilities: {
    resizable: true,
    rotatable: false,
    flippable: false,
    edgeTarget: "root",
    scaleChildren: true,
    scaleText: true,
  },
  operations: { copy: "root-and-descendants" },
};
const isolated = new ContainerRegistry();
isolated.register(testDefinition);
assert.equal(
  isolated.getByRootType("test-container-root")?.id,
  "test-container",
);

console.log("LogicFlow container checks passed.");
