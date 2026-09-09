import { getShapeDefinition } from "../../shapes/shape-registry";

export type LogicFlowLayoutDirection = "vertical" | "horizontal";

export interface LogicFlowLayoutNodeInput {
  id: string;
  label: string;
  type?: string;
}

export interface LogicFlowLayoutEdgeInput {
  from: string;
  to: string;
}

export interface PositionedLogicFlowNode extends LogicFlowLayoutNodeInput {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LogicFlowLayoutResult {
  nodes: PositionedLogicFlowNode[];
  width: number;
  height: number;
  layers: string[][];
}

const PADDING = 80;
const NODE_GAP = 80;
const RANK_GAP = 120;
const DEFAULT_SIZE = { width: 160, height: 72 };
const SHAPE_FALLBACKS: Record<string, { width: number; height: number }> = {
  rect: DEFAULT_SIZE,
  ellipse: { width: 160, height: 88 },
  diamond: { width: 160, height: 112 },
  circle: { width: 96, height: 96 },
  text: { width: 140, height: 48 },
};

function labelUnits(value: string): number {
  return Array.from(value).reduce(
    (total, character) => total + (character.charCodeAt(0) > 255 ? 2 : 1),
    0,
  );
}

function resolveNodeSize(node: LogicFlowLayoutNodeInput): {
  width: number;
  height: number;
} {
  const type = node.type ?? "rect";
  const definition = getShapeDefinition(type);
  const fallback = SHAPE_FALLBACKS[type] ?? DEFAULT_SIZE;
  const baseWidth = definition?.width ?? fallback.width;
  const baseHeight = definition?.height ?? fallback.height;
  const lines = node.label.split(/\r?\n/);
  const widestLine = Math.max(0, ...lines.map(labelUnits));
  const labelWidth = Math.min(360, widestLine * 8 + 40);
  const labelHeight = Math.min(240, lines.length * 22 + 32);
  return {
    width: Math.max(baseWidth, labelWidth),
    height: Math.max(baseHeight, labelHeight),
  };
}

function createLayers(
  nodes: LogicFlowLayoutNodeInput[],
  edges: LogicFlowLayoutEdgeInput[],
): string[][] {
  const order = new Map(nodes.map((node, index) => [node.id, index]));
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const inDegree = new Map(nodes.map((node) => [node.id, 0]));

  for (const edge of edges) {
    if (
      edge.from === edge.to ||
      !adjacency.has(edge.from) ||
      !inDegree.has(edge.to)
    ) {
      continue;
    }
    adjacency.get(edge.from)!.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const sortByInputOrder = (ids: string[]) =>
    ids.sort(
      (left, right) =>
        (order.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right) ?? Number.MAX_SAFE_INTEGER),
    );
  const assigned = new Set<string>();
  const layers: string[][] = [];
  let queue = sortByInputOrder(
    nodes.filter((node) => inDegree.get(node.id) === 0).map((node) => node.id),
  );

  while (assigned.size < nodes.length) {
    if (!queue.length) {
      const next = nodes.find((node) => !assigned.has(node.id));
      if (!next) break;
      queue = [next.id];
    }

    const layer = sortByInputOrder(
      [...new Set(queue)].filter((id) => !assigned.has(id)),
    );
    if (!layer.length) {
      queue = [];
      continue;
    }

    layers.push(layer);
    for (const id of layer) assigned.add(id);

    const nextQueue = new Set<string>();
    for (const id of layer) {
      for (const target of adjacency.get(id) ?? []) {
        if (assigned.has(target)) continue;
        const remaining = (inDegree.get(target) ?? 1) - 1;
        inDegree.set(target, remaining);
        if (remaining <= 0) nextQueue.add(target);
      }
    }
    queue = sortByInputOrder([...nextQueue]);
  }

  return layers;
}

export function computeLayeredLogicFlowLayout(
  nodes: LogicFlowLayoutNodeInput[],
  edges: LogicFlowLayoutEdgeInput[],
  direction: LogicFlowLayoutDirection = "vertical",
): LogicFlowLayoutResult {
  if (!nodes.length) return { nodes: [], width: 0, height: 0, layers: [] };

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const sizeById = new Map(
    nodes.map((node) => [node.id, resolveNodeSize(node)]),
  );
  const layers = createLayers(nodes, edges);
  const vertical = direction === "vertical";

  const crossSizes = layers.map((layer) =>
    layer.reduce((total, id, index) => {
      const size = sizeById.get(id)!;
      return (
        total + (vertical ? size.width : size.height) + (index ? NODE_GAP : 0)
      );
    }, 0),
  );
  const maxCrossSize = Math.max(...crossSizes, 0);
  const positioned = new Map<string, PositionedLogicFlowNode>();
  let mainOffset = PADDING;

  layers.forEach((layer, layerIndex) => {
    const mainSize = Math.max(
      ...layer.map((id) => {
        const size = sizeById.get(id)!;
        return vertical ? size.height : size.width;
      }),
    );
    let crossOffset = PADDING + (maxCrossSize - crossSizes[layerIndex]) / 2;

    for (const id of layer) {
      const node = nodeById.get(id)!;
      const size = sizeById.get(id)!;
      positioned.set(id, {
        ...node,
        type: node.type ?? "rect",
        x: vertical
          ? crossOffset + size.width / 2
          : mainOffset + size.width / 2,
        y: vertical
          ? mainOffset + size.height / 2
          : crossOffset + size.height / 2,
        width: size.width,
        height: size.height,
      });
      crossOffset += (vertical ? size.width : size.height) + NODE_GAP;
    }

    mainOffset += mainSize + RANK_GAP;
  });

  const mainSize = Math.max(0, mainOffset - RANK_GAP + PADDING);
  return {
    nodes: nodes.map((node) => positioned.get(node.id)!),
    width: vertical ? maxCrossSize + PADDING * 2 : mainSize,
    height: vertical ? mainSize : maxCrossSize + PADDING * 2,
    layers,
  };
}
