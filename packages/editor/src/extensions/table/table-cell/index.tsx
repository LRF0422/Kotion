import { mergeAttributes, Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { addRowAfter } from "@tiptap/pm/tables";
import { createRoot, Root } from "react-dom/client";
import React from "react";

import {
  getCellsInColumn,
  isRowSelected,
  isTableSelected,
  selectRow,
  selectTable
} from "../utilities";
import { IconPlus } from "../../../icons";
import { getColorForTheme } from "@kn/ui";

export interface TableCellOptions {
  HTMLAttributes: Record<string, any>;
}

interface TableCellStorage {
  roots: Map<HTMLElement, Root>;
}

export const TableCell = Node.create<TableCellOptions, TableCellStorage>({
  name: "tableCell",
  content: "block+",
  tableRole: "cell",
  isolating: true,

  addOptions() {
    return {
      HTMLAttributes: {}
    };
  },

  addAttributes() {
    return {
      colspan: {
        default: 1,
        parseHTML: element => {
          const colspan = element.getAttribute("colspan");
          const value = colspan ? parseInt(colspan, 10) : 1;
          return value;
        }
      },
      rowspan: {
        default: 1,
        parseHTML: element => {
          const rowspan = element.getAttribute("rowspan");
          const value = rowspan ? parseInt(rowspan, 10) : 1;
          return value;
        }
      },
      colwidth: {
        default: [200],
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
    return [{ tag: "td" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "td",
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
        key: new PluginKey("table-cell-control"),
        props: {
          decorations: state => {
            if (!isEditable) {
              return DecorationSet.empty;
            }

            const { doc, selection } = state;
            const decorations: Decoration[] = [];
            const cells = getCellsInColumn(0)(selection);

            if (!cells) {
              return DecorationSet.empty;
            }

            cells.forEach(({ pos }, index) => {
              if (index === 0) {
                // Add table selector grip
                decorations.push(
                  Decoration.widget(pos + 1, () => {
                    const selected = isTableSelected(selection);
                    const className = selected ? "grip-table selected" : "grip-table";

                    const grip = document.createElement("a");
                    grip.className = className;

                    grip.addEventListener("mousedown", event => {
                      event.preventDefault();
                      event.stopImmediatePropagation();
                      this.editor.view.dispatch(
                        // @ts-ignore
                        selectTable(this.editor.state.tr)
                      );
                    });

                    return grip;
                  })
                );
              }

              // Add row selector grip
              decorations.push(
                Decoration.widget(pos + 1, () => {
                  const rowSelected = isRowSelected(index)(selection);
                  let className = "grip-row";

                  if (rowSelected) {
                    className += " selected";
                  }
                  if (index === 0) {
                    className += " first";
                  }
                  if (index === cells.length - 1) {
                    className += " last";
                  }

                  const grip = document.createElement("a");
                  grip.className = className;

                  // Create and cache React root
                  const root = createRoot(grip);
                  this.storage.roots.set(grip, root);

                  root.render(<IconPlus />);

                  grip.addEventListener(
                    "mousedown",
                    event => {
                      event.preventDefault();
                      event.stopImmediatePropagation();

                      this.editor.view.dispatch(
                        // @ts-ignore
                        selectRow(index)(this.editor.state.tr)
                      );

                      if (event.target !== grip) {
                        addRowAfter(
                          this.editor.state,
                          this.editor.view.dispatch
                        );
                      }
                    },
                    true
                  );

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
