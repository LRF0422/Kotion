import React, { useCallback } from "react";
import { Editor } from "@tiptap/core";
import { useActive } from "../../hooks/use-active";

import { Strike as StrikeExtension } from "./strike";
import { Strikethrough } from "@kn/icon";
import { Toggle } from "@kn/ui";

export const StrikeStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
  const isStrikeActive = useActive(editor, StrikeExtension.name);

  const toggleStrike = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .toggleStrike()
        .run(),
    [editor]
  );

  return (
    <Toggle
      onClick={toggleStrike}
      pressed={isStrikeActive}
      size="sm"
    ><Strikethrough className="w-4 h-4" /></Toggle>
  );
};
