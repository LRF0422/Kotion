import { ExtensionWrapper } from "@kn/common";
import { Italic } from "./italic";
import { ItalicStaticMenu } from "./menu";

export * from "./italic";
export * from "./menu";


export const ItalicExtension: ExtensionWrapper = {
    extendsion: Italic,
    name: Italic.name,
    menuConfig: {
        group: 'mark',
        menu: ItalicStaticMenu
    },
    flotMenuConfig: [ItalicStaticMenu]
}
