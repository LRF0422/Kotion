import type { Layer, LogicFlowGraphData, Page } from "./types";

export const DEFAULT_LAYER_ID = "layer-1";
export const DEFAULT_LAYER_NAME = "Layer-1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueId(requested: string, used: Set<string>): string {
  if (!used.has(requested)) {
    used.add(requested);
    return requested;
  }
  let suffix = 2;
  while (used.has(`${requested}-${suffix}`)) suffix += 1;
  const id = `${requested}-${suffix}`;
  used.add(id);
  return id;
}

function elementIds(graph: LogicFlowGraphData): string[] {
  return [
    ...graph.nodes.map((node) => node.id),
    ...graph.edges.map((edge) => edge.id),
  ];
}

export function createDefaultLayer(elementIds: readonly string[] = []): Layer {
  return {
    id: DEFAULT_LAYER_ID,
    name: DEFAULT_LAYER_NAME,
    visible: true,
    locked: false,
    elementIds: [...new Set(elementIds)],
  };
}

/**
 * Preserves layer order while assigning each graph element to the first layer
 * that references it. Missing elements are placed in the deterministic default
 * layer. Unknown and duplicate references are discarded.
 */
export function normalizeLayers(
  value: unknown,
  graph: LogicFlowGraphData,
): Layer[] {
  const allIds = elementIds(graph);
  const validIds = new Set(allIds);
  const assigned = new Set<string>();
  const usedLayerIds = new Set<string>();
  const source = Array.isArray(value) ? value : [];
  const layers: Layer[] = [];

  source.forEach((item, index) => {
    if (!isRecord(item)) return;
    const requestedId =
      typeof item.id === "string" && item.id.trim()
        ? item.id.slice(0, 200)
        : `layer-${index + 1}`;
    const id = uniqueId(requestedId, usedLayerIds);
    const ids = Array.isArray(item.elementIds)
      ? item.elementIds.filter((elementId): elementId is string => {
          if (
            typeof elementId !== "string" ||
            !validIds.has(elementId) ||
            assigned.has(elementId)
          ) {
            return false;
          }
          assigned.add(elementId);
          return true;
        })
      : [];
    layers.push({
      id,
      name:
        typeof item.name === "string" && item.name.trim()
          ? item.name.slice(0, 200)
          : `Layer-${index + 1}`,
      visible: typeof item.visible === "boolean" ? item.visible : true,
      locked: typeof item.locked === "boolean" ? item.locked : false,
      elementIds: ids,
    });
  });

  let defaultLayer = layers.find((layer) => layer.id === DEFAULT_LAYER_ID);
  if (!defaultLayer) {
    defaultLayer = createDefaultLayer();
    layers.unshift(defaultLayer);
  }
  defaultLayer.elementIds.push(...allIds.filter((id) => !assigned.has(id)));
  return layers;
}

function nextLayerOrdinal(layers: readonly Layer[]): number {
  const ids = new Set(layers.map((layer) => layer.id));
  let ordinal = 1;
  while (ids.has(`layer-${ordinal}`)) ordinal += 1;
  return ordinal;
}

export function addLayer(
  page: Page,
  input: Partial<Omit<Layer, "elementIds">> & { elementIds?: string[] } = {},
): Page {
  const ordinal = nextLayerOrdinal(page.layers);
  const layer: Layer = {
    id: input.id?.trim() || `layer-${ordinal}`,
    name: input.name?.trim() || `Layer-${ordinal}`,
    visible: input.visible ?? true,
    locked: input.locked ?? false,
    elementIds: input.elementIds ?? [],
  };
  return {
    ...page,
    layers: normalizeLayers([...page.layers, layer], page.graph),
  };
}

export function deleteLayer(page: Page, layerId: string): Page {
  if (
    layerId === DEFAULT_LAYER_ID ||
    page.layers.length <= 1 ||
    !page.layers.some((layer) => layer.id === layerId)
  ) {
    return page;
  }
  return {
    ...page,
    layers: normalizeLayers(
      page.layers.filter((layer) => layer.id !== layerId),
      page.graph,
    ),
  };
}

export const removeLayer = deleteLayer;

export function reorderLayer(
  page: Page,
  layerId: string,
  toIndex: number,
): Page {
  const fromIndex = page.layers.findIndex((layer) => layer.id === layerId);
  if (fromIndex < 0 || !Number.isFinite(toIndex)) return page;
  const layers = [...page.layers];
  const [layer] = layers.splice(fromIndex, 1);
  const target = Math.max(0, Math.min(layers.length, Math.trunc(toIndex)));
  layers.splice(target, 0, layer);
  return { ...page, layers };
}

export function renameLayer(page: Page, layerId: string, name: string): Page {
  const nextName = name.trim();
  if (!nextName) return page;
  return {
    ...page,
    layers: page.layers.map((layer) =>
      layer.id === layerId ? { ...layer, name: nextName.slice(0, 200) } : layer,
    ),
  };
}

export function setLayerVisibility(
  page: Page,
  layerId: string,
  visible: boolean,
): Page {
  return {
    ...page,
    layers: page.layers.map((layer) =>
      layer.id === layerId ? { ...layer, visible } : layer,
    ),
  };
}

export function setLayerLocked(
  page: Page,
  layerId: string,
  locked: boolean,
): Page {
  return {
    ...page,
    layers: page.layers.map((layer) =>
      layer.id === layerId ? { ...layer, locked } : layer,
    ),
  };
}

export function moveElementsToLayer(
  page: Page,
  ids: readonly string[],
  targetLayerId: string,
): Page {
  if (!page.layers.some((layer) => layer.id === targetLayerId)) return page;
  const valid = new Set(elementIds(page.graph));
  const moved = new Set(ids.filter((id) => valid.has(id)));
  if (!moved.size) return page;
  return {
    ...page,
    layers: page.layers.map((layer) => ({
      ...layer,
      elementIds:
        layer.id === targetLayerId
          ? [...layer.elementIds.filter((id) => !moved.has(id)), ...moved]
          : layer.elementIds.filter((id) => !moved.has(id)),
    })),
  };
}

export const setElementLayer = moveElementsToLayer;

export function getElementLayerId(
  page: Pick<Page, "layers">,
  elementId: string,
): string | undefined {
  return page.layers.find((layer) => layer.elementIds.includes(elementId))?.id;
}
