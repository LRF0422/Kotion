import { ExtensionWrapper } from "@kn/common";
import { SelectionExt, getTopLevelNodesFromSelection, getDecorations, selectionPluginKey } from "./selection";


export const SelectionExtension: ExtensionWrapper = {
    name: SelectionExt.name,
    extendsion: [SelectionExt]
}

// Export helper functions for external use
export { getTopLevelNodesFromSelection, getDecorations, selectionPluginKey };