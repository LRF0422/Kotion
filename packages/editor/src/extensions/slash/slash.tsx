import React, { ElementType } from "react";
import { Editor, Node, isFunction, posToDOMRect } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";

import { SlashMenuView } from "./slash-menu-view";
import { PluginKey } from "@tiptap/pm/state";
import { computePosition, flip } from "@floating-ui/dom";
import { CellSelection } from "@tiptap/pm/tables";

export type SlashMenuItem =
  | {
    icon?: React.ReactNode;
    text: string;
    slash: string;
    render?: ElementType;
    action?: (editor: Editor, props?: any) => void;
  }
  | { divider: true; title: string };

export interface SlashOptions {
  items: SlashMenuItem[];
  pluginKey: string;
  char: string;
}

/**
 * Combines two DOMRects into a single DOMRect that encompasses both
 */
function combineDOMRects(rect1: DOMRect, rect2: DOMRect): DOMRect {
  const top = Math.min(rect1.top, rect2.top);
  const bottom = Math.max(rect1.bottom, rect2.bottom);
  const left = Math.min(rect1.left, rect2.left);
  const right = Math.max(rect1.right, rect2.right);
  const width = right - left;
  const height = bottom - top;
  const x = left;
  const y = top;
  return new DOMRect(x, y, width, height);
}

export const createSlash = (name: string, options?: SlashOptions) => {
  return Node.create<SlashOptions>({
    name: name,
    priority: 200,

    addOptions() {
      return {
        char: "/",
        pluginKey: "slash",
        items: [],
        ...(options ?? {})
      };
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: this.options.char,
          pluginKey: new PluginKey(this.options.pluginKey),

          command: ({ editor, props }) => {
            const { state, dispatch } = editor.view;
            const { $head, $from } = state.selection;

            const end = $from.pos;
            const from = $head?.nodeBefore?.text
              ? end - $head.nodeBefore.text.substring($head.nodeBefore.text.indexOf("/")).length
              : $from.start();

            const tr = state.tr.deleteRange(from, end);
            dispatch(tr);

            props?.action?.(editor, props);
            editor?.view?.focus();
          },

          items: ({ query }) => {
            if (!query) return this.options.items;

            const lowerQuery = query.toLowerCase();

            // Filter items based on query
            const filteredItems = this.options.items.filter((item) => {
              if ("divider" in item) return true;

              const text = item.text?.toLowerCase() || "";
              const slash = item.slash?.toLowerCase() || "";
              return text.includes(lowerQuery) || slash.includes(lowerQuery);
            });

            // If only dividers remain, return empty array
            if (filteredItems.every((item) => "divider" in item)) return [];

            // Remove consecutive dividers and trailing dividers
            return filteredItems.filter((item, index, arr) => {
              if (!("divider" in item)) return true;

              // Remove if next item is also a divider or if it's the last item
              return arr[index + 1] && !("divider" in arr[index + 1]);
            });
          },

          render: () => {
            let component: ReactRenderer | null = null;
            let isEditable: boolean;

            const updatePosition = (domRect: DOMRect | (() => DOMRect)) => {
              if (!component) return;

              const rect = isFunction(domRect) ? domRect() : domRect;
              const virtualElement = {
                getBoundingClientRect: () => rect,
                getClientRects: () => [rect],
              };

              computePosition(virtualElement, component.element as HTMLElement, {
                placement: 'right-start',
                middleware: [flip()],
              }).then(({ x, y, strategy }) => {
                if (!component) return;
                const element = component.element as HTMLElement;
                element.style.zIndex = '1000';
                element.style.position = strategy;
                element.style.left = `${x + 2}px`;
                element.style.top = `${y}px`;
              });
            };

            return {
              onStart: (props) => {
                isEditable = props.editor.isEditable;
                if (!isEditable) return;

                // Create component if it doesn't exist or has been destroyed
                if (!component || component.element.children.length === 0) {
                  component = new ReactRenderer(SlashMenuView, {
                    props,
                    editor: props.editor
                  });
                  component.render();
                  this.editor.view.dom.parentNode?.appendChild(component.element);
                }

                const { selection } = this.editor.state;
                const { view } = this.editor;
                let domRect = posToDOMRect(view, selection.from, selection.to);

                // Handle special case for cell selections
                if (selection instanceof CellSelection) {
                  const { $anchorCell, $headCell } = selection;
                  const from = $anchorCell ? $anchorCell.pos : $headCell!.pos;
                  const to = $headCell ? $headCell.pos : $anchorCell!.pos;
                  const fromDOM = view.nodeDOM(from);
                  const toDOM = view.nodeDOM(to);

                  if (!fromDOM || !toDOM) return;

                  domRect = fromDOM === toDOM
                    ? (fromDOM as HTMLElement).getBoundingClientRect()
                    : combineDOMRects(
                      (fromDOM as HTMLElement).getBoundingClientRect(),
                      (toDOM as HTMLElement).getBoundingClientRect()
                    );
                }

                updatePosition(domRect);
              },

              onUpdate(props) {
                if (!isEditable || !component) return;
                component.updateProps(props);
                updatePosition(props.clientRect);
              },

              onKeyDown(props) {
                if (!isEditable || !component) return false;

                if (props.event.key === "Escape") {
                  const parentNode = props.view.dom.parentNode;
                  if (parentNode?.contains(component.element)) {
                    parentNode.removeChild(component.element);
                  }
                  return true;
                }

                // @ts-ignore
                return component.ref?.onKeyDown(props) || false;
              },

              onExit(props) {
                if (!isEditable || !component) return;

                const parentNode = props.editor.view.dom.parentNode;
                if (parentNode?.contains(component.element)) {
                  parentNode.removeChild(component.element);
                }

                component.destroy();
                component = null;
              }
            };
          }
        })
      ];
    }
  })
};
