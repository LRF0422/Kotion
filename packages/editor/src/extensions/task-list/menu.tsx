import React, { useCallback } from "react";
import { Editor } from "..";
import { Toggle } from "@repo/ui";
import { SquareCheck } from "@repo/icon";


export const TaskListStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {

    const toggleTaskList = useCallback(() => {
        editor.commands.toggleTaskList()
    }, [editor])

    return <Toggle pressed={editor.isActive('taskList')} size="sm">
        <SquareCheck className="h-4 w-4" onClick={toggleTaskList} />
    </Toggle>
}