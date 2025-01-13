import { ExtensionWrapper } from "../../editor/extendsion";
import { Dragable } from "./dragable";

export * from "./dragable";


export const DragableExtension: ExtensionWrapper = {
    extendsion: Dragable,
    name: Dragable.name,
}
