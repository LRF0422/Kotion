import type {
  MindmapBranchSide,
  MindmapDocument,
  MindmapNode,
  MindmapPoint,
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

export type MindmapDirection = "left" | "right" | "up" | "down";

export interface MindmapNodeMeasurement {
  width: number;
  height: number;
}

export interface PositionedMindmapNode extends MindmapNodeMeasurement {
  id: string;
  node: MindmapNode;
  parentId: string | null;
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
  direction: MindmapDirection;
}

export interface MindmapLayoutResult {
  nodes: PositionedMindmapNode[];
  edges: PositionedMindmapEdge[];
}

function characterWeight(character: string): number {
  if (/\s/.test(character)) return 0.5;
  return character.charCodeAt(0) > 255 ? 1.7 : 1;
}

export function measureMindmapNode(
  text: string,
  isRoot: boolean,
): MindmapNodeMeasurement {
  const width = isRoot
    ? MINDMAP_NODE_SIZE.rootWidth
    : MINDMAP_NODE_SIZE.nodeWidth;
  const minHeight = isRoot
    ? MINDMAP_NODE_SIZE.rootMinHeight
    : MINDMAP_NODE_SIZE.nodeMinHeight;
  const weightedLines = text.split("\n").reduce((lineCount, line) => {
    const weight = [...line].reduce(
      (total, character) => total + characterWeight(character),
      0,
    );
    const available = width - MINDMAP_NODE_SIZE.horizontalPadding;
    const estimatedLineWidth = weight * 8;
    return lineCount + Math.max(1, Math.ceil(estimatedLineWidth / available));
  }, 0);
  return {
    width,
    height: Math.max(
      minHeight,
      weightedLines * MINDMAP_NODE_SIZE.lineHeight +
        MINDMAP_NODE_SIZE.verticalPadding,
    ),
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
  const measurement = measureMindmapNode(node.text, node.id === rootId);
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
    position: addOffset(basePosition, node.manualOffset),
    basePosition,
    width: measurement.width,
    height: measurement.height,
    depth,
    direction,
    isRoot: false,
  });
  context.edges.push({
    id: `${parentId}:${node.id}`,
    source: parentId,
    target: node.id,
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
    position: rootBasePosition,
    basePosition: rootBasePosition,
    width: rootMeasurement.width,
    height: rootMeasurement.height,
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
