import React, { useCallback } from "react";
import { Editor } from "@tiptap/core";
import { useActive } from "../../hooks/use-active";
import { Code as CodeExtension } from "./code";
import { Code } from "@kn/icon";
import { Toggle } from "@kn/ui";

export const CodeStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
  const isCodeActive = useActive(editor, CodeExtension.name);

  const toggleCode = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .toggleCode()
        .run(),
    [editor]
  );

  return (
    <Toggle
      size="sm"
      onClick={toggleCode}
      pressed={isCodeActive} >
      <Code className="h-4 w-4" />
    </Toggle>
  );
};
