import type { MindmapDocument } from "./model/types";
import { serializeDrawnixDocument } from "./model/serialize";

export function createDefaultMindmapDocument(): MindmapDocument {
  return {
    schemaVersion: 2,
    layout: "standard",
    root: {
      id: "root",
      text: "思维导图",
      children: [
        { id: "idea-1", text: "观点一", side: "right", children: [] },
        { id: "idea-2", text: "观点二", side: "right", children: [] },
        { id: "idea-3", text: "观点三", side: "left", children: [] },
        { id: "idea-4", text: "观点四", side: "left", children: [] },
      ],
    },
  };
}

/** @deprecated Legacy projection retained for older Drawnix clients. */
export const initializeData = serializeDrawnixDocument(
  createDefaultMindmapDocument(),
).children;
