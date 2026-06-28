import React, { useCallback } from "react";
import { Editor } from "@tiptap/core";
import { useActive } from "../../hooks/use-active";
import { Subscript as SubscriptExtension } from "./index";
import { Toggle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";
import { Subscript } from "@kn/icon";
import { useTranslation } from "@kn/common";

export const SubscriptStaticMenu: React.FC<{ editor: Editor }> = ({
  editor
}) => {
  const { t } = useTranslation();
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
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            size="sm"
            pressed={isSubscriptActive}
            onClick={toggleSubscript}
            aria-label={t('editor.tooltip.subscript')}
          >
            <Subscript className="h-4 w-4" />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {t('editor.tooltip.subscript')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
