import { Node, mergeAttributes, findParentNode } from "@tiptap/core";

import { Column } from "./column";
import { createColumns, addOrDeleteCol, gotoCol } from "./utilities";
import { TextSelection } from "@tiptap/pm/state";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    columns: {
      insertColumns: (attrs?: { cols?: number; layout?: 'none' | 'left' | 'middle' | 'right' | 'center'; gap?: number | null; widths?: (number | null)[] | null }) => ReturnType;
      addColBefore: () => ReturnType;
      addColAfter: () => ReturnType;
      deleteCol: () => ReturnType;
      setColumnsType: (type: 'none' | 'left' | 'center' | 'right') => ReturnType;
    };
  }
}

export const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "column{2,}",
  atom: false,
  isolating: true,
  selectable: true,
  allowGapCursor: true,

  addOptions() {
    return {
      HTMLAttributes: {
        class: "columns",
      },
    };
  },

  addAttributes() {
    return {
      cols: {
        default: 2,
        parseHTML: element => element.getAttribute("cols")
      },
      type: {
        default: 'none'
      },
      gap: {
        default: null,
        parseHTML: element => {
          const gap = element.getAttribute("data-gap");
          return gap ? parseFloat(gap) : null;
        },
        renderHTML: attributes => {
          if (attributes.gap === null || attributes.gap === undefined) return {};
          return { "data-gap": String(attributes.gap) };
        }
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[class=columns]"
      }
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const gap = node?.attrs?.gap;
    const extra: Record<string, string> = {};
    if (gap !== null && gap !== undefined && Number.isFinite(gap) && gap >= 0 && gap <= 128) {
      extra.style = `gap: ${gap}px`;
    }
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, extra),
      0
    ];
  },

  addCommands() {
    return {
      insertColumns: attrs => ({ tr, dispatch, editor }) => {
        const cols = (attrs && attrs.cols) || 3;
        const layout = (attrs && attrs.layout) || 'none';
        const gap = attrs && attrs.gap !== undefined ? attrs.gap : null;
        const widths = (attrs && attrs.widths) || null;
        const node = createColumns(editor.schema, cols, null, layout, { gap, widths });

        if (dispatch) {
          const offset = tr.selection.anchor + 1;

          tr.replaceSelectionWith(node)
            .scrollIntoView()
            .setSelection(TextSelection.near(tr.doc.resolve(offset)));
        }

        return true;
      },
      addColBefore: () => ({ dispatch, state }) => {
        return addOrDeleteCol({ dispatch, state, type: "addBefore" });
      },
      addColAfter: () => ({ dispatch, state }) => {
        return addOrDeleteCol({ dispatch, state, type: "addAfter" });
      },
      deleteCol: () => ({ dispatch, state }) => {
        return addOrDeleteCol({ dispatch, state, type: "delete" });
      },
      setColumnsType: type => ({ dispatch, state }) => {
        const maybeColumns = findParentNode(
          (node) => node.type.name === Columns.name
        )(state.selection);

        if (!maybeColumns) return false;

        if (dispatch) {
          const { node: columnsNode, pos: columnsPos } = maybeColumns;
          const tr = state.tr.setTime(Date.now());

          // Update the columns node type
          tr.setNodeMarkup(columnsPos, undefined, {
            ...columnsNode.attrs,
            type
          });

          // Propagate type to all child columns and clear custom width
          let offset = columnsPos + 1;
          columnsNode.forEach((child) => {
            if (child.type.name === Column.name) {
              tr.setNodeMarkup(offset, undefined, {
                ...child.attrs,
                type,
                width: null
              });
              offset += child.nodeSize;
            }
          });

          dispatch(tr);
        }

        return true;
      }
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Alt-G": () => this.editor.commands.insertColumns(),
      Tab: () => {
        return gotoCol({
          state: this.editor.state,
          dispatch: this.editor.view.dispatch,
          type: "after"
        });
      },
      "Shift-Tab": () => {
        return gotoCol({
          state: this.editor.state,
          dispatch: this.editor.view.dispatch,
          type: "before"
        });
      }
    };
  },
});
