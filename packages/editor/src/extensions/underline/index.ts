import { ExtensionWrapper } from "@kn/common";
import { UnderlineStaticMenu } from "./menu";
import { Underline } from "./underline";

export * from "./underline";
export * from "./menu";


export const UnderlineExtension: ExtensionWrapper = {
    extendsion: Underline,
    name: Underline.name,
    menuConfig: {
        group: 'mark',
        menu: UnderlineStaticMenu
    },
    flotMenuConfig: [UnderlineStaticMenu]
}
