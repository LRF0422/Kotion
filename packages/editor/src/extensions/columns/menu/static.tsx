import React, { useCallback } from "react";
import { Editor } from "@tiptap/core";

import { IconColumns } from "../../../icons";
import { useActive } from "../../../hooks/use-active";

import { Columns as ColumnsExtension } from "../columns";
import { Toggle } from "@repo/ui";

export const ColumnsStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
  const isColumnsActive = useActive(editor, ColumnsExtension.name);

  const insertColumns = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .insertColumns()
        .run(),
    [editor]
  );

  return (
    <Toggle
      onClick={insertColumns}
      pressed={isColumnsActive}
      size="sm"
    ><IconColumns /></Toggle>
  );
};
