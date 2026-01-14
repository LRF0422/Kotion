import React, { useCallback } from "react";
import { Editor } from "@tiptap/core";

import { useActive } from "../../../hooks/use-active";
import { Table } from "../index";
import { Table2 } from "@kn/icon";
import { Toggle } from "@kn/ui";

export const TableStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
  const isTableActive = useActive(editor, Table.name);

  const insertTable = useCallback(
    () =>
      editor
        .chain()
        .insertTable({ rows: 3, cols: 4, withHeaderRow: true })
        .focus()
        .run(),
    [editor]
  );

  return (
    <Toggle
      pressed={isTableActive}
      onClick={insertTable}
      size="sm"
    ><Table2 className="h-4 w-4" /></Toggle>
  );
};

export * from "./bubble";
