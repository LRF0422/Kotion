import { AnyExtension, Editor } from "@tiptap/core";
import { ElementType, ReactNode } from "react";

export type Group = 'block' | 'inline' | 'mark' | 'custom'
export interface MenuConfigItem {
    group: Group
    menu: ElementType
    tooltip?: string
}
export interface ExtensionWrapper {
    extendsion: AnyExtension | AnyExtension[] | any
    name: string
    bubbleMenu?: ElementType | ElementType[]
    menuConfig?: MenuConfigItem | MenuConfigItem[]
    slashConfig?: ({
        icon?: ReactNode,
        text?: string,
        slash?: string
        action?: (editor: Editor, props?: any) => void,
        render?: ElementType
    } | { divider: true; title: string })[],
    flotMenuConfig?: ElementType[],
    floatingUI?: ElementType,  // Floating UI component (e.g., chat widget)
    /**
     * Rendered once below EditorContent after content is ready (e.g. backlinks panel).
     * Receives `{ editor }` as prop, same convention as floatingUI/flotMenuConfig.
     */
    pageFooter?: ElementType,
    tools?: {
        name: string,
        description: string,
        inputSchema: any,
        execute: (editor: Editor) => (params: any) => any
    }[]
    skills?: {
        name: string,
        description: string,
        requiredTools: string[],
        optionalTools?: string[],
        systemPromptFragment?: string,
        tags?: string[]
    }[]
    blockMenuConfig?: {
        icon?: ReactNode
        label: string
        action: (editor: Editor, node: any, pos: number) => void
    }[]
}
