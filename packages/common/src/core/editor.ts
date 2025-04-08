import { AnyExtension, Editor, Extension, Mark, Node } from "@tiptap/core";
import { ElementType, ReactNode } from "react";

export type Group = 'block' | 'inline' | 'mark' | 'custom'
export interface ExtensionWrapper {
    extendsion: AnyExtension | AnyExtension[] | any
    name: string
    icon?: ReactNode
    desc?: ReactNode
    bubbleMenu?: ElementType | ElementType[]
    selectionMenu?: ElementType
    listView?: any
    menuConfig?: {
        group: Group
        menu: ElementType
    } | {
        group: Group
        menu: ElementType
    }
    slashConfig?: ({
        icon?: ReactNode,
        text?: string,
        slash?: string
        action?: (editor: Editor) => void,
        render?: ElementType
    } | { divider: true; title: string })[],
    flotMenuConfig?: ElementType[]
}
