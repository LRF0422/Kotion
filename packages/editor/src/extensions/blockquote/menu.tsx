import React, { useCallback } from "react";
import { Editor } from "@tiptap/core";

import { Tooltip } from "../../components/tooltip";
import { useActive } from "../../hooks/use-active";

import { Blockquote as BlockquoteExtension } from "./blockquote";
import { TextQuote } from "@kn/icon";
import { Toggle } from "@kn/ui";

export const BlockquoteStaticMenu: React.FC<{ editor: Editor }> = ({
  editor
}) => {
  const isBlockquoteActive = useActive(editor, BlockquoteExtension.name);

  const toggleBlockquote = useCallback(
    () =>
      editor
        .chain()
        .focus()
        .toggleBlockquote()
        .run(),
    [editor]
  );

  return (
    <Tooltip title="引用" editor={editor}>
      <Toggle
        size="sm"
        onClick={toggleBlockquote}
        pressed={isBlockquoteActive}>
        <TextQuote className="h-4 w-4" />
      </Toggle>
    </Tooltip>
  );
};
