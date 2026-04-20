import { ExtensionWrapper } from "@kn/common"
import { Dragable } from "./dragable"

export * from "./dragable"
export { type BlockMenuItem } from "./block-menu"


export const DragableExtension: ExtensionWrapper = {
    extendsion: Dragable,
    name: Dragable.name,
}
