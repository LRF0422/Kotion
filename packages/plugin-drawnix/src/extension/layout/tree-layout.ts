import type {
  MindmapBranchSide,
  MindmapDocument,
  MindmapNode,
  MindmapPoint,
  MindmapViewport,
} from "../model/types";

export const MINDMAP_NODE_SIZE = {
  rootWidth: 190,
  nodeWidth: 164,
  rootMinHeight: 52,
  nodeMinHeight: 44,
  horizontalPadding: 28,
  verticalPadding: 18,
  lineHeight: 20,
  horizontalLevelGap: 84,
  verticalLevelGap: 68,
  siblingGap: 20,
} as const;

export const MINDMAP_FONT_SIZE = {
  root: 14,
  node: 13,
} as const;

export type MindmapDirection = "left" | "right" | "up" | "down";

export interface MindmapNodeMeasurement {
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
}

export interface PositionedMindmapNode extends MindmapNodeMeasurement {
  id: string;
  node: MindmapNode;
  parentId: string | null;
  branchId: string | null;
  position: MindmapPoint;
  basePosition: MindmapPoint;
  depth: number;
  direction: MindmapDirection;
  isRoot: boolean;
}

export interface PositionedMindmapEdge {
  id: string;
  source: string;
  target: string;
  branchId: string;
  direction: MindmapDirection;
}

export interface MindmapLayoutResult {
  nodes: PositionedMindmapNode[];
  edges: PositionedMindmapEdge[];
}

export function compensateViewportForNodeTopCenter(
  viewport: MindmapViewport,
  previousNode: PositionedMindmapNode,
  nextNode: PositionedMindmapNode,
): MindmapViewport {
  const deltaX =
    previousNode.position.x +
    previousNode.width / 2 -
    (nextNode.position.x + nextNode.width / 2);
  const deltaY = previousNode.position.y - nextNode.position.y;
  if (deltaX === 0 && deltaY === 0) return viewport;
  return {
    x: viewport.x + deltaX * viewport.zoom,
    y: viewport.y + deltaY * viewport.zoom,
    zoom: viewport.zoom,
  };
}

function characterWeight(character: string): number {
  if (/\s/.test(character)) return 0.5;
  return character.charCodeAt(0) > 255 ? 1.7 : 1;
}

export function measureMindmapNode(
  text: string,
  isRoot: boolean,
  customFontSize?: number,
): MindmapNodeMeasurement {
  const width = isRoot
    ? MINDMAP_NODE_SIZE.rootWidth
    : MINDMAP_NODE_SIZE.nodeWidth;
  const minHeight = isRoot
    ? MINDMAP_NODE_SIZE.rootMinHeight
    : MINDMAP_NODE_SIZE.nodeMinHeight;
  const defaultFontSize = isRoot
    ? MINDMAP_FONT_SIZE.root
    : MINDMAP_FONT_SIZE.node;
  const fontSize = customFontSize ?? defaultFontSize;
  const lineHeight = Math.max(
    MINDMAP_NODE_SIZE.lineHeight,
    Math.ceil(fontSize * 1.4),
  );
  const weightedLines = text.split("\n").reduce((lineCount, line) => {
    const weight = [...line].reduce(
      (total, character) => total + characterWeight(character),
      0,
    );
    const available = width - MINDMAP_NODE_SIZE.horizontalPadding;
    const estimatedLineWidth = weight * 8 * (fontSize / defaultFontSize);
    return lineCount + Math.max(1, Math.ceil(estimatedLineWidth / available));
  }, 0);
  return {
    width,
    height: Math.max(
      minHeight,
      weightedLines * lineHeight + MINDMAP_NODE_SIZE.verticalPadding,
    ),
    fontSize,
    lineHeight,
  };
}

interface LayoutContext {
  nodes: PositionedMindmapNode[];
  edges: PositionedMindmapEdge[];
  measurements: Map<string, MindmapNodeMeasurement>;
  spans: Map<string, number>;
}

function isHorizontal(direction: MindmapDirection): boolean {
  return direction === "left" || direction === "right";
}

function directionSign(direction: MindmapDirection): number {
  return direction === "left" || direction === "up" ? -1 : 1;
}

function visibleChildren(node: MindmapNode): MindmapNode[] {
  return node.collapsed ? [] : node.children;
}

function getMeasurement(
  node: MindmapNode,
  rootId: string,
  context: LayoutContext,
): MindmapNodeMeasurement {
  const cached = context.measurements.get(node.id);
  if (cached) return cached;
  const measurement = measureMindmapNode(
    node.text,
    node.id === rootId,
    node.style?.fontSize,
  );
  context.measurements.set(node.id, measurement);
  return measurement;
}

function getSubtreeSpan(
  node: MindmapNode,
  direction: MindmapDirection,
  rootId: string,
  context: LayoutContext,
): number {
  const cacheKey = `${direction}:${node.id}`;
  const cached = context.spans.get(cacheKey);
  if (cached !== undefined) return cached;

  const measurement = getMeasurement(node, rootId, context);
  const nodeCrossSize = isHorizontal(direction)
    ? measurement.height
    : measurement.width;
  const children = visibleChildren(node);
  const childrenSpan =
    children.length === 0
      ? 0
      : children.reduce(
          (total, child) =>
            total + getSubtreeSpan(child, direction, rootId, context),
          0,
        ) +
        MINDMAP_NODE_SIZE.siblingGap * (children.length - 1);
  const span = Math.max(nodeCrossSize, childrenSpan);
  context.spans.set(cacheKey, span);
  return span;
}

function toTopLeft(
  mainCenter: number,
  crossCenter: number,
  measurement: MindmapNodeMeasurement,
  direction: MindmapDirection,
): MindmapPoint {
  if (isHorizontal(direction)) {
    return {
      x: mainCenter - measurement.width / 2,
      y: crossCenter - measurement.height / 2,
    };
  }
  return {
    x: crossCenter - measurement.width / 2,
    y: mainCenter - measurement.height / 2,
  };
}

function addOffset(
  position: MindmapPoint,
  offset?: MindmapPoint,
): MindmapPoint {
  return offset
    ? { x: position.x + offset.x, y: position.y + offset.y }
    : position;
}

function layoutBranch(
  node: MindmapNode,
  parentId: string,
  branchId: string,
  parentMainCenter: number,
  crossCenter: number,
  parentMeasurement: MindmapNodeMeasurement,
  direction: MindmapDirection,
  depth: number,
  rootId: string,
  context: LayoutContext,
): void {
  const measurement = getMeasurement(node, rootId, context);
  const horizontal = isHorizontal(direction);
  const parentMainSize = horizontal
    ? parentMeasurement.width
    : parentMeasurement.height;
  const nodeMainSize = horizontal ? measurement.width : measurement.height;
  const levelGap = horizontal
    ? MINDMAP_NODE_SIZE.horizontalLevelGap
    : MINDMAP_NODE_SIZE.verticalLevelGap;
  const mainCenter =
    parentMainCenter +
    directionSign(direction) *
      (parentMainSize / 2 + levelGap + nodeMainSize / 2);
  const basePosition = toTopLeft(
    mainCenter,
    crossCenter,
    measurement,
    direction,
  );

  context.nodes.push({
    id: node.id,
    node,
    parentId,
    branchId,
    position: addOffset(basePosition, node.manualOffset),
    basePosition,
    width: measurement.width,
    height: measurement.height,
    fontSize: measurement.fontSize,
    lineHeight: measurement.lineHeight,
    depth,
    direction,
    isRoot: false,
  });
  context.edges.push({
    id: `${parentId}:${node.id}`,
    source: parentId,
    target: node.id,
    branchId,
    direction,
  });

  const children = visibleChildren(node);
  if (children.length === 0) return;
  const totalSpan =
    children.reduce(
      (total, child) =>
        total + getSubtreeSpan(child, direction, rootId, context),
      0,
    ) +
    MINDMAP_NODE_SIZE.siblingGap * (children.length - 1);
  let cursor = crossCenter - totalSpan / 2;
  for (const child of children) {
    const childSpan = getSubtreeSpan(child, direction, rootId, context);
    const childCrossCenter = cursor + childSpan / 2;
    layoutBranch(
      child,
      node.id,
      branchId,
      mainCenter,
      childCrossCenter,
      measurement,
      direction,
      depth + 1,
      rootId,
      context,
    );
    cursor += childSpan + MINDMAP_NODE_SIZE.siblingGap;
  }
}

function layoutRootChildren(
  children: MindmapNode[],
  direction: MindmapDirection,
  root: MindmapNode,
  rootMeasurement: MindmapNodeMeasurement,
  context: LayoutContext,
): void {
  if (children.length === 0) return;
  const totalSpan =
    children.reduce(
      (total, child) =>
        total + getSubtreeSpan(child, direction, root.id, context),
      0,
    ) +
    MINDMAP_NODE_SIZE.siblingGap * (children.length - 1);
  let cursor = -totalSpan / 2;
  for (const child of children) {
    const childSpan = getSubtreeSpan(child, direction, root.id, context);
    layoutBranch(
      child,
      root.id,
      child.id,
      0,
      cursor + childSpan / 2,
      rootMeasurement,
      direction,
      1,
      root.id,
      context,
    );
    cursor += childSpan + MINDMAP_NODE_SIZE.siblingGap;
  }
}

function standardSide(node: MindmapNode): MindmapBranchSide {
  return node.side === "left" ? "left" : "right";
}

export function layoutMindmap(document: MindmapDocument): MindmapLayoutResult {
  const context: LayoutContext = {
    nodes: [],
    edges: [],
    measurements: new Map(),
    spans: new Map(),
  };
  const rootMeasurement = getMeasurement(
    document.root,
    document.root.id,
    context,
  );
  const rootBasePosition = {
    x: -rootMeasurement.width / 2,
    y: -rootMeasurement.height / 2,
  };
  context.nodes.push({
    id: document.root.id,
    node: document.root,
    parentId: null,
    branchId: null,
    position: rootBasePosition,
    basePosition: rootBasePosition,
    width: rootMeasurement.width,
    height: rootMeasurement.height,
    fontSize: rootMeasurement.fontSize,
    lineHeight: rootMeasurement.lineHeight,
    depth: 0,
    direction:
      document.layout === "left"
        ? "left"
        : document.layout === "upward"
          ? "up"
          : document.layout === "downward"
            ? "down"
            : "right",
    isRoot: true,
  });

  if (document.root.collapsed) return context;

  if (document.layout === "standard") {
    layoutRootChildren(
      document.root.children.filter((child) => standardSide(child) === "right"),
      "right",
      document.root,
      rootMeasurement,
      context,
    );
    layoutRootChildren(
      document.root.children.filter((child) => standardSide(child) === "left"),
      "left",
      document.root,
      rootMeasurement,
      context,
    );
  } else {
    const direction: MindmapDirection =
      document.layout === "left"
        ? "left"
        : document.layout === "upward"
          ? "up"
          : document.layout === "downward"
            ? "down"
            : "right";
    layoutRootChildren(
      document.root.children,
      direction,
      document.root,
      rootMeasurement,
      context,
    );
  }

  return context;
}
