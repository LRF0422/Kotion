import { nanoid } from "nanoid";
import {
  extractDiagramFragment,
  insertDiagramFragment,
} from "../model/fragments";
import type {
  LogicFlowDocument,
  LogicFlowPoint,
  Page,
  ScratchpadItem,
} from "../model/types";

export function saveSelectionToScratchpad(
  document: LogicFlowDocument,
  page: Page,
  nodeIds: readonly string[],
  name = "Selection",
): LogicFlowDocument {
  const fragment = extractDiagramFragment(page, nodeIds);
  if (!fragment.nodes.length) return document;
  return {
    ...document,
    scratchpad: [
      ...document.scratchpad,
      { id: `scratchpad-${nanoid(10)}`, name, fragment },
    ],
  };
}

export function renameScratchpadItem(
  document: LogicFlowDocument,
  itemId: string,
  name: string,
): LogicFlowDocument {
  const nextName = name.trim();
  if (!nextName) return document;
  return {
    ...document,
    scratchpad: document.scratchpad.map((item) =>
      item.id === itemId ? { ...item, name: nextName.slice(0, 200) } : item,
    ),
  };
}

export function deleteScratchpadItem(
  document: LogicFlowDocument,
  itemId: string,
): LogicFlowDocument {
  return {
    ...document,
    scratchpad: document.scratchpad.filter((item) => item.id !== itemId),
  };
}

export function reorderScratchpadItem(
  document: LogicFlowDocument,
  itemId: string,
  toIndex: number,
): LogicFlowDocument {
  const from = document.scratchpad.findIndex((item) => item.id === itemId);
  if (from < 0 || !Number.isFinite(toIndex)) return document;
  const scratchpad = [...document.scratchpad];
  const [item] = scratchpad.splice(from, 1);
  scratchpad.splice(
    Math.max(0, Math.min(scratchpad.length, Math.trunc(toIndex))),
    0,
    item,
  );
  return { ...document, scratchpad };
}

export function insertScratchpadItem(
  page: Page,
  item: ScratchpadItem,
  offset: LogicFlowPoint,
): Page {
  return insertDiagramFragment(
    page,
    item.fragment,
    offset,
    (kind) => `${kind}-${nanoid(10)}`,
  );
}
