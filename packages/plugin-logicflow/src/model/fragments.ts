import { normalizeLayers } from "./layers";
import {
  DIAGRAM_FRAGMENT_VERSION,
  type DiagramFragment,
  type LogicFlowEdgeData,
  type LogicFlowNodeData,
  type LogicFlowPoint,
  type LogicFlowText,
  type Page,
} from "./types";

export type FragmentIdKind = "node" | "edge" | "group" | "layer";
export type FragmentIdFactory = (
  kind: FragmentIdKind,
  sourceId: string,
  index: number,
) => string;

export interface RemappedDiagramFragment {
  fragment: DiagramFragment;
  idMap: ReadonlyMap<string, string>;
}

function translatePoint(
  point: LogicFlowPoint | undefined,
  dx: number,
  dy: number,
): LogicFlowPoint | undefined {
  return point ? { x: point.x + dx, y: point.y + dy } : undefined;
}

function translateText(
  text: string | LogicFlowText | undefined,
  dx: number,
  dy: number,
): string | LogicFlowText | undefined {
  if (!text || typeof text === "string") return text;
  return {
    ...text,
    ...(typeof text.x === "number" ? { x: text.x + dx } : {}),
    ...(typeof text.y === "number" ? { y: text.y + dy } : {}),
  };
}

function translateNode(
  node: LogicFlowNodeData,
  dx: number,
  dy: number,
): LogicFlowNodeData {
  const text = translateText(node.text, dx, dy);
  return {
    ...node,
    x: node.x + dx,
    y: node.y + dy,
    ...(text !== undefined ? { text } : {}),
  };
}

function translateEdge(
  edge: LogicFlowEdgeData,
  dx: number,
  dy: number,
): LogicFlowEdgeData {
  const text = translateText(edge.text, dx, dy);
  const startPoint = translatePoint(edge.startPoint, dx, dy);
  const endPoint = translatePoint(edge.endPoint, dx, dy);
  const pointsList = edge.pointsList?.map((point) => ({
    x: point.x + dx,
    y: point.y + dy,
  }));
  return {
    ...edge,
    ...(text !== undefined ? { text } : {}),
    ...(startPoint ? { startPoint } : {}),
    ...(endPoint ? { endPoint } : {}),
    ...(pointsList ? { pointsList } : {}),
  };
}

export function extractDiagramFragment(
  page: Page,
  selectedNodeIds: readonly string[],
): DiagramFragment {
  const selected = new Set(selectedNodeIds);
  const nodes = page.graph.nodes.filter((node) => selected.has(node.id));
  const includedNodeIds = new Set(nodes.map((node) => node.id));
  const edges = page.graph.edges.filter(
    (edge) =>
      includedNodeIds.has(edge.sourceNodeId) &&
      includedNodeIds.has(edge.targetNodeId),
  );
  const includedElementIds = new Set([
    ...includedNodeIds,
    ...edges.map((edge) => edge.id),
  ]);
  const originX = nodes.length ? Math.min(...nodes.map((node) => node.x)) : 0;
  const originY = nodes.length ? Math.min(...nodes.map((node) => node.y)) : 0;

  return {
    version: DIAGRAM_FRAGMENT_VERSION,
    nodes: nodes.map((node) => translateNode(node, -originX, -originY)),
    edges: edges.map((edge) => translateEdge(edge, -originX, -originY)),
    groups: page.groups
      .map((group) => ({
        ...group,
        nodeIds: group.nodeIds.filter((id) => includedNodeIds.has(id)),
      }))
      .filter((group) => group.nodeIds.length > 0),
    layers: page.layers
      .map((layer) => ({
        ...layer,
        elementIds: layer.elementIds.filter((id) => includedElementIds.has(id)),
      }))
      .filter((layer) => layer.elementIds.length > 0),
  };
}

export const createDiagramFragment = extractDiagramFragment;

export function offsetDiagramFragment(
  fragment: DiagramFragment,
  offset: LogicFlowPoint,
): DiagramFragment {
  const dx = Number.isFinite(offset.x) ? offset.x : 0;
  const dy = Number.isFinite(offset.y) ? offset.y : 0;
  return {
    ...fragment,
    nodes: fragment.nodes.map((node) => translateNode(node, dx, dy)),
    edges: fragment.edges.map((edge) => translateEdge(edge, dx, dy)),
  };
}

function allocateId(requested: string, used: Set<string>): string {
  const base = requested || "copy";
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  const id = `${base}-${suffix}`;
  used.add(id);
  return id;
}

export function remapDiagramFragmentWithMap(
  fragment: DiagramFragment,
  idFactory: FragmentIdFactory = (_kind, sourceId) => `${sourceId}-copy`,
): RemappedDiagramFragment {
  const elementIds = new Map<string, string>();
  const groupIds = new Map<string, string>();
  const layerIds = new Map<string, string>();
  const usedElements = new Set<string>();
  const usedGroups = new Set<string>();
  const usedLayers = new Set<string>();

  fragment.nodes.forEach((node, index) => {
    elementIds.set(
      node.id,
      allocateId(idFactory("node", node.id, index), usedElements),
    );
  });
  fragment.edges.forEach((edge, index) => {
    elementIds.set(
      edge.id,
      allocateId(idFactory("edge", edge.id, index), usedElements),
    );
  });
  fragment.groups.forEach((group, index) => {
    groupIds.set(
      group.id,
      allocateId(idFactory("group", group.id, index), usedGroups),
    );
  });
  fragment.layers.forEach((layer, index) => {
    layerIds.set(
      layer.id,
      allocateId(idFactory("layer", layer.id, index), usedLayers),
    );
  });

  const remapped: DiagramFragment = {
    version: DIAGRAM_FRAGMENT_VERSION,
    nodes: fragment.nodes.map((node) => ({
      ...node,
      id: elementIds.get(node.id)!,
    })),
    edges: fragment.edges.map((edge) => ({
      ...edge,
      id: elementIds.get(edge.id)!,
      sourceNodeId: elementIds.get(edge.sourceNodeId)!,
      targetNodeId: elementIds.get(edge.targetNodeId)!,
    })),
    groups: fragment.groups.map((group) => ({
      ...group,
      id: groupIds.get(group.id)!,
      nodeIds: group.nodeIds.flatMap((id) => {
        const mapped = elementIds.get(id);
        return mapped ? [mapped] : [];
      }),
    })),
    layers: fragment.layers.map((layer) => ({
      ...layer,
      id: layerIds.get(layer.id)!,
      elementIds: layer.elementIds.flatMap((id) => {
        const mapped = elementIds.get(id);
        return mapped ? [mapped] : [];
      }),
    })),
  };
  return { fragment: remapped, idMap: elementIds };
}

export function remapDiagramFragment(
  fragment: DiagramFragment,
  idFactory?: FragmentIdFactory,
): DiagramFragment {
  return remapDiagramFragmentWithMap(fragment, idFactory).fragment;
}

export function insertDiagramFragment(
  page: Page,
  fragment: DiagramFragment,
  offset: LogicFlowPoint = { x: 0, y: 0 },
  idFactory?: FragmentIdFactory,
): Page {
  const pasted = offsetDiagramFragment(
    remapDiagramFragment(fragment, idFactory),
    offset,
  );
  const graph = {
    nodes: [...page.graph.nodes, ...pasted.nodes],
    edges: [...page.graph.edges, ...pasted.edges],
  };
  return {
    ...page,
    graph,
    groups: [...page.groups, ...pasted.groups],
    layers: normalizeLayers([...page.layers, ...pasted.layers], graph),
  };
}
