import { ExtensionWrapper } from "@kn/common";
import {TaskList, TaskItem} from '@tiptap/extension-list'
import { TaskListStaticMenu } from "./menu";


export const TaskListExtension: ExtensionWrapper = {
    name: TaskList.name,
    extendsion: [TaskList, TaskItem.configure({ nested: true })],
    flotMenuConfig: [TaskListStaticMenu]
}