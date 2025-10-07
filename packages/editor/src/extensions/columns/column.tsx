import { Node, getAttributes, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ColumnView } from "./ColumnView";
import { at } from "lodash";

export const Column = Node.create({
  name: "column",
  content: "block+",
  group: 'columns',
  isolating: true,
  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {
        class: "node-column"
      }
    };
  },

  addAttributes() {
    return {
      index: {
        default: 0,
        parseHTML: element => element.getAttribute("index"),
      },
      type: {
        default: 'none'
      },
      cols: {
        default: 3
      },
      width: {
        default: 100
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[class=column]"
      }
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnView)
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0
    ];
  },

  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey("column-border"),
      props: {
        decorations: ({ doc, selection }) => {
          const { isEditable , state} = this.editor;
          const decorations: Decoration[] = [];
          const getFlex = (type: 'left' | 'none' | 'right' | 'center', index: number, cols: number) => {
            switch (type) {
              case 'left':
                return index === 0 ? `flex-basis : ${ Math.floor(100 / 4) * 3}%` : `flex-basis : ${ Math.floor(100 / 4) * 1}%`
              case 'right':
                return index === cols - 1 ? `flex-basis : ${Math.floor(100 / 4) * 3}%` : `flex-basis : ${Math.floor(100 / 4) * 1}%`
              case 'center':
                return index === cols - 2 ? `flex-basis : ${ Math.floor(100 / 4) * 3}%` : `flex-basis : ${ Math.floor(100 / 4) * 1}%`
              default:
                return `flex-basis : ${ Math.floor(100 / cols) * 1}%`
            }
          }
          doc.descendants((node, pos) => {
            if (node.type.name === Column.name) {
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  class: 'column-view',
                  style:  getFlex(node.attrs.type, node.attrs.index, node.attrs.cols) + ";height: auto;"
                })
              )
            }
          })
          return DecorationSet.create(doc, decorations)
        }
      }
    })]
  },
});
