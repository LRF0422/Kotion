import React from "react";
import { ExtensionWrapper } from "@kn/common";
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { SquareCheck } from "@kn/icon";
import { createT } from "../../i18n";
import { convertListType } from "../../utilities/node";
import { TaskListStaticMenu } from "./menu";

const t = createT();

export const TaskListExtension: ExtensionWrapper = {
    name: TaskList.name,
    extendsion: [TaskList, TaskItem.configure({ nested: true })],
    menuConfig: {
        // The menu component renders its own tooltip, so don't also wrap it in
        // the EditorMenu tooltip (which would show two).
        group: 'mark',
        menu: TaskListStaticMenu,
    },
    flotMenuConfig: [TaskListStaticMenu],
    slashConfig: [
        {
            icon: <SquareCheck className="h-4 w-4" />,
            text: t('slashCommands.taskList'),
            slash: '/task',
            action: (editor) => {
                // Converts the active bullet/ordered list instead of nesting a
                // new one, so all three list kinds stay interchangeable.
                convertListType(editor, 'taskList');
            }
        }
    ]
}
