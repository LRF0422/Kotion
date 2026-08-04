import { ExtensionWrapper } from "@kn/common";
import { LineHeight } from "./line-height";
import { LineHeightStaticMenu } from "./line-height-static-menu";

export { LineHeight } from "./line-height";

export const LineHeightExtension: ExtensionWrapper = {
    name: LineHeight.name,
    extendsion: LineHeight,
    menuConfig: {
        group: 'mark',
        menu: LineHeightStaticMenu,
        tooltip: 'editor.tooltip.lineHeight',
    },
    flotMenuConfig: [LineHeightStaticMenu]
}