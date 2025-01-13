import { ExtensionWrapper } from "../../editor/extendsion";
import { TextAlignStaticMenu } from "./menu";
import { TextAlign } from "./text-align";

export * from "./text-align";
export * from "./menu";


export const TextAlignExtension: ExtensionWrapper = {
    extendsion: TextAlign,
    name: TextAlign.name,
    menuConfig: {
        group: 'mark',
        menu: TextAlignStaticMenu
    },
    flotMenuConfig: [TextAlignStaticMenu]
}
