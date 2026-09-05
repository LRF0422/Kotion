import type {
  MindmapBranchSide,
  MindmapDocument,
  MindmapLayout,
  MindmapNode,
  MindmapNodeData,
  MindmapNodeStyle,
  MindmapPoint,
} from "./types";
import {
  normalizeMindmapColor,
  normalizeMindmapFontSize,
  normalizeMindmapHref,
} from "./normalize";

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
  if (node.id === nodeId) {
    const next = updater(node);
    return [next, next !== node];
  }
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
  const [root, changed] = updateNode(document.root, nodeId, (node) =>
    node.text === text ? node : { ...node, text },
  );
  return changed ? { ...document, root } : null;
}

export type MindmapNodeStylePatch = {
  [Key in keyof MindmapNodeStyle]?: MindmapNodeStyle[Key] | null;
};

const STYLE_KEYS = [
  "fontSize",
  "textColor",
  "borderColor",
  "backgroundColor",
] as const satisfies ReadonlyArray<keyof MindmapNodeStyle>;

function sameNodeStyle(
  left: MindmapNodeStyle | undefined,
  right: MindmapNodeStyle | undefined,
): boolean {
  return STYLE_KEYS.every((key) => left?.[key] === right?.[key]);
}

function normalizeStyleValue(
  key: keyof MindmapNodeStyle,
  value: unknown,
): number | string | undefined {
  return key === "fontSize"
    ? normalizeMindmapFontSize(value)
    : normalizeMindmapColor(value);
}

export function updateMindmapNodeStyle(
  document: MindmapDocument,
  nodeId: string,
  patch: MindmapNodeStylePatch | null,
): MindmapDocument | null {
  if (!findMindmapNode(document.root, nodeId)) return null;
  const [root, changed] = updateNode(document.root, nodeId, (node) => {
    if (patch === null) {
      if (!node.style) return node;
      const { style: _style, ...withoutStyle } = node;
      return withoutStyle;
    }

    const nextStyle: MindmapNodeStyle = { ...node.style };
    for (const key of STYLE_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
      const value = patch[key];
      if (value === null || value === undefined) {
        delete nextStyle[key];
        continue;
      }
      const normalized = normalizeStyleValue(key, value);
      if (normalized === undefined) continue;
      if (key === "fontSize") nextStyle.fontSize = normalized as number;
      else nextStyle[key] = normalized as string;
    }

    const normalizedStyle =
      Object.keys(nextStyle).length > 0 ? nextStyle : undefined;
    if (sameNodeStyle(node.style, normalizedStyle)) return node;
    if (!normalizedStyle) {
      const { style: _style, ...withoutStyle } = node;
      return withoutStyle;
    }
    return { ...node, style: normalizedStyle };
  });
  return changed ? { ...document, root } : document;
}

export function updateMindmapNodeHref(
  document: MindmapDocument,
  nodeId: string,
  href: string | null,
): MindmapDocument | null {
  if (!findMindmapNode(document.root, nodeId)) return null;
  const remove = href === null || href.trim() === "";
  const normalizedHref = remove ? undefined : normalizeMindmapHref(href);
  if (!remove && !normalizedHref) return null;

  const [root, changed] = updateNode(document.root, nodeId, (node) => {
    if (node.href === normalizedHref) return node;
    if (!normalizedHref) {
      const { href: _href, ...withoutHref } = node;
      return withoutHref;
    }
    return { ...node, href: normalizedHref };
  });
  return changed ? { ...document, root } : document;
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
    ...(node.style ? { style: { ...node.style } } : {}),
    ...(node.href ? { href: node.href } : {}),
  };
}

export function createMindmapNode(
  id: string,
  text: string,
  children: MindmapNode[] = [],
  attributes: Pick<MindmapNode, "style" | "href"> = {},
): MindmapNode {
  return {
    id,
    text,
    children,
    ...(attributes.style ? { style: { ...attributes.style } } : {}),
    ...(attributes.href ? { href: attributes.href } : {}),
  };
}
