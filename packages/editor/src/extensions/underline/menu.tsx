import React, { useCallback } from "react";
import { Editor } from "@tiptap/core";

import { useActive } from "../../hooks/use-active";

import { Underline as UnderlineExtension } from "./underline";
import { Underline } from "@kn/icon";
import { Toggle } from "@kn/ui";

export const UnderlineStaticMenu: React.FC<{ editor: Editor }> = ({
  editor
}) => {
  const isUnderlineActive = useActive(editor, UnderlineExtension.name);

  const toggleUnderline = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .toggleUnderline()
        .run(),
    [editor]
  );

  return (
    <Toggle
      onClick={toggleUnderline}
      pressed={isUnderlineActive}
      size="sm"
    >
      <Underline className="h-4 w-4" />
    </Toggle>
  );
};
