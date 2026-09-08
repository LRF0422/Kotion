import type { LogicFlowDocument } from "../model/types";

export function exportDocumentJson(document: LogicFlowDocument): Blob {
  return new Blob([JSON.stringify(document, null, 2)], {
    type: "application/json;charset=utf-8",
  });
}
