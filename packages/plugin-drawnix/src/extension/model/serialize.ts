import {
  DRAWNIX_SCHEMA_VERSION,
  type LegacyPlaitElement,
  type MindmapDocument,
  type MindmapNode,
  type PersistedDrawnixData,
} from "./types";

function estimateLegacyWidth(
  text: string,
  isRoot: boolean,
  fontSize?: number,
): number {
  const scale = fontSize ? fontSize / (isRoot ? 14 : 13) : 1;
  if (isRoot) return Math.max(72, Math.min(280, text.length * 12 * scale + 24));
  return Math.max(42, Math.min(240, text.length * 12 * scale + 20));
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

  const topicLeaf: Record<string, unknown> = { text: node.text };
  if (node.style?.textColor) topicLeaf.color = node.style.textColor;
  if (node.style?.fontSize) topicLeaf["font-size"] = `${node.style.fontSize}px`;

  const element: LegacyPlaitElement = {
    id: node.id,
    data: {
      topic: {
        children: [topicLeaf],
      },
    },
    children: orderedChildren.map((child) =>
      semanticNodeToLegacyElement(child),
    ),
    width: estimateLegacyWidth(node.text, isRoot, node.style?.fontSize),
    height: isRoot ? 32 : 28,
  };

  if (node.style?.backgroundColor) element.fill = node.style.backgroundColor;
  if (node.style?.borderColor) element.strokeColor = node.style.borderColor;
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
    ...(node.style ? { style: { ...node.style } } : {}),
    ...(node.href ? { href: node.href } : {}),
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
