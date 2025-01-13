import React, { useCallback } from "react";
import { Editor } from "@tiptap/core";
import { useActive } from "../../hooks/use-active";
import { HorizontalRule as HorizontalRuleExtension } from "./horizontal-rule";
import { Toggle } from "@repo/ui";
import { RulerIcon } from "@repo/icon";

export const HorizontalRuleStaticMenu: React.FC<{ editor: Editor }> = ({
  editor
}) => {
  const isHorizontalRuleActive = useActive(
    editor,
    HorizontalRuleExtension.name
  );

  const setHorizontalRule = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .setHorizontalRule()
        .run(),
    [editor]
  );

  return (
    <Toggle
      pressed={isHorizontalRuleActive}
      onClick={setHorizontalRule}
      size="sm"
    > <RulerIcon className="h-4 w-4" /></Toggle>
  );
};
