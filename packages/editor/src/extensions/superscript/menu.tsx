import React, { useCallback } from "react";
import { Editor } from "@tiptap/core";
import { useActive } from "../../hooks/use-active";
import { Superscript as SuperscriptExtension } from "./index";
import { Toggle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";
import { Superscript } from "@kn/icon";
import { useTranslation } from "@kn/common";

export const SuperscriptStaticMenu: React.FC<{ editor: Editor }> = ({
  editor
}) => {
  const { t } = useTranslation();
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
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            size="sm"
            pressed={isSuperscriptActive}
            onClick={toggleSuperscript}
            aria-label={t('editor.tooltip.superscript')}
          >
            <Superscript className="h-4 w-4" />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {t('editor.tooltip.superscript')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
