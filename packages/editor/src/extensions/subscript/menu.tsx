import React, { useCallback } from "react";
import { Editor } from "@tiptap/core";
import { useActive } from "../../hooks/use-active";
import { Subscript as SubscriptExtension } from "./index";
import { Toggle } from "@kn/ui";
import { Subscript } from "@kn/icon";

export const SubscriptStaticMenu: React.FC<{ editor: Editor }> = ({
  editor
}) => {
  const isSubscriptActive = useActive(editor, SubscriptExtension.name);

  const toggleSubscript = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .toggleSubscript()
        .run(),
    [editor]
  );

  return (
    <Toggle
      size="sm"
      pressed={isSubscriptActive}
      onClick={toggleSubscript}
    >
      <Subscript className="h-4 w-4" />
    </Toggle>
  );
};
