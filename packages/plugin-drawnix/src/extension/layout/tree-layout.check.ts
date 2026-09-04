import { layoutMindmap, measureMindmapNode } from "./tree-layout";
import type { MindmapDocument } from "../model/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const document: MindmapDocument = {
  schemaVersion: 2,
  layout: "standard",
  root: {
    id: "root",
    text: "中心主题 with a longer title",
    children: [
      {
        id: "right-a",
        text: "Right branch A with enough text to wrap onto another line",
        side: "right",
        children: [
          { id: "right-a-1", text: "A1", children: [] },
          { id: "right-a-2", text: "A2", children: [] },
        ],
      },
      {
        id: "right-b",
        text: "Right branch B",
        side: "right",
        children: [{ id: "right-b-1", text: "B1", children: [] }],
      },
      {
        id: "left-a",
        text: "Left branch",
        side: "left",
        children: [],
      },
    ],
  },
};

for (const layout of [
  "standard",
  "right",
  "left",
  "downward",
  "upward",
] as const) {
  const result = layoutMindmap({ ...document, layout });
  assert(result.nodes.length === 7, `${layout} should render every node`);
  assert(result.edges.length === 6, `${layout} should render every edge`);
  const ids = new Set(result.nodes.map((node) => node.id));
  assert(
    ids.size === result.nodes.length,
    `${layout} should not duplicate nodes`,
  );
}

const standard = layoutMindmap(document);
const right = standard.nodes.find((node) => node.id === "right-a")!;
const left = standard.nodes.find((node) => node.id === "left-a")!;
assert(right.position.x > 0, "right branch should be positioned to the right");
assert(
  left.position.x + left.width < 0,
  "left branch should be positioned to the left",
);

const downward = layoutMindmap({ ...document, layout: "downward" });
assert(
  downward.nodes
    .filter((node) => !node.isRoot)
    .every((node) => node.position.y > -30),
  "downward layout should place descendants below root",
);

const longNode = measureMindmapNode(
  "这是一个很长的中文节点标题，需要自动增加节点高度",
  false,
);
const shortNode = measureMindmapNode("短标题", false);
assert(
  longNode.height > shortNode.height,
  "long CJK text should increase node height",
);

console.log("drawnix layout checks passed");
