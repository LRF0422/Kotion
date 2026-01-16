import { createRoot, Root } from "react-dom/client";
import { mergeAttributes, Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { addColumnAfter } from "@tiptap/pm/tables";
import React from "react";

import { getCellsInRow, isColumnSelected, selectColumn } from "../utilities";
import { IconPlus } from "../../../icons";
import { getColorForTheme } from "@kn/ui";

export interface TableHeaderOptions {
  HTMLAttributes: Record<string, any>;
}

interface TableHeaderStorage {
  roots: Map<HTMLElement, Root>;
}

export const TableHeader = Node.create<TableHeaderOptions, TableHeaderStorage>({
  name: "tableHeader",
  content: "block+",
  tableRole: "header_cell",
  isolating: true,

  addOptions() {
    return {
      HTMLAttributes: {}
    };
  },

  addAttributes() {
    return {
      colspan: {
        default: 1
      },
      rowspan: {
        default: 1
      },
      colwidth: {
        default: null,
        parseHTML: element => {
          const colwidth = element.getAttribute("colwidth");
          const value = colwidth ? [parseInt(colwidth, 10)] : null;

          return value;
        }
      },
      style: {
        default: null
      },
      backgroundColor: {
        default: null,
        parseHTML: element => {
          const bgColor = element.style.backgroundColor;
          if (!bgColor) return null;

          // Try to parse as theme-aware color object stored in data attribute
          const themeData = element.getAttribute('data-bg-color-theme');
          if (themeData) {
            try {
              return JSON.parse(themeData);
            } catch (e) {
              // Fall back to simple color string
            }
          }

          return bgColor;
        },
        renderHTML: attributes => {
          if (!attributes.backgroundColor) {
            return {};
          }

          let bgColorLight: string;
          let bgColorDark: string;
          let themeData: string | undefined;

          if (typeof attributes.backgroundColor === 'string') {
            // Simple color string - use as is (for backward compatibility)
            return {
              style: `background-color: ${attributes.backgroundColor}`
            };
          } else {
            // Theme-aware color object
            bgColorLight = attributes.backgroundColor.light;
            bgColorDark = attributes.backgroundColor.dark;
            themeData = JSON.stringify(attributes.backgroundColor);
          }

          const result: Record<string, string> = {
            // Use CSS custom properties for theme-aware coloring
            style: `--bg-color-light: ${bgColorLight}; --bg-color-dark: ${bgColorDark}; background-color: var(--bg-color-light);`,
            class: 'theme-adaptive-cell'
          };

          if (themeData) {
            result['data-bg-color-theme'] = themeData;
          }

          return result;
        }
      }
    };
  },

  parseHTML() {
    return [{ tag: "th" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "th",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0
    ];
  },

  addStorage() {
    return {
      roots: new Map<HTMLElement, Root>()
    };
  },

  onDestroy() {
    // Clean up all React roots
    this.storage.roots.forEach(root => {
      root.unmount();
    });
    this.storage.roots.clear();
  },

  // @ts-ignore
  addProseMirrorPlugins() {
    const { isEditable } = this.editor;

    return [
      new Plugin({
        key: new PluginKey("table-header-control"),
        props: {
          decorations: state => {
            if (!isEditable) {
              return DecorationSet.empty;
            }

            const { doc, selection } = state;
            const decorations: Decoration[] = [];
            const cells = getCellsInRow(0)(selection);

            if (!cells) {
              return DecorationSet.empty;
            }

            cells.forEach(({ pos }, index) => {
              decorations.push(
                Decoration.widget(pos + 1, () => {
                  const colSelected = isColumnSelected(index)(selection);
                  let className = "grip-column";

                  if (colSelected) {
                    className += " selected";
                  }
                  if (index === 0) {
                    className += " first";
                  } else if (index === cells.length - 1) {
                    className += " last";
                  }

                  const grip = document.createElement("a");
                  grip.className = className;

                  // Create and cache React root
                  const root = createRoot(grip);
                  this.storage.roots.set(grip, root);

                  root.render(<IconPlus />);

                  grip.addEventListener("mousedown", event => {
                    event.preventDefault();
                    event.stopImmediatePropagation();

                    this.editor.view.dispatch(
                      selectColumn(index)(this.editor.state.tr)
                    );

                    if (event.target !== grip) {
                      addColumnAfter(
                        this.editor.state,
                        this.editor.view.dispatch
                      );
                    }
                  });

                  return grip;
                })
              );
            });

            return DecorationSet.create(doc, decorations);
          }
        }
      })
    ];
  }
});
