import { createDefaultPage } from "./data";
import { normalizeLayers } from "./layers";
import type { LogicFlowDocument, Page } from "./types";

function nextPageOrdinal(pages: readonly Page[]): number {
  const ids = new Set(pages.map((page) => page.id));
  let ordinal = 1;
  while (ids.has(`page-${ordinal}`)) ordinal += 1;
  return ordinal;
}

export function createPage(
  pages: readonly Page[] = [],
  input: Partial<Page> = {},
): Page {
  const ordinal = nextPageOrdinal(pages);
  const base = createDefaultPage(
    input.id?.trim() || `page-${ordinal}`,
    input.name?.trim() || `Page-${ordinal}`,
  );
  const graph = input.graph ?? base.graph;
  return {
    ...base,
    ...input,
    id: base.id,
    name: base.name,
    graph,
    groups: input.groups ?? base.groups,
    layers: normalizeLayers(input.layers ?? base.layers, graph),
    settings: { ...base.settings, ...input.settings },
  };
}

export function addPage(
  document: LogicFlowDocument,
  input: Partial<Page> = {},
  atIndex = document.pages.length,
): LogicFlowDocument {
  const requested = createPage(document.pages, input);
  const used = new Set(document.pages.map((page) => page.id));
  let id = requested.id;
  if (used.has(id)) {
    const ordinal = nextPageOrdinal(document.pages);
    id = `page-${ordinal}`;
  }
  const page = { ...requested, id };
  const pages = [...document.pages];
  const target = Math.max(0, Math.min(pages.length, Math.trunc(atIndex)));
  pages.splice(target, 0, page);
  return { ...document, pages };
}

export function updatePage(
  document: LogicFlowDocument,
  pageId: string,
  update: Partial<Omit<Page, "id">>,
): LogicFlowDocument {
  return {
    ...document,
    pages: document.pages.map((page) => {
      if (page.id !== pageId) return page;
      const graph = update.graph ?? page.graph;
      return {
        ...page,
        ...update,
        id: page.id,
        name: update.name?.trim() || page.name,
        graph,
        layers: normalizeLayers(update.layers ?? page.layers, graph),
        settings: { ...page.settings, ...update.settings },
      };
    }),
  };
}

export function renamePage(
  document: LogicFlowDocument,
  pageId: string,
  name: string,
): LogicFlowDocument {
  return updatePage(document, pageId, { name });
}

export function reorderPage(
  document: LogicFlowDocument,
  pageId: string,
  toIndex: number,
): LogicFlowDocument {
  const fromIndex = document.pages.findIndex((page) => page.id === pageId);
  if (fromIndex < 0 || !Number.isFinite(toIndex)) return document;
  const pages = [...document.pages];
  const [page] = pages.splice(fromIndex, 1);
  const target = Math.max(0, Math.min(pages.length, Math.trunc(toIndex)));
  pages.splice(target, 0, page);
  return { ...document, pages };
}

export const reorderPages = reorderPage;

/** The final page is intentionally retained so a document is never page-less. */
export function deletePage(
  document: LogicFlowDocument,
  pageId: string,
): LogicFlowDocument {
  if (document.pages.length <= 1) return document;
  if (!document.pages.some((page) => page.id === pageId)) return document;
  return {
    ...document,
    pages: document.pages.filter((page) => page.id !== pageId),
  };
}

export const removePage = deletePage;

export function getPage(
  document: Pick<LogicFlowDocument, "pages">,
  pageId: string,
): Page | undefined {
  return document.pages.find((page) => page.id === pageId);
}

/** Compatibility helper for consumers transitioning from the v1 single page. */
export function getPrimaryPage(
  document: Pick<LogicFlowDocument, "pages">,
): Page {
  return document.pages[0] ?? createDefaultPage();
}
