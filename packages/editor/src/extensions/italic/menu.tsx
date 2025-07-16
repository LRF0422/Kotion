import React, { useCallback } from "react";
import { Editor } from "@tiptap/core";

import { useActive } from "../../hooks/use-active";

import { Italic as ItalicExtension } from "./italic";
import { Italic } from "@repo/icon";
import { Toggle } from "@repo/ui";


export const ItalicStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
  const isItalicActive = useActive(editor, ItalicExtension.name);

  const toggleItalic = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .toggleItalic()
        .run(),
    [editor]
  );

  return (
    <Toggle
      onClick={toggleItalic}
      pressed={isItalicActive}
      size="sm"
    ><Italic className="h-4 w-4" /></Toggle>
  );
};
