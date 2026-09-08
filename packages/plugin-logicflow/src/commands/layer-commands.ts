import {
  addLayer,
  deleteLayer,
  moveElementsToLayer,
  renameLayer,
  reorderLayer,
  setLayerLocked,
  setLayerVisibility,
} from "../model/layers";
import type { Page } from "../model/types";

export {
  addLayer,
  deleteLayer,
  moveElementsToLayer,
  renameLayer,
  reorderLayer,
  setLayerLocked,
  setLayerVisibility,
};

export type ZOrderAction = "forward" | "front" | "backward" | "back";

export function reorderElements(
  page: Page,
  ids: readonly string[],
  action: ZOrderAction,
): Page {
  const selected = new Set(ids);
  return {
    ...page,
    layers: page.layers.map((layer) => {
      const movable = layer.elementIds.filter((id) => selected.has(id));
      if (!movable.length || layer.locked) return layer;
      const rest = layer.elementIds.filter((id) => !selected.has(id));
      if (action === "front")
        return { ...layer, elementIds: [...rest, ...movable] };
      if (action === "back")
        return { ...layer, elementIds: [...movable, ...rest] };
      const order = [...layer.elementIds];
      if (action === "forward") {
        for (let index = order.length - 2; index >= 0; index -= 1) {
          if (selected.has(order[index]) && !selected.has(order[index + 1])) {
            [order[index], order[index + 1]] = [order[index + 1], order[index]];
          }
        }
      } else {
        for (let index = 1; index < order.length; index += 1) {
          if (selected.has(order[index]) && !selected.has(order[index - 1])) {
            [order[index], order[index - 1]] = [order[index - 1], order[index]];
          }
        }
      }
      return { ...layer, elementIds: order };
    }),
  };
}
