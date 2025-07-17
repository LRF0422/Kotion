import { ExtensionWrapper } from "@kn/common";
import { StrikeStaticMenu } from "./menu";
import { Strike } from "./strike";

export * from "./strike";
export * from "./menu";

export const StrikeExtension: ExtensionWrapper = {
    extendsion: Strike,
    name: Strike.name,
    menuConfig: {
        group: 'mark',
        menu: StrikeStaticMenu
    }
}
