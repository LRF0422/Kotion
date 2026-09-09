import { strict as assert } from "node:assert";

const moduleLoader = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = moduleLoader._load;
moduleLoader._load = (request, parent, isMain) =>
  request === "@kn/icon"
    ? new Proxy({}, { get: () => () => null })
    : originalLoad(request, parent, isMain);
const { computeLayeredLogicFlowLayout } =
  require("./layered-layout") as typeof import("./layered-layout");
moduleLoader._load = originalLoad;

const nodes = [
  { id: "start", label: "开始", type: "ellipse" },
  { id: "review", label: "审核申请", type: "rect" },
  { id: "approve", label: "是否通过", type: "diamond" },
  { id: "done", label: "完成", type: "ellipse" },
  { id: "reject", label: "退回修改", type: "rect" },
];
const edges = [
  { from: "start", to: "review" },
  { from: "review", to: "approve" },
  { from: "approve", to: "done" },
  { from: "approve", to: "reject" },
];

const vertical = computeLayeredLogicFlowLayout(nodes, edges, "vertical");
assert.deepEqual(
  vertical,
  computeLayeredLogicFlowLayout(nodes, edges, "vertical"),
);
assert.equal(vertical.nodes.length, nodes.length);
assert.ok(
  vertical.nodes.find((node) => node.id === "start")!.y <
    vertical.nodes.find((node) => node.id === "review")!.y,
);

for (let leftIndex = 0; leftIndex < vertical.nodes.length; leftIndex += 1) {
  for (
    let rightIndex = leftIndex + 1;
    rightIndex < vertical.nodes.length;
    rightIndex += 1
  ) {
    const left = vertical.nodes[leftIndex];
    const right = vertical.nodes[rightIndex];
    const separated =
      Math.abs(left.x - right.x) >= (left.width + right.width) / 2 ||
      Math.abs(left.y - right.y) >= (left.height + right.height) / 2;
    assert.equal(separated, true, `${left.id} and ${right.id} overlap`);
  }
}

const horizontal = computeLayeredLogicFlowLayout(nodes, edges, "horizontal");
assert.ok(
  horizontal.nodes.find((node) => node.id === "start")!.x <
    horizontal.nodes.find((node) => node.id === "review")!.x,
);

const cyclic = computeLayeredLogicFlowLayout(
  [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
    { id: "c", label: "C" },
    { id: "detached", label: "Detached" },
  ],
  [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
    { from: "c", to: "a" },
  ],
);
assert.deepEqual(
  cyclic.nodes.map((node) => node.id),
  ["a", "b", "c", "detached"],
);
assert.equal(
  new Set(cyclic.nodes.map((node) => `${node.x}:${node.y}`)).size,
  4,
);

const tieBreak = computeLayeredLogicFlowLayout(
  [
    { id: "second", label: "Second" },
    { id: "first", label: "First" },
    { id: "target", label: "Target" },
  ],
  [
    { from: "second", to: "target" },
    { from: "first", to: "target" },
  ],
);
assert.deepEqual(tieBreak.layers[0], ["second", "first"]);

console.log("LogicFlow layered layout checks passed.");
