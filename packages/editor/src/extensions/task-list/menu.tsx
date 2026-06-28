import React, { useCallback } from "react";
import { Editor } from "..";
import { Toggle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";
import { SquareCheck } from "@kn/icon";
import { useTranslation } from "@kn/common";


export const TaskListStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
    const { t } = useTranslation();

    const toggleTaskList = useCallback(() => {
        editor.commands.toggleTaskList()
    }, [editor])

    return (
        <TooltipProvider delayDuration={400}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Toggle pressed={editor.isActive('taskList')} size="sm" aria-label={t('editor.tooltip.taskList')}>
                        <SquareCheck className="h-4 w-4" onClick={toggleTaskList} />
                    </Toggle>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                    {t('editor.tooltip.taskList')}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}