import {
  BubbleMenuPlugin,
  BubbleMenuPluginProps
} from "@tiptap/extension-bubble-menu";
import { Editor, findParentNode, posToDOMRect } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { createRoot } from "react-dom/client";
import React, { useCallback, useEffect } from "react";

/**
 * Configuration for table cell context menu buttons
 */
const cellButtonsConfig = [
  {
    name: "insertRowUp",
    action: (editor: Editor) =>
      editor.chain().focus().addRowBefore().run()
  },
  {
    name: "insertRowDown",
    action: (editor: Editor) =>
      editor.chain().focus().addRowAfter().run()
  },
  {
    name: "removeRows",
    action: (editor: Editor) =>
      editor.chain().focus().deleteRow().run()
  },
  {
    divider: true
  },
  {
    name: "insertColumnLeft",
    action: (editor: Editor) =>
      editor.chain().focus().addColumnBefore().run()
  },
  {
    name: "insertColumnRight",
    action: (editor: Editor) =>
      editor.chain().focus().addColumnAfter().run()
  },
  {
    name: "removeColumns",
    action: (editor: Editor) =>
      editor.chain().focus().deleteColumn().run()
  },
  {
    divider: true
  },
  {
    name: "toggleHeaderRow",
    action: (editor: Editor) =>
      editor.chain().focus().toggleHeaderRow().run()
  },
  {
    name: "toggleHeaderColumn",
    action: (editor: Editor) =>
      editor.chain().focus().toggleHeaderColumn().run()
  },
  {
    name: "toggleHeaderCell",
    action: (editor: Editor) =>
      editor.chain().focus().toggleHeaderCell().run()
  },
  {
    divider: true
  },
  {
    name: "删除",
    action: (editor: Editor) =>
      editor.chain().focus().deleteTable().run()
  }
];

/**
 * Predicate to check if a node is a table cell or header
 */
const predicateIsTableCell = (node: PMNode) =>
  ["tableHeader", "tableCell"].includes(node.type.name);

/**
 * Table cell menu component (currently disabled)
 */
const TableCellMenu: React.FC<{
  editor: Editor;
}> = ({ editor }) => {
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (editor.isEditable) {
        const { selection } = editor.state;
        const parent = findParentNode(predicateIsTableCell)(selection);

        if (parent) {
          event?.preventDefault();
          // Context menu functionality can be implemented here
        }
      }
    };

    window.addEventListener("contextmenu", handler);

    return () => {
      window.removeEventListener("contextmenu", handler);
    };
  }, [editor]);

  return null;
};

/**
 * Creates a bubble menu plugin for table cells
 * This plugin shows a context menu when a table cell is right-clicked
 */
export const TableCellMenuPlugin = (editor: Editor): Plugin<BubbleMenuPluginProps> => {
  const div = document.createElement("div");

  const root = createRoot(div);
  root.render(<TableCellMenu editor={editor} />);

  return BubbleMenuPlugin({
    pluginKey: "TableCellMenuPlugin",
    editor,
    element: div,
    tippyOptions: {
      getReferenceClientRect: () => {
        const { selection } = editor.state;
        const parent = findParentNode(predicateIsTableCell)(selection);

        if (parent) {
          const rect = (editor.view.nodeDOM(parent.pos) as HTMLElement)?.getBoundingClientRect();
          if (rect) return rect;
        }

        return posToDOMRect(editor.view, selection.from, selection.to);
      },
      placement: "bottom"
    },
    shouldShow: (({ state, view }) => {
      const { selection } = state;
      const parent = findParentNode(predicateIsTableCell)(selection);
      return Boolean(parent) && view.editable;
    }) as BubbleMenuPluginProps["shouldShow"]
  } as BubbleMenuPluginProps);
};
