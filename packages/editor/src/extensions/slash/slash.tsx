import React, { ElementType } from "react";
import { Editor, Node, isFunction, posToDOMRect } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";

import { SlashMenuView } from "./slash-menu-view";
import { PluginKey } from "@tiptap/pm/state";
import { computePosition, flip } from "@floating-ui/dom";
import { CellSelection } from "@tiptap/pm/tables";
import { event } from "@kn/common";

export type SlashMenuItem =
  | {
    icon?: React.ReactNode;
    text?: string;
    slash?: string;
    render?: ElementType
    action?: (editor: Editor) => void;
    // modal?: ModalHookReturnType;
  }
  | { divider: true; title: string };

export interface SlashOptions {
  items: SlashMenuItem[];
  pluginKey: string;
  char: string;
}

function combineDOMRects(rect1: DOMRect, rect2: DOMRect): DOMRect {
  const top = Math.min(rect1.top, rect2.top)
  const bottom = Math.max(rect1.bottom, rect2.bottom)
  const left = Math.min(rect1.left, rect2.left)
  const right = Math.max(rect1.right, rect2.right)
  const width = right - left
  const height = bottom - top
  const x = left
  const y = top
  return new DOMRect(x, y, width, height)
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
              ? end -
              $head.nodeBefore.text.substring(
                $head.nodeBefore.text.indexOf("/")
              ).length
              : $from.start();

            const tr = state.tr.deleteRange(from, end);
            dispatch(tr);
            props?.action?.(editor,props);
            editor?.view?.focus();
          },

          items: ({ query }) => {
            if (!query) return this.options.items;

            const filter: any = this.options.items.filter((item: any) => {
              if ("divider" in item) return true;

              return item.text.includes(query) || item.slash.includes(query);
            });

            if (filter.every((item: any) => "divider" in item)) return [];

            return filter.filter((item: any, index: any, arr: any) => {
              if (!("divider" in item)) return true;

              return arr[index + 1] ? !("divider" in arr[index + 1]!) : false;
            });
          },

          render: () => {
            let component: ReactRenderer;
            let isEditable: boolean;

            const updatePosition = (domect: any) => {
              const domRect = isFunction(domect) ? domect() : domect
              const virtualElement = {
                getBoundingClientRect: () => domRect,
                getClientRects: () => [domRect],
              }
              computePosition(virtualElement, component.element as HTMLElement, {
                placement: 'right-start',
                middleware: [flip()],
              }).then(({ x, y, strategy }) => {
                (component.element as HTMLElement).style.zIndex = '1000';
                (component.element as HTMLElement).style.position = strategy;
                (component.element as HTMLElement).style.left = `${x + 2}px`;
                (component.element as HTMLElement).style.top = `${y}px`;
              })
            };

            return {
              onStart: props => {
                isEditable = props.editor.isEditable;
                if (!isEditable) return;
                if (!component || component.element.children.length === 0) {
                  component = new ReactRenderer(SlashMenuView, {
                    props,
                    editor: props.editor
                  });
                  component.render()
                  this.editor.view.dom.parentNode?.appendChild(component.element);
                }
                const { selection } = this.editor.state
                const { view } = this.editor
                const domRect = posToDOMRect(view, selection.from, selection.to)

                // this is a special case for cell selections
                if (selection instanceof CellSelection) {
                  const { $anchorCell, $headCell } = selection
                  const from = $anchorCell ? $anchorCell.pos : $headCell!.pos
                  const to = $headCell ? $headCell.pos : $anchorCell!.pos
                  const fromDOM = view.nodeDOM(from)
                  const toDOM = view.nodeDOM(to)

                  if (!fromDOM || !toDOM) {
                    return
                  }

                  const clientRect =
                    fromDOM === toDOM
                      ? (fromDOM as HTMLElement).getBoundingClientRect()
                      : combineDOMRects(
                        (fromDOM as HTMLElement).getBoundingClientRect(),
                        (toDOM as HTMLElement).getBoundingClientRect(),
                      )

                  updatePosition(clientRect)
                } else {
                  updatePosition(domRect)
                }
              },

              onUpdate(props) {
                if (!isEditable) return;
                component.updateProps(props);
                updatePosition(props.clientRect)
              },

              onKeyDown(props) {
                if (!isEditable) return;

                if (props.event.key === "Escape") {
                  props.view.dom.parentNode?.removeChild(component.element);
                  return true;
                }
                // @ts-ignore
                return component.ref?.onKeyDown(props);
              },

              onExit(props) {
                if (!isEditable) return;
                if (props.editor.view.dom.parentNode?.contains(component.element)) {
                  props.editor.view.dom.parentNode?.removeChild(component.element);
                }
                component.destroy();
              }
            };
          }
        })
      ];
    }
  })
};
