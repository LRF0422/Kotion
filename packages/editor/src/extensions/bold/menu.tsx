import React, { useCallback } from "react";
import { Editor } from "@tiptap/core";

import { useActive } from "../../hooks/use-active";

import { Bold as BoldExtension } from "./bold";
import { Bold } from "@kn/icon";
import { Toggle } from "@kn/ui";

export const BoldStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
  const isBoldActive = useActive(editor, BoldExtension.name);

  const toggleBold = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .toggleBold()
        .run(),
    [editor]
  );

  return (
    <Toggle size="sm" pressed={isBoldActive} onClick={toggleBold}>
      <Bold className="h-4 w-4" />
    </Toggle>
  );
};