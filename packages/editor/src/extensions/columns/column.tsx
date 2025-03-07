import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ColumnView } from "./ColumnView";

export const Column = Node.create({
  name: "column",
  content: "block+",
  group: 'block',
  selectable: true,
  isolating: true,
  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {
        class: "column",
        style: { 
          flex: '1 1 0%'
         }
      }
    };
  },

  addAttributes() {
    return {
      index: {
        default: 0,
        parseHTML: element => element.getAttribute("index")
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
          const { isEditable } = this.editor;
          const decorations: Decoration[] = [];

          doc.descendants((node, pos) => {
            if (!isEditable && node.type.name === Column.name) {
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  class: 'column-view'
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
