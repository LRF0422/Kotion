import React, { useCallback } from "react";
import { Editor } from "@tiptap/core";

import { IconLink } from "../../../icons";
import { useActive } from "../../../hooks/use-active";
import { Link as LinkExtension } from "../link";
import { showLinkEditor } from "./edit";
import { Toggle } from "@kn/ui";

export const LinkStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
  const isLinkActive = useActive(editor, LinkExtension.name);

  const toggleLink = useCallback(() => {
    showLinkEditor(editor);
  }, [editor]);

  return (
    <Toggle onClick={toggleLink} size="sm" pressed={isLinkActive} >
      <IconLink />
    </Toggle>
  );
};
