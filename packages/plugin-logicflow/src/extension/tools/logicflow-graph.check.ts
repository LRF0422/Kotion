import { strict as assert } from "node:assert";
import { serializeLogicFlowDocument } from "../../model/serialize";
import { stableStringify } from "../../model/stable-stringify";
import { LOGICFLOW_LIMITS } from "../../model/types";

const moduleLoader = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleLoader._load;
moduleLoader._load = (request, parent, isMain) =>
  request === "@kn/icon"
    ? new Proxy({}, { get: () => () => null })
    : originalLoad(request, parent, isMain);
const {
  applyLogicFlowGraphEdits,
  buildLogicFlowDocumentFromGraph,
  prepareSemanticLogicFlowGraph,
  validateSemanticLogicFlowGraph,
} = require("./logicflow-graph") as typeof import("./logicflow-graph");
moduleLoader._load = originalLoad;

const prepared = prepareSemanticLogicFlowGraph(
  [
    { label: "开始", type: "rectangle", color: "blue" },
    { id: "finish", label: "结束", type: "ellipse" },
  ],
  [{ sourceNodeId: "开始", targetNodeId: "finish", text: "下一步" }],
);
assert.equal(prepared.nodes[0].id, "node-1");
assert.equal(prepared.nodes[0].type, "rect");
assert.equal(prepared.nodes[0].properties?.fill, "blue");
assert.equal(prepared.edges[0].from, "node-1");
assert.equal(prepared.edges[0].to, "finish");
assert.equal(prepared.edges[0].label, "下一步");

assert.throws(
  () => validateSemanticLogicFlowGraph([], []),
  /nodes 数组不能为空/,
);
assert.throws(
  () =>
    validateSemanticLogicFlowGraph(
      [
        { id: "same", label: "A" },
        { id: "same", label: "B" },
      ],
      [],
    ),
  /重复/,
);
assert.throws(
  () => validateSemanticLogicFlowGraph([{ id: "bad id", label: "A" }], []),
  /格式无效/,
);
assert.throws(
  () =>
    validateSemanticLogicFlowGraph(
      [{ id: "a", label: "A" }],
      [{ from: "a", to: "missing" }],
    ),
  /不存在的节点/,
);
assert.throws(
  () =>
    validateSemanticLogicFlowGraph(
      Array.from({ length: LOGICFLOW_LIMITS.maxNodes + 1 }, (_, index) => ({
        id: `node-${index}`,
        label: `Node ${index}`,
      })),
      [],
    ),
  /节点数量不能超过/,
);

const document = buildLogicFlowDocumentFromGraph({
  title: "审批流程",
  pageName: "主流程",
  layout: "vertical",
  nodes: [
    { id: "a", label: "开始", type: "ellipse" },
    { id: "b", label: "审核" },
    { id: "victim", label: "待删除" },
  ],
  edges: [
    { id: "edge-ab", from: "a", to: "b" },
    { id: "edge-victim", from: "b", to: "victim" },
  ],
});
assert.equal(document.schemaVersion, 2);
assert.equal(document.title, "审批流程");
assert.equal(document.pages[0].name, "主流程");
assert.equal(document.pages[0].graph.nodes.length, 3);
assert.deepEqual(
  new Set(document.pages[0].layers[0].elementIds),
  new Set(["a", "b", "victim", "edge-ab", "edge-victim"]),
);

const edited = applyLogicFlowGraphEdits(document, "page-1", [
  { op: "addNode", id: "c", x: 600, y: 300, text: "完成" },
  { op: "updateNode", id: "c", type: "ellipse", text: "已完成" },
  {
    op: "addEdge",
    id: "edge-bc",
    sourceNodeId: "b",
    targetNodeId: "c",
  },
  { op: "updateEdge", id: "edge-bc", text: "通过", type: "bezier" },
  { op: "deleteEdge", id: "edge-ab" },
  { op: "deleteNode", id: "victim" },
]);
assert.equal(edited.applied, 6);
assert.equal(edited.changed, true);
assert.deepEqual(edited.cascadeDeletedEdgeIds, ["edge-victim"]);
const editedPage = edited.document.pages[0];
assert.deepEqual(
  editedPage.graph.nodes.map((node) => node.id),
  ["a", "b", "c"],
);
assert.deepEqual(
  editedPage.graph.edges.map((edge) => edge.id),
  ["edge-bc"],
);
assert.equal(editedPage.graph.edges[0].type, "bezier");
assert.equal(editedPage.graph.edges[0].text, "通过");
assert.deepEqual(
  new Set(editedPage.layers[0].elementIds),
  new Set(["a", "b", "c", "edge-bc"]),
);

const beforeFailure = stableStringify(document);
assert.throws(
  () =>
    applyLogicFlowGraphEdits(document, "page-1", [
      { op: "addNode", id: "temporary", x: 1, y: 1 },
      {
        op: "addEdge",
        id: "invalid-edge",
        sourceNodeId: "temporary",
        targetNodeId: "missing",
      },
    ]),
  /不存在的节点/,
);
assert.equal(stableStringify(document), beforeFailure);
assert.deepEqual(serializeLogicFlowDocument(edited.document), edited.document);

console.log("LogicFlow Agent graph checks passed.");
