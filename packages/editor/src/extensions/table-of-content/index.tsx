import { ExtensionWrapper } from "@kn/common";
import { TableOfContents, getHierarchicalIndexes } from "./table-of-content";


export const TableOfContentExtension: ExtensionWrapper = {
    extendsion: [TableOfContents.configure({
        getIndex: getHierarchicalIndexes
    })],
    name: TableOfContents.name,
}

export { TableOfContents, getHierarchicalIndexes }