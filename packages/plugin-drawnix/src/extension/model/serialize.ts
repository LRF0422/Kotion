import {
  DRAWNIX_SCHEMA_VERSION,
  type LegacyPlaitElement,
  type MindmapDocument,
  type MindmapNode,
  type PersistedDrawnixData,
} from "./types";

function estimateLegacyWidth(text: string, isRoot: boolean): number {
  if (isRoot) return Math.max(72, Math.min(280, text.length * 12 + 24));
  return Math.max(42, Math.min(240, text.length * 12 + 20));
}

export function semanticNodeToLegacyElement(
  node: MindmapNode,
  isRoot = false,
): LegacyPlaitElement {
  const orderedChildren = isRoot
    ? [
        ...node.children.filter((child) => child.side !== "left"),
        ...node.children.filter((child) => child.side === "left"),
      ]
    : node.children;

  const element: LegacyPlaitElement = {
    id: node.id,
    data: {
      topic: {
        children: [{ text: node.text }],
      },
    },
    children: orderedChildren.map((child) =>
      semanticNodeToLegacyElement(child),
    ),
    width: estimateLegacyWidth(node.text, isRoot),
    height: isRoot ? 32 : 28,
  };

  if (node.collapsed) element.isCollapsed = true;
  if (isRoot) {
    element.type = "mindmap";
    element.isRoot = true;
    element.rightNodeCount = orderedChildren.filter(
      (child) => child.side !== "left",
    ).length;
    element.points = [[0, 0]];
  }
  return element;
}

function cloneNode(node: MindmapNode): MindmapNode {
  return {
    id: node.id,
    text: node.text,
    children: node.children.map(cloneNode),
    ...(node.side ? { side: node.side } : {}),
    ...(node.collapsed ? { collapsed: true } : {}),
    ...(node.manualOffset
      ? { manualOffset: { x: node.manualOffset.x, y: node.manualOffset.y } }
      : {}),
  };
}

export function serializeDrawnixDocument(
  document: MindmapDocument,
): PersistedDrawnixData {
  const root = cloneNode(document.root);
  const legacyRoot = semanticNodeToLegacyElement(root, true);
  legacyRoot.layout = document.layout;

  return {
    schemaVersion: DRAWNIX_SCHEMA_VERSION,
    root,
    layout: document.layout,
    children: [legacyRoot],
    ...(document.viewport
      ? {
          viewport: {
            x: document.viewport.x,
            y: document.viewport.y,
            zoom: document.viewport.zoom,
            offsetX: document.viewport.x,
            offsetY: document.viewport.y,
          },
        }
      : {}),
  };
}
