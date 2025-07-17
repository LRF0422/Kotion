import { ExtensionWrapper } from "@kn/common";
import { FormatPainter } from "./format-painter";
import { FormatPainerStaticMenu } from "./menu/static";



export const FormatPainterExtension: ExtensionWrapper = {
    name: FormatPainter.name,
    extendsion: FormatPainter,
    menuConfig: {
        group: 'block',
        menu: FormatPainerStaticMenu
    }
}