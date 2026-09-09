import type {
  Layer,
  LogicFlowGraphData,
  LogicFlowNodeData,
} from "../model/types";
import { buildContainerIndex } from "./graph-index";
import {
  getContainerChildren,
  getContainerMetadata,
  getContainerParent,
  withContainerMetadata,
  withContainerParent,
  withoutContainerParent,
} from "./metadata";
import { containerRegistry } from "./registry";
import type {
  ContainerDefinition,
  ContainerOperation,
  ContainerZone,
} from "./types";

export function physicalContainerIds(
  graph: Pick<LogicFlowGraphData, "nodes">,
  ids: readonly string[],
  operation: ContainerOperation,
): string[] {
  return buildContainerIndex(graph).expandRoots(ids, operation);
}

export function resolveContainerZone(
  definition: ContainerDefinition,
  root: LogicFlowNodeData,
  child: Pick<LogicFlowNodeData, "x" | "y">,
): ContainerZone | undefined {
  const width =
    typeof root.width === "number"
      ? root.width
      : typeof root.properties?.width === "number"
        ? root.properties.width
        : definition.defaultSize.width;
  const height =
    typeof root.height === "number"
      ? root.height
      : typeof root.properties?.height === "number"
        ? root.properties.height
        : definition.defaultSize.height;
  const zones = definition.zones({ x: root.x, y: root.y, width, height });
  return (
    zones.find(
      (zone) =>
        child.x >= zone.x - zone.width / 2 &&
        child.x <= zone.x + zone.width / 2 &&
        child.y >= zone.y - zone.height / 2 &&
        child.y <= zone.y + zone.height / 2,
    ) ??
    zones.reduce<ContainerZone | undefined>((closest, zone) => {
      if (!closest) return zone;
      const currentDistance =
        Math.abs(child.x - closest.x) + Math.abs(child.y - closest.y);
      const nextDistance =
        Math.abs(child.x - zone.x) + Math.abs(child.y - zone.y);
      return nextDistance < currentDistance ? zone : closest;
    }, undefined)
  );
}

export function orderContainerLayers(
  layers: Layer[],
  graph: LogicFlowGraphData,
): Layer[] {
  const index = buildContainerIndex(graph);
  return layers.map((layer) => {
    const ids = layer.elementIds.filter((id) => index.nodeById.has(id));
    const inLayer = new Set(ids);
    const childIds = new Set(
      ids.filter((id) => {
        const parent = index.parentFor(id);
        return Boolean(parent && inLayer.has(parent.id));
      }),
    );
    const ordered: string[] = [];
    const append = (id: string) => {
      if (ordered.includes(id) || !inLayer.has(id)) return;
      ordered.push(id);
      for (const child of index.directChildren(id)) append(child.id);
    };
    for (const id of ids) {
      if (!childIds.has(id)) append(id);
    }
    for (const id of layer.elementIds) {
      if (!ordered.includes(id)) ordered.push(id);
    }
    return { ...layer, elementIds: ordered };
  });
}

export function remapContainerReferences(
  node: LogicFlowNodeData,
  idMap: ReadonlyMap<string, string>,
  includedIds: ReadonlySet<string>,
): LogicFlowNodeData {
  const metadata = getContainerMetadata(node);
  if (metadata) {
    const definition = containerRegistry.getById(metadata.definitionId);
    if (!definition) return node;
    const children = getContainerChildren(node).flatMap((id) => {
      const mapped = idMap.get(id);
      return mapped ? [mapped] : [];
    });
    return {
      ...node,
      properties: withContainerMetadata(node.properties, metadata, children),
    };
  }
  const parent = getContainerParent(node);
  if (!parent || !includedIds.has(parent)) {
    return { ...node, properties: withoutContainerParent(node.properties) };
  }
  const mappedParent = idMap.get(parent);
  return mappedParent
    ? {
        ...node,
        properties: withContainerParent(
          node.properties,
          mappedParent,
          typeof node.properties?.containerZone === "string"
            ? node.properties.containerZone
            : undefined,
        ),
      }
    : node;
}
