import {
  PMNode as Node,
  ReactNodeViewRenderer,
  mergeAttributes,
  withNodeViewErrorBoundary,
} from "@kn/editor";
import { DrawnixView } from "./DrawnixView";
import { createDefaultMindmapDocument } from "./data";
import { normalizeDrawnixData } from "./model/normalize";
import {
  addMindmapChild,
  createMindmapNode,
  deleteMindmapNode,
  extractMindmapStructure as extractSemanticStructure,
  findMindmapNode,
  updateMindmapNodeText,
} from "./model/operations";
import {
  semanticNodeToLegacyElement,
  serializeDrawnixDocument,
} from "./model/serialize";
import type {
  DrawnixData,
  LegacyPlaitElement,
  MindmapNode,
  MindmapNodeData,
} from "./model/types";

export type { DrawnixData, MindmapNodeData } from "./model/types";

export interface UpdateDrawnixOptions {
  addToHistory?: boolean;
}

declare module "@kn/editor" {
  interface Commands<ReturnType> {
    drawnix: {
      insertDrawnix: () => ReturnType;
      insertDrawnixWithData: (data: DrawnixData) => ReturnType;
      updateDrawnixAtPos: (
        pos: number,
        data: DrawnixData,
        options?: UpdateDrawnixOptions,
      ) => ReturnType;
    };
  }
}

function fromNodeData(node: MindmapNodeData): MindmapNode {
  return createMindmapNode(
    node.id,
    node.text,
    (node.children ?? []).map(fromNodeData),
    { style: node.style, href: node.href },
  );
}

/** @deprecated Compatibility helper for integrations that still expect Plait-shaped JSON. */
export function convertToPlaitElement(
  node: MindmapNodeData,
  isRoot = false,
): LegacyPlaitElement {
  return semanticNodeToLegacyElement(fromNodeData(node), isRoot);
}

/** @deprecated Compatibility helper for reading a Plait-shaped node. */
export function extractMindmapStructure(
  element: LegacyPlaitElement,
): MindmapNodeData {
  return extractSemanticStructure(
    normalizeDrawnixData({ children: [element] }).document.root,
  );
}

/** @deprecated Compatibility helper for searching a Plait-shaped tree. */
export function findNodeById(
  elements: LegacyPlaitElement[],
  id: string,
): LegacyPlaitElement | null {
  for (const element of elements) {
    if (element.id === id) return element;
    if (Array.isArray(element.children)) {
      const found = findNodeById(element.children as LegacyPlaitElement[], id);
      if (found) return found;
    }
  }
  return null;
}

/** @deprecated Prefer semantic operations over legacy arrays. */
export function addChildToNode(
  elements: LegacyPlaitElement[],
  parentId: string,
  newNode: MindmapNodeData,
): LegacyPlaitElement[] | null {
  const normalized = normalizeDrawnixData({ children: elements }).document;
  const updated = addMindmapChild(normalized, parentId, fromNodeData(newNode));
  return updated ? serializeDrawnixDocument(updated).children : null;
}

/** @deprecated Prefer semantic operations over legacy arrays. */
export function deleteNodeById(
  elements: LegacyPlaitElement[],
  nodeId: string,
): LegacyPlaitElement[] | null {
  const normalized = normalizeDrawnixData({ children: elements }).document;
  const updated = deleteMindmapNode(normalized, nodeId);
  return updated ? serializeDrawnixDocument(updated).children : null;
}

/** @deprecated Prefer semantic operations over legacy arrays. */
export function updateNodeText(
  elements: LegacyPlaitElement[],
  nodeId: string,
  newText: string,
): LegacyPlaitElement[] | null {
  const normalized = normalizeDrawnixData({ children: elements }).document;
  if (!findMindmapNode(normalized.root, nodeId)) return null;
  const updated = updateMindmapNodeText(normalized, nodeId, newText);
  return updated ? serializeDrawnixDocument(updated).children : null;
}

export const Drawnix = Node.create({
  name: "drawnix",
  group: "block",
  atom: true,
  defining: true,
  addAttributes() {
    return {
      data: {
        default: serializeDrawnixDocument(createDefaultMindmapDocument()),
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "node-drawnix" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(
      withNodeViewErrorBoundary(DrawnixView, "drawnix"),
      {
        stopEvent: (eventWrapper) => {
          const event = eventWrapper.event;
          if (event instanceof MouseEvent && event.type === "mousedown")
            return false;
          if (event instanceof KeyboardEvent) {
            const modifier = event.ctrlKey || event.metaKey;
            if (
              modifier &&
              (event.key.toLowerCase() === "z" ||
                event.key.toLowerCase() === "y")
            ) {
              return false;
            }
          }
          if (event instanceof InputEvent) {
            if (
              event.inputType === "historyUndo" ||
              event.inputType === "historyRedo"
            )
              return false;
          }
          return true;
        },
      },
    );
  },
  addCommands() {
    return {
      insertDrawnix:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              data: serializeDrawnixDocument(createDefaultMindmapDocument()),
            },
          }),
      insertDrawnixWithData:
        (data: DrawnixData) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              data: serializeDrawnixDocument(
                normalizeDrawnixData(data).document,
              ),
            },
          }),
      updateDrawnixAtPos:
        (pos: number, data: DrawnixData, options?: UpdateDrawnixOptions) =>
        ({ tr, dispatch }) => {
          if (!dispatch) return false;
          const node = tr.doc.nodeAt(pos);
          if (!node || node.type.name !== this.name) return false;
          tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            data: serializeDrawnixDocument(normalizeDrawnixData(data).document),
          });
          if (options?.addToHistory === false)
            tr.setMeta("addToHistory", false);
          dispatch(tr);
          return true;
        },
    };
  },
});
