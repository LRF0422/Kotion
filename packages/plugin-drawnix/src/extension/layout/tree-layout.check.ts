import {
  compensateViewportForNodeTopCenter,
  layoutMindmap,
  measureMindmapNode,
} from "./tree-layout";
import type { MindmapDocument, MindmapViewport } from "../model/types";
import type { PositionedMindmapNode } from "./tree-layout";
import {
  assignMindmapBranchColors,
  MINDMAP_BRANCH_PALETTE,
} from "../flow/branch-colors";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertClose(actual: number, expected: number, message: string): void {
  assert(Math.abs(actual - expected) < 0.0001, message);
}

function nodeTopCenterOnScreen(
  node: PositionedMindmapNode,
  viewport: MindmapViewport,
): { x: number; y: number } {
  return {
    x: (node.position.x + node.width / 2) * viewport.zoom + viewport.x,
    y: node.position.y * viewport.zoom + viewport.y,
  };
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

const expectedBranchIds = new Map([
  ["right-a", "right-a"],
  ["right-a-1", "right-a"],
  ["right-a-2", "right-a"],
  ["right-b", "right-b"],
  ["right-b-1", "right-b"],
  ["left-a", "left-a"],
]);

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
  assert(
    result.nodes.find((node) => node.isRoot)?.branchId === null,
    `${layout} root should not belong to a branch`,
  );
  for (const node of result.nodes.filter((item) => !item.isRoot)) {
    assert(
      node.branchId === expectedBranchIds.get(node.id),
      `${layout} should preserve branch identity for node ${node.id}`,
    );
  }
  for (const edge of result.edges) {
    assert(
      edge.branchId === expectedBranchIds.get(edge.target),
      `${layout} should preserve branch identity for edge ${edge.id}`,
    );
  }
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

const collapsedDocument: MindmapDocument = {
  ...document,
  root: {
    ...document.root,
    children: document.root.children.map((child) =>
      child.id === "right-a" ? { ...child, collapsed: true } : child,
    ),
  },
};
const collapsed = layoutMindmap(collapsedDocument);
assert(
  !collapsed.nodes.some((node) => node.id === "right-a-1"),
  "collapsed descendants should not be positioned",
);
assert(
  collapsed.nodes.find((node) => node.id === "right-a")?.branchId === "right-a",
  "collapsed branch root should retain its branch identity",
);
assert(
  collapsed.edges.find((edge) => edge.target === "right-a")?.branchId ===
    "right-a",
  "collapsed branch edge should retain its branch identity",
);

const branchIds = Array.from(
  { length: MINDMAP_BRANCH_PALETTE.length },
  (_, index) => `branch-${index}`,
);
const assignments = assignMindmapBranchColors(branchIds);
assert(
  new Set([...assignments.values()].map((assignment) => assignment.slot))
    .size === MINDMAP_BRANCH_PALETTE.length,
  "branches within palette capacity should receive distinct slots",
);
assert(
  [...assignments.values()].every(
    (assignment) =>
      assignment.light.length > 0 &&
      assignment.dark.length > 0 &&
      !assignment.isOverflow,
  ),
  "normal branch assignments should include light and dark colors",
);

const reorderedAssignments = assignMindmapBranchColors(
  [...branchIds].reverse(),
);
for (const branchId of branchIds) {
  assert(
    reorderedAssignments.get(branchId)?.slot ===
      assignments.get(branchId)?.slot,
    `branch ${branchId} should not be recolored when input order changes`,
  );
}

const preservedAssignments = assignMindmapBranchColors(
  ["new-branch", ...branchIds],
  assignments,
);
for (const branchId of branchIds) {
  assert(
    preservedAssignments.get(branchId)?.slot ===
      assignments.get(branchId)?.slot,
    `existing branch ${branchId} should retain its previous slot`,
  );
}
const overflow = preservedAssignments.get("new-branch");
assert(overflow?.isOverflow, "palette overflow should be explicit");
assert(
  overflow.light === MINDMAP_BRANCH_PALETTE[overflow.slot].light &&
    overflow.dark === MINDMAP_BRANCH_PALETTE[overflow.slot].dark,
  "palette overflow should reuse a documented solid branch color",
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

const largeFontNode = measureMindmapNode(
  "这是一个很长的中文节点标题，需要自动增加节点高度",
  false,
  32,
);
assert(
  largeFontNode.height > longNode.height &&
    largeFontNode.fontSize === 32 &&
    largeFontNode.lineHeight > longNode.lineHeight,
  "custom font size should increase measured typography and height",
);
const largeRoot = measureMindmapNode(document.root.text, true, 32);
assert(
  largeRoot.height > measureMindmapNode(document.root.text, true).height,
  "root font size should participate in measurement",
);

const styledDocument: MindmapDocument = {
  ...document,
  root: {
    ...document.root,
    children: document.root.children.map((child) =>
      child.id === "right-a"
        ? {
            ...child,
            style: { fontSize: 32, borderColor: "#123456" },
          }
        : child,
    ),
  },
};
const styledLayout = layoutMindmap(styledDocument);
const styledRight = styledLayout.nodes.find((node) => node.id === "right-a")!;
const styledRightSibling = styledLayout.nodes.find(
  (node) => node.id === "right-b",
)!;
assert(
  styledRight.height > right.height && styledRight.branchId === "right-a",
  "node styling should change measurement without changing branch identity",
);
assert(
  styledLayout.edges.find((edge) => edge.target === "right-a")?.branchId ===
    "right-a",
  "node border overrides should not change edge branch identity",
);
const [topBranch, bottomBranch] = [styledRight, styledRightSibling].sort(
  (leftNode, rightNode) => leftNode.position.y - rightNode.position.y,
);
assert(
  topBranch.position.y + topBranch.height <= bottomBranch.position.y,
  "large-font sibling branches should not overlap",
);

const testViewport: MindmapViewport = { x: 143.5, y: -87.25, zoom: 1.75 };
for (const layout of [
  "standard",
  "right",
  "left",
  "downward",
  "upward",
] as const) {
  const previousDocument = { ...document, layout };
  const nextDocument: MindmapDocument = {
    ...previousDocument,
    root: {
      ...previousDocument.root,
      children: previousDocument.root.children.map((child) =>
        child.id === "right-a"
          ? { ...child, style: { ...child.style, fontSize: 32 } }
          : child,
      ),
    },
  };
  const previousNode = layoutMindmap(previousDocument).nodes.find(
    (node) => node.id === "right-a",
  )!;
  const nextNode = layoutMindmap(nextDocument).nodes.find(
    (node) => node.id === "right-a",
  )!;
  const compensatedViewport = compensateViewportForNodeTopCenter(
    testViewport,
    previousNode,
    nextNode,
  );
  const previousScreenAnchor = nodeTopCenterOnScreen(
    previousNode,
    testViewport,
  );
  const nextScreenAnchor = nodeTopCenterOnScreen(nextNode, compensatedViewport);
  assertClose(
    nextScreenAnchor.x,
    previousScreenAnchor.x,
    `${layout} should keep the formatted node horizontally anchored`,
  );
  assertClose(
    nextScreenAnchor.y,
    previousScreenAnchor.y,
    `${layout} should keep the formatted node vertically anchored`,
  );
  assert(
    compensatedViewport.zoom === testViewport.zoom,
    `${layout} compensation should preserve zoom`,
  );
}

const rootStyledDocument: MindmapDocument = {
  ...document,
  root: {
    ...document.root,
    style: { ...document.root.style, fontSize: 32 },
  },
};
const previousRoot = layoutMindmap(document).nodes.find((node) => node.isRoot)!;
const nextRoot = layoutMindmap(rootStyledDocument).nodes.find(
  (node) => node.isRoot,
)!;
const rootViewport = compensateViewportForNodeTopCenter(
  testViewport,
  previousRoot,
  nextRoot,
);
const previousRootAnchor = nodeTopCenterOnScreen(previousRoot, testViewport);
const nextRootAnchor = nodeTopCenterOnScreen(nextRoot, rootViewport);
assertClose(
  nextRootAnchor.x,
  previousRootAnchor.x,
  "root font changes should preserve the horizontal anchor",
);
assertClose(
  nextRootAnchor.y,
  previousRootAnchor.y,
  "root font changes should preserve the vertical anchor",
);

const manualDocument: MindmapDocument = {
  ...document,
  root: {
    ...document.root,
    children: document.root.children.map((child) =>
      child.id === "right-a"
        ? { ...child, manualOffset: { x: 47, y: -29 } }
        : child,
    ),
  },
};
const manualStyledDocument: MindmapDocument = {
  ...manualDocument,
  root: {
    ...manualDocument.root,
    children: manualDocument.root.children.map((child) =>
      child.id === "right-a"
        ? { ...child, style: { ...child.style, fontSize: 28 } }
        : child,
    ),
  },
};
const previousManualNode = layoutMindmap(manualDocument).nodes.find(
  (node) => node.id === "right-a",
)!;
const nextManualNode = layoutMindmap(manualStyledDocument).nodes.find(
  (node) => node.id === "right-a",
)!;
const manualViewport = compensateViewportForNodeTopCenter(
  testViewport,
  previousManualNode,
  nextManualNode,
);
const previousManualAnchor = nodeTopCenterOnScreen(
  previousManualNode,
  testViewport,
);
const nextManualAnchor = nodeTopCenterOnScreen(nextManualNode, manualViewport);
assertClose(
  nextManualAnchor.x,
  previousManualAnchor.x,
  "manual offsets should remain horizontally anchored",
);
assertClose(
  nextManualAnchor.y,
  previousManualAnchor.y,
  "manual offsets should remain vertically anchored",
);
assert(
  manualStyledDocument.root.children[0].manualOffset ===
    manualDocument.root.children[0].manualOffset,
  "font compensation should not mutate manual offsets",
);

const enlargedViewport = compensateViewportForNodeTopCenter(
  testViewport,
  right,
  styledRight,
);
const resetViewport = compensateViewportForNodeTopCenter(
  enlargedViewport,
  styledRight,
  right,
);
assertClose(
  resetViewport.x,
  testViewport.x,
  "font reset should restore viewport x",
);
assertClose(
  resetViewport.y,
  testViewport.y,
  "font reset should restore viewport y",
);
assert(
  resetViewport.zoom === testViewport.zoom,
  "font reset should preserve viewport zoom",
);

const colorOnlyDocument: MindmapDocument = {
  ...document,
  root: {
    ...document.root,
    children: document.root.children.map((child) =>
      child.id === "right-a"
        ? { ...child, style: { borderColor: "#123456" } }
        : child,
    ),
  },
};
const colorOnlyNode = layoutMindmap(colorOnlyDocument).nodes.find(
  (node) => node.id === "right-a",
)!;
assert(
  compensateViewportForNodeTopCenter(testViewport, right, colorOnlyNode) ===
    testViewport,
  "non-geometric style changes should not allocate a new viewport",
);

console.log("drawnix layout checks passed");
