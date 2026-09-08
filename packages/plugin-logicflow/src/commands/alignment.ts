import type { LogicFlowNodeData, Page } from "../model/types";

export type AlignMode =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom";
export type DistributeMode = "horizontal" | "vertical";

function dimension(
  node: LogicFlowNodeData,
  key: "width" | "height",
  fallback: number,
): number {
  const direct = node[key];
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  const property = node.properties?.[key];
  return typeof property === "number" && Number.isFinite(property)
    ? property
    : fallback;
}

function selectedNodes(page: Page, ids: readonly string[]) {
  const selected = new Set(ids);
  return page.graph.nodes.filter((node) => selected.has(node.id));
}

function updateNodes(
  page: Page,
  updates: Map<string, { x?: number; y?: number }>,
): Page {
  if (!updates.size) return page;
  return {
    ...page,
    graph: {
      ...page.graph,
      nodes: page.graph.nodes.map((node) => {
        const update = updates.get(node.id);
        return update ? { ...node, ...update } : node;
      }),
    },
  };
}

export function alignNodes(
  page: Page,
  ids: readonly string[],
  mode: AlignMode,
): Page {
  const nodes = selectedNodes(page, ids);
  if (nodes.length < 2) return page;
  const left = Math.min(
    ...nodes.map((node) => node.x - dimension(node, "width", 100) / 2),
  );
  const right = Math.max(
    ...nodes.map((node) => node.x + dimension(node, "width", 100) / 2),
  );
  const top = Math.min(
    ...nodes.map((node) => node.y - dimension(node, "height", 60) / 2),
  );
  const bottom = Math.max(
    ...nodes.map((node) => node.y + dimension(node, "height", 60) / 2),
  );
  const updates = new Map<string, { x?: number; y?: number }>();
  for (const node of nodes) {
    const width = dimension(node, "width", 100);
    const height = dimension(node, "height", 60);
    if (mode === "left") updates.set(node.id, { x: left + width / 2 });
    else if (mode === "center") updates.set(node.id, { x: (left + right) / 2 });
    else if (mode === "right") updates.set(node.id, { x: right - width / 2 });
    else if (mode === "top") updates.set(node.id, { y: top + height / 2 });
    else if (mode === "middle") updates.set(node.id, { y: (top + bottom) / 2 });
    else updates.set(node.id, { y: bottom - height / 2 });
  }
  return updateNodes(page, updates);
}

export function distributeNodes(
  page: Page,
  ids: readonly string[],
  mode: DistributeMode,
): Page {
  const nodes = selectedNodes(page, ids);
  if (nodes.length < 3) return page;
  const horizontal = mode === "horizontal";
  const sorted = [...nodes].sort((a, b) =>
    horizontal ? a.x - b.x : a.y - b.y,
  );
  const size = (node: LogicFlowNodeData) =>
    dimension(node, horizontal ? "width" : "height", horizontal ? 100 : 60);
  const start = (horizontal ? sorted[0].x : sorted[0].y) - size(sorted[0]) / 2;
  const last = sorted[sorted.length - 1];
  const end = (horizontal ? last.x : last.y) + size(last) / 2;
  const totalSize = sorted.reduce((sum, node) => sum + size(node), 0);
  const gap = (end - start - totalSize) / (sorted.length - 1);
  let cursor = start;
  const updates = new Map<string, { x?: number; y?: number }>();
  for (const node of sorted) {
    const nodeSize = size(node);
    const center = cursor + nodeSize / 2;
    updates.set(node.id, horizontal ? { x: center } : { y: center });
    cursor += nodeSize + gap;
  }
  return updateNodes(page, updates);
}
