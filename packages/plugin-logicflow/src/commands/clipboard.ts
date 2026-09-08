import { nanoid } from "nanoid";
import { createDefaultLogicFlowDocument } from "../model/data";
import {
  extractDiagramFragment,
  insertDiagramFragment,
} from "../model/fragments";
import { normalizeLogicFlowData } from "../model/normalize";
import type { DiagramFragment, LogicFlowPoint, Page } from "../model/types";
import { deleteElements } from "./element-commands";
import { createSelectionState } from "./selection";

export const LOGICFLOW_CLIPBOARD_MIME = "application/x-kotion-logicflow+json";

export interface ClipboardAdapter {
  writeText(value: string): Promise<void>;
  readText(): Promise<string>;
}

let memoryClipboard = "";

export function browserClipboardAdapter(): ClipboardAdapter {
  return {
    async writeText(value) {
      memoryClipboard = value;
      await globalThis.navigator?.clipboard?.writeText(value);
    },
    async readText() {
      try {
        return (
          (await globalThis.navigator?.clipboard?.readText()) || memoryClipboard
        );
      } catch {
        return memoryClipboard;
      }
    },
  };
}

export function encodeClipboardFragment(fragment: DiagramFragment): string {
  return JSON.stringify({
    mime: LOGICFLOW_CLIPBOARD_MIME,
    version: 1,
    fragment,
  });
}

export function decodeClipboardFragment(value: string): DiagramFragment | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed.mime !== LOGICFLOW_CLIPBOARD_MIME) return null;
    const base = createDefaultLogicFlowDocument();
    const normalized = normalizeLogicFlowData({
      ...base,
      scratchpad: [
        { id: "clipboard", name: "Clipboard", fragment: parsed.fragment },
      ],
    }).document;
    return normalized.scratchpad[0]?.fragment ?? null;
  } catch {
    return null;
  }
}

export async function copySelection(
  page: Page,
  ids: readonly string[],
  clipboard: ClipboardAdapter = browserClipboardAdapter(),
): Promise<DiagramFragment | null> {
  const nodes = createSelectionState(page, ids).nodeIds;
  if (!nodes.length) return null;
  const fragment = extractDiagramFragment(page, nodes);
  await clipboard.writeText(encodeClipboardFragment(fragment));
  return fragment;
}

export async function cutSelection(
  page: Page,
  ids: readonly string[],
  clipboard: ClipboardAdapter = browserClipboardAdapter(),
): Promise<Page> {
  const copied = await copySelection(page, ids, clipboard);
  return copied ? deleteElements(page, ids) : page;
}

export async function pasteSelection(
  page: Page,
  offset: LogicFlowPoint,
  clipboard: ClipboardAdapter = browserClipboardAdapter(),
): Promise<Page> {
  const fragment = decodeClipboardFragment(await clipboard.readText());
  return fragment
    ? insertDiagramFragment(
        page,
        fragment,
        offset,
        (kind) => `${kind}-${nanoid(10)}`,
      )
    : page;
}
