import { ExtensionWrapper } from "@kn/common";
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { TaskListStaticMenu } from "./menu";


export const TaskListExtension: ExtensionWrapper = {
    name: TaskList.name,
    extendsion: [TaskList, TaskItem.configure({ nested: true })],
    flotMenuConfig: [TaskListStaticMenu]
}