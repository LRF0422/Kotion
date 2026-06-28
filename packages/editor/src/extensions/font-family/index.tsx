import { ExtensionWrapper } from "@kn/common";
import { FontFamily } from "@tiptap/extension-text-style";
import { FontFamilyStaticMenu } from "./font-family-static-menu";

export { FontFamilyStaticMenu, FONT_FAMILIES } from "./font-family-static-menu";


export const FontFamilyExtension: ExtensionWrapper = {
    name: FontFamily.name,
    extendsion: FontFamily,
    menuConfig: {
        group: 'mark',
        menu: FontFamilyStaticMenu,
        tooltip: 'editor.tooltip.fontFamily',
    },
    flotMenuConfig: [FontFamilyStaticMenu]
}
