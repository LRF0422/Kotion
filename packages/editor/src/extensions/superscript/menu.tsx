import React, { useCallback } from "react";
import { Editor } from "@tiptap/core";
import { useActive } from "../../hooks/use-active";
import { Superscript as SuperscriptExtension } from "./index";
import { Toggle } from "@kn/ui";
import { Superscript } from "@kn/icon";

export const SuperscriptStaticMenu: React.FC<{ editor: Editor }> = ({
  editor
}) => {
  const isSuperscriptActive = useActive(editor, SuperscriptExtension.name);

  const toggleSuperscript = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .toggleSuperscript()
        .run(),
    [editor]
  );

  return (
    <Toggle
      size="sm"
      pressed={isSuperscriptActive}
      onClick={toggleSuperscript}
    >
      <Superscript className="h-4 w-4" />
    </Toggle>
  );
};
