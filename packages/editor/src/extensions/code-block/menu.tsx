import React, { useCallback } from "react";
import { Editor } from "@tiptap/core";
import { useActive } from "../../hooks/use-active";
import { CodeBlock as CodeBlockExtension } from "./code-block";
import { Toggle } from "@repo/ui";
import { CodeXml } from "@repo/icon";

export const CodeBlockStaticMenu: React.FC<{ editor: Editor }> = ({
  editor
}) => {
  const isCodeBlockActive = useActive(editor, CodeBlockExtension.name);

  const toggleCodeBlock = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .toggleCodeBlock()
        .run(),
    [editor]
  );

  return (
    <Toggle
      onClick={toggleCodeBlock}
      pressed={isCodeBlockActive}
      size="sm"
    >
      <CodeXml className="h-4 w-4" />
    </Toggle>
  );
};
