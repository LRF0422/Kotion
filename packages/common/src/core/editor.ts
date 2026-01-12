import { z } from "@kn/ui";
import { AnyExtension, Editor } from "@tiptap/core";
import { ElementType, ReactNode } from "react";

export type Group = 'block' | 'inline' | 'mark' | 'custom'
export interface ExtensionWrapper {
    extendsion: AnyExtension | AnyExtension[] | any
    name: string
    bubbleMenu?: ElementType | ElementType[]
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
        action?: (editor: Editor, props?: any) => void,
        render?: ElementType
    } | { divider: true; title: string })[],
    flotMenuConfig?: ElementType[],
    tools?: {
        name: string,
        description: string,
        inputSchema: any,
        execute: (editor: Editor) => (params: any) => any
    }[]
}
