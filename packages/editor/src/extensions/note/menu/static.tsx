import { Toggle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";
import { useTranslation } from "@kn/common";


import { Editor } from "@tiptap/core";
import React from "react";
import { NoteMark } from "../note";
import { Notebook } from "@kn/icon";

export const NoteMarkStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
    const { t } = useTranslation();

    return (
        <TooltipProvider delayDuration={400}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Toggle pressed={editor.isActive(NoteMark.name)} size="sm" onClick={() => editor.commands.toggleNote()} aria-label={t('editor.tooltip.note')}>
                        <Notebook className="h-4 w-4" />
                    </Toggle>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                    {t('editor.tooltip.note')}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}