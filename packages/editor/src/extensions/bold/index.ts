import Bold from "@tiptap/extension-bold";
import { ExtensionWrapper } from "@repo/common";
import { BoldStaticMenu } from "./menu";

export * from "./bold";
export * from "./menu";


export const BoldExtension: ExtensionWrapper = {
    extendsion: Bold,
    name: Bold.name,
    // listView: BoldListView,
    menuConfig: {
        group: 'mark',
        menu: BoldStaticMenu,
    },
    flotMenuConfig: [BoldStaticMenu]
}
