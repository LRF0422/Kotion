import type {
  MindmapBranchSide,
  MindmapDocument,
  MindmapLayout,
  MindmapNode,
  MindmapNodeData,
  MindmapPoint,
} from "./types";

export function findMindmapNode(
  root: MindmapNode,
  nodeId: string,
): MindmapNode | null {
  if (root.id === nodeId) return root;
  for (const child of root.children) {
    const found = findMindmapNode(child, nodeId);
    if (found) return found;
  }
  return null;
}

export function findMindmapParent(
  root: MindmapNode,
  nodeId: string,
): MindmapNode | null {
  if (root.children.some((child) => child.id === nodeId)) return root;
  for (const child of root.children) {
    const found = findMindmapParent(child, nodeId);
    if (found) return found;
  }
  return null;
}

function updateNode(
  node: MindmapNode,
  nodeId: string,
  updater: (node: MindmapNode) => MindmapNode,
): [MindmapNode, boolean] {
  if (node.id === nodeId) return [updater(node), true];
  for (let index = 0; index < node.children.length; index += 1) {
    const [nextChild, changed] = updateNode(
      node.children[index],
      nodeId,
      updater,
    );
    if (changed) {
      const children = node.children.slice();
      children[index] = nextChild;
      return [{ ...node, children }, true];
    }
  }
  return [node, false];
}

function visibleWeight(node: MindmapNode): number {
  if (node.collapsed) return 1;
  return (
    1 + node.children.reduce((total, child) => total + visibleWeight(child), 0)
  );
}

function chooseRootSide(root: MindmapNode): MindmapBranchSide {
  const weights = root.children.reduce(
    (result, child) => {
      result[child.side === "left" ? "left" : "right"] += visibleWeight(child);
      return result;
    },
    { left: 0, right: 0 },
  );
  return weights.right <= weights.left ? "right" : "left";
}

function withRootSide(node: MindmapNode, side: MindmapBranchSide): MindmapNode {
  return { ...node, side };
}

export function addMindmapChild(
  document: MindmapDocument,
  parentId: string,
  newNode: MindmapNode,
): MindmapDocument | null {
  const parent = findMindmapNode(document.root, parentId);
  if (!parent) return null;
  const child =
    parent.id === document.root.id && document.layout === "standard"
      ? withRootSide(newNode, newNode.side ?? chooseRootSide(document.root))
      : newNode;
  const [root, changed] = updateNode(document.root, parentId, (node) => ({
    ...node,
    collapsed: false,
    children: [...node.children, child],
  }));
  return changed ? { ...document, root } : null;
}

export function addMindmapSibling(
  document: MindmapDocument,
  nodeId: string,
  newNode: MindmapNode,
): MindmapDocument | null {
  if (nodeId === document.root.id)
    return addMindmapChild(document, document.root.id, newNode);
  const parent = findMindmapParent(document.root, nodeId);
  if (!parent) return null;
  const selected = parent.children.find((child) => child.id === nodeId);
  const sibling =
    parent.id === document.root.id && selected?.side
      ? withRootSide(newNode, selected.side)
      : newNode;
  const [root, changed] = updateNode(document.root, parent.id, (node) => {
    const index = node.children.findIndex((child) => child.id === nodeId);
    const children = node.children.slice();
    children.splice(index + 1, 0, sibling);
    return { ...node, children };
  });
  return changed ? { ...document, root } : null;
}

export function deleteMindmapNode(
  document: MindmapDocument,
  nodeId: string,
): MindmapDocument | null {
  if (document.root.id === nodeId) return null;
  const parent = findMindmapParent(document.root, nodeId);
  if (!parent) return null;
  const [root, changed] = updateNode(document.root, parent.id, (node) => ({
    ...node,
    children: node.children.filter((child) => child.id !== nodeId),
  }));
  return changed ? { ...document, root } : null;
}

export function updateMindmapNodeText(
  document: MindmapDocument,
  nodeId: string,
  text: string,
): MindmapDocument | null {
  const [root, changed] = updateNode(document.root, nodeId, (node) => ({
    ...node,
    text,
  }));
  return changed ? { ...document, root } : null;
}

export function toggleMindmapNodeCollapsed(
  document: MindmapDocument,
  nodeId: string,
): MindmapDocument | null {
  const target = findMindmapNode(document.root, nodeId);
  if (!target || target.children.length === 0) return null;
  const [root, changed] = updateNode(document.root, nodeId, (node) => ({
    ...node,
    collapsed: !node.collapsed,
  }));
  return changed ? { ...document, root } : null;
}

function clearManualOffsets(node: MindmapNode): MindmapNode {
  return {
    ...node,
    manualOffset: undefined,
    children: node.children.map(clearManualOffsets),
  };
}

export function setMindmapLayout(
  document: MindmapDocument,
  layout: MindmapLayout,
): MindmapDocument {
  if (document.layout === layout) return document;
  return { ...document, layout, root: clearManualOffsets(document.root) };
}

export function setMindmapManualOffset(
  document: MindmapDocument,
  nodeId: string,
  manualOffset: MindmapPoint | undefined,
): MindmapDocument | null {
  if (nodeId === document.root.id) return null;
  const [root, changed] = updateNode(document.root, nodeId, (node) => ({
    ...node,
    manualOffset,
  }));
  return changed ? { ...document, root } : null;
}

export function extractMindmapStructure(node: MindmapNode): MindmapNodeData {
  return {
    id: node.id,
    text: node.text,
    children: node.children.map(extractMindmapStructure),
  };
}

export function createMindmapNode(
  id: string,
  text: string,
  children: MindmapNode[] = [],
): MindmapNode {
  return { id, text, children };
}
