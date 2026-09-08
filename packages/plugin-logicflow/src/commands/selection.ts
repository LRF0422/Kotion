import { getElementLayerId } from "../model/layers";
import type {
  JsonValue,
  LogicFlowEdgeData,
  LogicFlowNodeData,
  Page,
} from "../model/types";

export const MIXED_VALUE = Symbol("logicflow-mixed-value");
export type MixedValue<T> = T | typeof MIXED_VALUE | undefined;
export type DiagramElement = LogicFlowNodeData | LogicFlowEdgeData;

export interface SelectionState {
  ids: string[];
  nodeIds: string[];
  edgeIds: string[];
  elements: DiagramElement[];
  kind: "none" | "node" | "edge" | "mixed";
  lockedIds: string[];
  editableIds: string[];
}

export function getElement(page: Page, id: string): DiagramElement | undefined {
  return (
    page.graph.nodes.find((node) => node.id === id) ??
    page.graph.edges.find((edge) => edge.id === id)
  );
}

export function isElementLocked(page: Page, id: string): boolean {
  const element = getElement(page, id);
  if (!element) return true;
  if (element.properties?.locked === true) return true;
  const layerId = getElementLayerId(page, id);
  return Boolean(page.layers.find((layer) => layer.id === layerId)?.locked);
}

export function createSelectionState(
  page: Page,
  ids: readonly string[],
): SelectionState {
  const unique = [...new Set(ids)].filter((id) => getElement(page, id));
  const nodeSet = new Set(page.graph.nodes.map((node) => node.id));
  const nodeIds = unique.filter((id) => nodeSet.has(id));
  const edgeIds = unique.filter((id) => !nodeSet.has(id));
  const lockedIds = unique.filter((id) => isElementLocked(page, id));
  const locked = new Set(lockedIds);
  return {
    ids: unique,
    nodeIds,
    edgeIds,
    elements: unique.flatMap((id) => {
      const element = getElement(page, id);
      return element ? [element] : [];
    }),
    kind: !unique.length
      ? "none"
      : nodeIds.length === unique.length
        ? "node"
        : edgeIds.length === unique.length
          ? "edge"
          : "mixed",
    lockedIds,
    editableIds: unique.filter((id) => !locked.has(id)),
  };
}

export function commonProperty(
  selection: SelectionState,
  key: string,
): MixedValue<JsonValue> {
  if (!selection.elements.length) return undefined;
  const values = selection.elements.map((element) => element.properties?.[key]);
  const first = JSON.stringify(values[0]);
  return values.every((value) => JSON.stringify(value) === first)
    ? values[0]
    : MIXED_VALUE;
}
