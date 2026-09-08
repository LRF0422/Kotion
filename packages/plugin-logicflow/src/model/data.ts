import {
  LOGICFLOW_SCHEMA_VERSION,
  type DiagramDefaultStyles,
  type LogicFlowDocument,
  type LogicFlowSettings,
  type Page,
} from "./types";

export const DEFAULT_PAGE_ID = "page-1";
export const DEFAULT_PAGE_NAME = "Page-1";
export const DEFAULT_DOCUMENT_TITLE = "Untitled";

export function createDefaultLogicFlowSettings(): LogicFlowSettings {
  return {
    grid: true,
    snapline: true,
    background: "transparent",
  };
}

export function createDefaultDiagramStyles(): DiagramDefaultStyles {
  return { node: {}, edge: {} };
}

export function createDefaultPage(
  id = DEFAULT_PAGE_ID,
  name = DEFAULT_PAGE_NAME,
): Page {
  return {
    id,
    name,
    graph: { nodes: [], edges: [] },
    groups: [],
    layers: [
      {
        id: "layer-1",
        name: "Layer-1",
        visible: true,
        locked: false,
        elementIds: [],
      },
    ],
    settings: createDefaultLogicFlowSettings(),
  };
}

export function createDefaultLogicFlowDocument(): LogicFlowDocument {
  return {
    schemaVersion: LOGICFLOW_SCHEMA_VERSION,
    title: DEFAULT_DOCUMENT_TITLE,
    pages: [createDefaultPage()],
    scratchpad: [],
    defaultStyles: createDefaultDiagramStyles(),
  };
}
