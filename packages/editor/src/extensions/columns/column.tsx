import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ColumnView } from "./ColumnView";

const getFlex = (type: 'left' | 'none' | 'right' | 'center', index: number, cols: number): string => {
  const threeQuarters = Math.floor(100 / 4) * 3;
  const oneQuarter = Math.floor(100 / 4) * 1;
  const equalShare = Math.floor(100 / cols) * 1;

  switch (type) {
    case 'left':
      return index === 0 ? `flex-basis: ${threeQuarters}%` : `flex-basis: ${oneQuarter}%`;
    case 'right':
      return index === cols - 1 ? `flex-basis: ${threeQuarters}%` : `flex-basis: ${oneQuarter}%`;
    case 'center':
      return index === cols - 2 ? `flex-basis: ${threeQuarters}%` : `flex-basis: ${oneQuarter}%`;
    default:
      return `flex-basis: ${equalShare}%`;
  }
};

export const Column = Node.create({
  name: "column",
  content: "block+",
  group: 'columns',
  isolating: true,
  atom: false,  // Changed to false to allow interaction with resize handles

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
        default: null,
        parseHTML: element => {
          const width = element.getAttribute("width");
          return width ? parseFloat(width) : null;
        },
        renderHTML: attributes => {
          if (!attributes.width) return {};
          return { width: attributes.width };
        }
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
          const decorations: Decoration[] = [];

          doc.descendants((node, pos) => {
            if (node.type.name === Column.name) {
              // Use custom width if set, otherwise use getFlex for preset layouts
              let flexStyle: string;
              if (node.attrs.width !== null && node.attrs.type === 'none') {
                flexStyle = `flex-basis: ${node.attrs.width}%`;
              } else {
                flexStyle = getFlex(node.attrs.type, node.attrs.index, node.attrs.cols);
              }

              // Highlight the column containing the cursor
              const isActive = selection.from >= pos && selection.from <= pos + node.nodeSize;

              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  class: isActive ? 'column-view column-active' : 'column-view',
                  style: flexStyle + ";height: auto;"
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
