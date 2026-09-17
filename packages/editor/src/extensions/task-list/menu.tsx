import React, { useCallback } from "react";
import { Editor } from "..";
import { Toggle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";
import { SquareCheck } from "@kn/icon";
import { useTranslation } from "@kn/common";
import { convertListType } from "../../utilities/node";


export const TaskListStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
    const { t } = useTranslation();

    const toggleTaskList = useCallback(() => {
        // Rewrites the enclosing list (bullet/ordered) into a task list;
        // Tiptap's toggleTaskList alone is a no-op there because listItem and
        // taskItem are different node types.
        convertListType(editor, 'taskList')
    }, [editor])

    return (
        <TooltipProvider delayDuration={400}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Toggle
                        pressed={editor.isActive('taskList')}
                        size="sm"
                        aria-label={t('editor.tooltip.taskList')}
                        onClick={toggleTaskList}
                    >
                        <SquareCheck className="h-4 w-4" />
                    </Toggle>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                    {t('editor.tooltip.taskList')}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}