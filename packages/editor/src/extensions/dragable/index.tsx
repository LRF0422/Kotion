import { ExtensionWrapper } from "@kn/common";
import { Dragable } from "./dragable";

export * from "./dragable";


export const DragableExtension: ExtensionWrapper = {
    extendsion: Dragable,
    name: Dragable.name,
}
