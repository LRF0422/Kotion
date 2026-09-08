import {
  PMNode as Node,
  ReactNodeViewRenderer,
  mergeAttributes,
  withNodeViewErrorBoundary,
} from "@kn/editor";
import { createDefaultLogicFlowDocument } from "../model/data";
import { normalizeLogicFlowData } from "../model/normalize";
import { serializeLogicFlowDocument } from "../model/serialize";
import { stableStringify } from "../model/stable-stringify";
import type { LogicFlowDocument } from "../model/types";
import { LogicFlowView } from "./LogicFlowView";

export interface UpdateLogicFlowOptions {
  addToHistory?: boolean;
}

declare module "@kn/editor" {
  interface Commands<ReturnType> {
    logicflow: {
      insertLogicFlow: () => ReturnType;
      insertLogicFlowWithData: (data: unknown) => ReturnType;
      updateLogicFlowAtPos: (
        pos: number,
        data: LogicFlowDocument,
        options?: UpdateLogicFlowOptions,
      ) => ReturnType;
    };
  }
}

export const LogicFlowDiagram = Node.create({
  name: "logicflowDiagram",
  group: "block",
  atom: true,
  defining: true,
  addAttributes() {
    return {
      data: {
        default: serializeLogicFlowDocument(createDefaultLogicFlowDocument()),
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "node-logicflow-diagram" }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(
      withNodeViewErrorBoundary(LogicFlowView, "logicflowDiagram"),
      {
        stopEvent: () => true,
        update: ({ oldNode, newNode, updateProps }) => {
          if (oldNode.eq(newNode)) return true;
          updateProps();
          return true;
        },
      },
    );
  },
  addCommands() {
    return {
      insertLogicFlow:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              data: serializeLogicFlowDocument(
                createDefaultLogicFlowDocument(),
              ),
            },
          }),
      insertLogicFlowWithData:
        (data: unknown) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              data: normalizeLogicFlowData(data).document,
            },
          }),
      updateLogicFlowAtPos:
        (
          pos: number,
          data: LogicFlowDocument,
          options?: UpdateLogicFlowOptions,
        ) =>
        ({ tr, dispatch }) => {
          if (!dispatch) return false;
          const node = tr.doc.nodeAt(pos);
          if (!node || node.type.name !== this.name) return false;
          const serialized = serializeLogicFlowDocument(data);
          if (stableStringify(node.attrs.data) === stableStringify(serialized))
            return true;
          tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            data: serialized,
          });
          if (options?.addToHistory === false)
            tr.setMeta("addToHistory", false);
          dispatch(tr);
          return true;
        },
    };
  },
});
