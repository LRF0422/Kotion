import { normalizeLogicFlowData } from "./normalize";
import type { LogicFlowDocument } from "./types";

export function serializeLogicFlowDocument(
  document: LogicFlowDocument,
): LogicFlowDocument {
  return normalizeLogicFlowData(document).document;
}
