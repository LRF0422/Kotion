import { ExtensionWrapper } from "@repo/common";
import { Blockquote } from "./blockquote";
import { BlockquoteStaticMenu } from "./menu";


export * from "./blockquote";
export * from "./menu";

export const BlockquoteExtension: ExtensionWrapper = {
    extendsion: Blockquote,
    name: Blockquote.name,
    menuConfig: {
        group: 'mark',
        menu: BlockquoteStaticMenu
    },
    flotMenuConfig: [BlockquoteStaticMenu]
}
