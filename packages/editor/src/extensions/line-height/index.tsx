import { ExtensionWrapper } from "@kn/common";
import { LineHeight } from "@tiptap/extension-text-style";
import { LineHeightStaticMenu } from "./line-height-static-menu";


export const LineHeightExtension: ExtensionWrapper = {
    name: LineHeight.name,
    extendsion: LineHeight,
    menuConfig: {
        group: 'mark',
        menu: LineHeightStaticMenu
    },
    flotMenuConfig: [LineHeightStaticMenu]
}