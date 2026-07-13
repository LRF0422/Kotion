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

/**
 * Safe subset of CSS colors. Blocks anything containing quotes, url(), or
 * expression-like tokens to prevent style-injection through the background
 * attribute. Accepts hex, rgb(), rgba(), hsl(), hsla(), var(--*), and named
 * colors (letters only).
 */
export const isSafeBackground = (value: string): boolean => {
  if (!value) return false;
  const v = value.trim();
  if (v.length > 64) return false;
  return /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\([^"'`]+\)|var\(--[a-zA-Z0-9-_]+\)|[a-zA-Z]+)$/.test(v);
};

export const PADDING_MAP: Record<string, string> = {
  none: '0',
  sm: '6px',
  md: '12px',
  lg: '20px'
};

export const VALIGN_MAP: Record<string, string> = {
  top: 'flex-start',
  center: 'center',
  bottom: 'flex-end'
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
      },
      background: {
        default: null,
        parseHTML: element => element.getAttribute("data-background"),
        renderHTML: attributes => {
          if (!attributes.background) return {};
          return { "data-background": attributes.background };
        }
      },
      padding: {
        default: 'none',
        parseHTML: element => element.getAttribute("data-padding") || 'none',
        renderHTML: attributes => {
          if (!attributes.padding || attributes.padding === 'none') return {};
          return { "data-padding": attributes.padding };
        }
      },
      verticalAlign: {
        default: 'top',
        parseHTML: element => element.getAttribute("data-valign") || 'top',
        renderHTML: attributes => {
          if (!attributes.verticalAlign || attributes.verticalAlign === 'top') return {};
          return { "data-valign": attributes.verticalAlign };
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
              // Prefer explicit custom width regardless of preset type; otherwise
              // fall back to preset-based flex layout.
              let flexStyle: string;
              if (node.attrs.width !== null && node.attrs.width !== undefined) {
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
