import { Table as BuiltInTable } from "@tiptap/extension-table";

import { TableCellMenuPlugin } from "../cell-menu-plugin";
import { TableView } from "./table-view";
import { Editor } from "@tiptap/core";
import { triggerExcelImport } from "../utilities/excel-import";


export const Table = BuiltInTable.extend({
  // @ts-ignore
  addOptions() {
    return {
      HTMLAttributes: {
        class: "view-table"
      },
      resizable: false,
      handleWidth: 5,
      cellMinWidth: 25,
      // TODO: fix
      View: TableView,
      lastColumnResizable: true,
      allowTableNodeSelection: false
    };
  },

  addProseMirrorPlugins() {
    const { isEditable } = this.editor;

    return [
      // @ts-ignore
      ...this.parent?.(),
      TableCellMenuPlugin(this.editor)
    ];
  }
});
