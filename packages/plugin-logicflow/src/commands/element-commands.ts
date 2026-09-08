import { nanoid } from "nanoid";
import {
  insertDiagramFragment,
  extractDiagramFragment,
} from "../model/fragments";
import { normalizeLayers } from "../model/layers";
import type {
  JsonValue,
  LogicFlowEdgeData,
  LogicFlowNodeData,
  LogicFlowPoint,
  Page,
} from "../model/types";
import { createSelectionState, isElementLocked } from "./selection";

function patchElement<T extends LogicFlowNodeData | LogicFlowEdgeData>(
  element: T,
  patch: Partial<T>,
): T {
  return { ...element, ...patch };
}

export function patchElementProperties(
  page: Page,
  ids: readonly string[],
  patch: Record<string, JsonValue | undefined>,
): Page {
  const editable = new Set(createSelectionState(page, ids).editableIds);
  const apply = <T extends LogicFlowNodeData | LogicFlowEdgeData>(
    element: T,
  ): T => {
    if (!editable.has(element.id)) return element;
    const properties = { ...(element.properties ?? {}) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete properties[key];
      else properties[key] = value;
    }
    return { ...element, properties };
  };
  return {
    ...page,
    graph: {
      nodes: page.graph.nodes.map(apply),
      edges: page.graph.edges.map(apply),
    },
  };
}

export function deleteElements(page: Page, ids: readonly string[]): Page {
  const editable = new Set(createSelectionState(page, ids).editableIds);
  const deletedNodes = new Set(
    page.graph.nodes
      .filter((node) => editable.has(node.id))
      .map((node) => node.id),
  );
  const graph = {
    nodes: page.graph.nodes.filter((node) => !editable.has(node.id)),
    edges: page.graph.edges.filter(
      (edge) =>
        !editable.has(edge.id) &&
        !deletedNodes.has(edge.sourceNodeId) &&
        !deletedNodes.has(edge.targetNodeId),
    ),
  };
  return {
    ...page,
    graph,
    groups: page.groups
      .map((group) => ({
        ...group,
        nodeIds: group.nodeIds.filter((id) => !deletedNodes.has(id)),
      }))
      .filter((group) => group.nodeIds.length > 1),
    layers: normalizeLayers(page.layers, graph),
  };
}

export function duplicateElements(
  page: Page,
  ids: readonly string[],
  offset: LogicFlowPoint = { x: 24, y: 24 },
): Page {
  const state = createSelectionState(page, ids);
  if (!state.nodeIds.length) return page;
  const fragment = extractDiagramFragment(page, state.nodeIds);
  return insertDiagramFragment(
    page,
    fragment,
    offset,
    (kind) => `${kind}-${nanoid(10)}`,
  );
}

export function setElementsLocked(
  page: Page,
  ids: readonly string[],
  locked: boolean,
): Page {
  const existing = ids.filter(
    (id) =>
      page.graph.nodes.some((node) => node.id === id) ||
      page.graph.edges.some((edge) => edge.id === id),
  );
  return patchElementProperties(page, existing, { locked });
}

export function rotateNodes(
  page: Page,
  ids: readonly string[],
  angle: number | "reset",
): Page {
  const selected = new Set(ids);
  return {
    ...page,
    graph: {
      ...page.graph,
      nodes: page.graph.nodes.map((node) => {
        if (!selected.has(node.id) || isElementLocked(page, node.id))
          return node;
        const current = typeof node.rotate === "number" ? node.rotate : 0;
        return patchElement(node, {
          rotate: angle === "reset" ? 0 : (current + angle + 360) % 360,
        });
      }),
    },
  };
}

export function flipNodes(
  page: Page,
  ids: readonly string[],
  axis: "horizontal" | "vertical",
): Page {
  const selected = new Set(ids);
  const key = axis === "horizontal" ? "flipX" : "flipY";
  return {
    ...page,
    graph: {
      ...page.graph,
      nodes: page.graph.nodes.map((node) => {
        if (!selected.has(node.id) || isElementLocked(page, node.id))
          return node;
        return {
          ...node,
          properties: {
            ...(node.properties ?? {}),
            [key]: node.properties?.[key] !== true,
          },
        };
      }),
    },
  };
}

export function nudgeNodes(
  page: Page,
  ids: readonly string[],
  dx: number,
  dy: number,
): Page {
  const selected = new Set(ids);
  return {
    ...page,
    graph: {
      ...page.graph,
      nodes: page.graph.nodes.map((node) =>
        selected.has(node.id) && !isElementLocked(page, node.id)
          ? { ...node, x: node.x + dx, y: node.y + dy }
          : node,
      ),
    },
  };
}

export function reverseEdges(page: Page, ids: readonly string[]): Page {
  const selected = new Set(ids);
  return {
    ...page,
    graph: {
      ...page.graph,
      edges: page.graph.edges.map((edge) => {
        if (!selected.has(edge.id) || isElementLocked(page, edge.id))
          return edge;
        return {
          ...edge,
          sourceNodeId: edge.targetNodeId,
          targetNodeId: edge.sourceNodeId,
          startPoint: edge.endPoint,
          endPoint: edge.startPoint,
          pointsList: edge.pointsList
            ? [...edge.pointsList].reverse()
            : undefined,
        };
      }),
    },
  };
}

export function changeEdgesType(
  page: Page,
  ids: readonly string[],
  type: string,
): Page {
  const selected = new Set(ids);
  return {
    ...page,
    graph: {
      ...page.graph,
      edges: page.graph.edges.map((edge) =>
        selected.has(edge.id) && !isElementLocked(page, edge.id)
          ? { ...edge, type }
          : edge,
      ),
    },
  };
}

export function selectAllElementIds(page: Page): string[] {
  return [
    ...page.graph.nodes.map((node) => node.id),
    ...page.graph.edges.map((edge) => edge.id),
  ];
}
