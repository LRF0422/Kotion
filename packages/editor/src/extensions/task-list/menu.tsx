import React, { useCallback } from "react";
import { Editor } from "..";
import { Toggle } from "@kn/ui";
import { SquareCheck } from "@kn/icon";


export const TaskListStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {

    const toggleTaskList = useCallback(() => {
        editor.commands.toggleTaskList()
    }, [editor])

    return <Toggle pressed={editor.isActive('taskList')} size="sm">
        <SquareCheck className="h-4 w-4" onClick={toggleTaskList} />
    </Toggle>
}