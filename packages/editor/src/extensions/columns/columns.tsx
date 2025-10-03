import { Node, mergeAttributes } from "@tiptap/core";

import { createColumns, addOrDeleteCol, gotoCol } from "./utilities";
import { TextSelection } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ColumnsView } from "./ColumnsView";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    columns: {
      insertColumns: (attrs?: { cols: number }) => ReturnType;
      addColBefore: () => ReturnType;
      addColAfter: () => ReturnType;
      deleteCol: () => ReturnType;
      setColumnsType: (type: 'none' | 'left' | 'middle' | 'right') => ReturnType;
    };
  }
}

export const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "column*",
  atom: false,
  defining: true,

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

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0
    ];
  },

  // addNodeView() {
  //   return ReactNodeViewRenderer(ColumnsView)
  // },

  addCommands() {
    return {
      insertColumns: attrs => ({ tr, dispatch, editor }) => {
        const node = createColumns(editor.schema, (attrs && attrs.cols) || 3, null,'none',);

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
        const { selection } = state;
        const node = state.doc.nodeAt(selection.from);
        if (dispatch && node) {
          dispatch(
            state.tr.setNodeMarkup(selection.from, undefined, {
              ...node.attrs,
              type
            })
          );
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
