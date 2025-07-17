import { ExtensionWrapper } from "@kn/common";
import { CodeExtensions } from "./code";
import { CodeStaticMenu } from "./menu";

export * from "./code";
export * from "./menu";


export const CodeExtension: ExtensionWrapper = {
    extendsion: CodeExtensions,
    name: "code",
    menuConfig: {
        group: 'mark',
        menu: CodeStaticMenu
    },
    flotMenuConfig: [CodeStaticMenu]
}
