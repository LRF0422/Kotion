import React, { useCallback } from "react";
import { Editor } from "@tiptap/core";

import { useActive } from "../../../hooks/use-active";
import { Table } from "../index";
import { Table2 } from "@kn/icon";
import { Toggle } from "@kn/ui";

export const TableStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
  const isTableActibe = useActive(editor, Table.name);

  const toggleSuperscript = useCallback(
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
      pressed={isTableActibe}
      onClick={toggleSuperscript}
      size="sm"
    ><Table2 className="h-4 2-4" /></Toggle>
  );
};

export * from "./bubble";
