import { nanoid } from "nanoid";
import { addPage, deletePage, renamePage, reorderPage } from "../model/pages";
import {
  extractDiagramFragment,
  remapDiagramFragment,
} from "../model/fragments";
import { normalizeLayers } from "../model/layers";
import type { LogicFlowDocument, Page } from "../model/types";

export { addPage as createDiagramPage, deletePage, renamePage, reorderPage };

export function duplicatePage(
  document: LogicFlowDocument,
  pageId: string,
): LogicFlowDocument {
  const source = document.pages.find((page) => page.id === pageId);
  if (!source) return document;
  const fragment = remapDiagramFragment(
    extractDiagramFragment(
      source,
      source.graph.nodes.map((node) => node.id),
    ),
    (kind, sourceId) => (kind === "layer" ? sourceId : `${kind}-${nanoid(10)}`),
  );
  const graph = { nodes: fragment.nodes, edges: fragment.edges };
  const copy: Partial<Page> = {
    name: `${source.name} Copy`,
    graph,
    groups: fragment.groups,
    layers: normalizeLayers(fragment.layers, graph),
    settings: { ...source.settings },
  };
  const index = document.pages.findIndex((page) => page.id === pageId);
  return addPage(document, copy, index + 1);
}
