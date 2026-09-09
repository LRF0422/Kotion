import { nanoid } from "nanoid";
import {
  insertDiagramFragment,
  extractDiagramFragment,
} from "../model/fragments";
import { buildContainerIndex, physicalContainerIds } from "../composites";
import { removeContainerReferences } from "../composites/commands";
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
  const index = buildContainerIndex(page.graph);
  const editableSelected = ids.filter((id) => !isElementLocked(page, id));
  const deletedIds = new Set(index.expandRoots(editableSelected, "delete"));
  const deletedNodes = new Set(
    page.graph.nodes
      .filter((node) => deletedIds.has(node.id))
      .map((node) => node.id),
  );
  const graph = removeContainerReferences(
    {
      nodes: page.graph.nodes,
      edges: page.graph.edges.filter(
        (edge) =>
          !deletedIds.has(edge.id) &&
          !deletedNodes.has(edge.sourceNodeId) &&
          !deletedNodes.has(edge.targetNodeId),
      ),
    },
    deletedIds,
  );
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
  const state = createSelectionState(
    page,
    physicalContainerIds(page.graph, ids, "duplicate"),
  );
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
  const existing = new Set(
    physicalContainerIds(page.graph, ids, "lock").filter((id) => {
      const layer = page.layers.find((item) => item.elementIds.includes(id));
      return !layer?.locked;
    }),
  );
  const apply = <T extends LogicFlowNodeData | LogicFlowEdgeData>(
    element: T,
  ): T =>
    existing.has(element.id)
      ? { ...element, properties: { ...(element.properties ?? {}), locked } }
      : element;
  return {
    ...page,
    graph: {
      nodes: page.graph.nodes.map(apply),
      edges: page.graph.edges.map(apply),
    },
  };
}

export function rotateNodes(
  page: Page,
  ids: readonly string[],
  angle: number | "reset",
): Page {
  const selected = new Set(physicalContainerIds(page.graph, ids, "rotate"));
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
  const selected = new Set(physicalContainerIds(page.graph, ids, "flip"));
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
  const selected = new Set(
    physicalContainerIds(
      page.graph,
      ids.filter((id) => !isElementLocked(page, id)),
      "translate",
    ),
  );
  return {
    ...page,
    graph: {
      ...page.graph,
      nodes: page.graph.nodes.map((node) =>
        selected.has(node.id)
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
