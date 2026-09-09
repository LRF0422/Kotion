import LogicFlow from "@logicflow/core";
import { BpmnElement, PoolElements, Snapshot } from "@logicflow/extension";
import { physicalContainerIds } from "../composites";
import { registerCustomShapes } from "../shapes";
import type { LogicFlowGraphData, Page } from "../model/types";

export interface SnapshotRenderOptions {
  type: "png" | "svg";
  dark?: boolean;
  backgroundColor?: string;
  padding?: number;
  scale?: number;
  selectedIds?: string[];
}

function visibleGraph(page: Page, selectedIds?: string[]): LogicFlowGraphData {
  const visible = new Set(
    page.layers
      .filter((layer) => layer.visible)
      .flatMap((layer) => layer.elementIds),
  );
  const selected = selectedIds?.length
    ? new Set(physicalContainerIds(page.graph, selectedIds, "export"))
    : null;
  const nodeIds = new Set<string>();
  for (const node of page.graph.nodes) {
    if (visible.has(node.id) && (!selected || selected.has(node.id)))
      nodeIds.add(node.id);
  }
  if (selected) {
    for (const edge of page.graph.edges) {
      if (!selected.has(edge.id)) continue;
      nodeIds.add(edge.sourceNodeId);
      nodeIds.add(edge.targetNodeId);
    }
  }
  const nodes = page.graph.nodes.filter(
    (node) => visible.has(node.id) && nodeIds.has(node.id),
  );
  const edges = page.graph.edges.filter(
    (edge) =>
      visible.has(edge.id) &&
      nodeIds.has(edge.sourceNodeId) &&
      nodeIds.has(edge.targetNodeId) &&
      (!selected ||
        selected.has(edge.id) ||
        (selected.has(edge.sourceNodeId) && selected.has(edge.targetNodeId))),
  );
  return { nodes, edges };
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

export async function renderPageSnapshot(
  page: Page,
  options: SnapshotRenderOptions,
): Promise<{ blob: Blob; width: number; height: number }> {
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:1400px;height:900px;overflow:hidden;pointer-events:none;";
  document.body.appendChild(host);
  const lf = new LogicFlow({
    container: host,
    plugins: [Snapshot, BpmnElement, PoolElements],
    grid: false,
    keyboard: { enabled: false },
    history: false,
    isSilentMode: true,
  });
  try {
    registerCustomShapes(lf);
    lf.render(
      visibleGraph(page, options.selectedIds) as LogicFlow.GraphConfigData,
    );
    lf.fitView(32, 32);
    await nextPaint();
    const snapshot = lf.extension.snapshot as unknown as Snapshot;
    const result = await snapshot.getSnapshotBlob(
      options.backgroundColor,
      options.type,
      {
        fileType: options.type,
        backgroundColor: options.backgroundColor,
        padding: options.padding ?? 32,
        partial: false,
        safetyFactor: Math.max(1, options.scale ?? 1),
      },
    );
    const blob =
      result.data instanceof Blob
        ? result.data
        : new Blob([result.data], {
            type: options.type === "svg" ? "image/svg+xml" : "image/png",
          });
    return { blob, width: result.width, height: result.height };
  } finally {
    lf.destroy();
    host.remove();
  }
}
