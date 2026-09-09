import * as Y from "yjs";
import { normalizeLogicFlowData } from "../model/normalize";
import type { LogicFlowDocument } from "../model/types";
import {
  LOCAL_ORIGIN,
  LOGICFLOW_DIAGRAMS_MAP,
  getDiagramMap,
  readLogicFlowDocument,
  replaceLogicFlowDiagram,
  type LogicFlowDiagramsMap,
} from "./yjs-codec";

export function getLogicFlowDiagramsMap(ydoc: Y.Doc): LogicFlowDiagramsMap {
  return ydoc.getMap<Y.Map<unknown>>(LOGICFLOW_DIAGRAMS_MAP);
}

export function readAuthoritativeLogicFlowDocument(
  ydoc: Y.Doc,
  diagramId: string,
  fallbackData: unknown,
): LogicFlowDocument {
  const diagramMap = getDiagramMap(getLogicFlowDiagramsMap(ydoc), diagramId);
  return diagramMap
    ? readLogicFlowDocument(diagramMap)
    : normalizeLogicFlowData(fallbackData).document;
}

export function replaceAuthoritativeLogicFlowDocument(
  ydoc: Y.Doc,
  diagramId: string,
  document: unknown,
  origin: unknown = LOCAL_ORIGIN,
): LogicFlowDocument {
  return replaceLogicFlowDiagram(
    getLogicFlowDiagramsMap(ydoc),
    diagramId,
    document,
    origin,
  );
}
