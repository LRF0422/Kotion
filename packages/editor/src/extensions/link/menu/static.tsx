import React, { useCallback } from "react";
import { Editor } from "@tiptap/core";

import { IconLink } from "../../../icons";
import { useActive } from "../../../hooks/use-active";
import { Link as LinkExtension } from "../link";
import { showLinkEditor } from "./edit";
import {
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@kn/ui";

export const LinkStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
  const isLinkActive = useActive(editor, LinkExtension.name);

  const toggleLink = useCallback(() => {
    if (isLinkActive) {
      // If already a link, remove it
      editor.chain().extendMarkRange(LinkExtension.name).unsetLink().focus().run();
    } else {
      // Otherwise show the link editor
      showLinkEditor(editor);
    }
  }, [editor, isLinkActive]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            onClick={toggleLink}
            size="sm"
            pressed={isLinkActive}
            className="hover:bg-accent"
          >
            <IconLink />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">
            {isLinkActive ? "Remove link" : "Insert link"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isLinkActive ? "Click to unlink" : "Ctrl+K"}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
