import { ExtensionWrapper } from "@kn/common";
import { TableOfContents, getHierarchicalIndexes } from "./table-of-content";


declare module '@tiptap/core' {
    interface Storage {
        tableOfContents: {
            content: any[]
        }
    }
}

export const TableOfContentExtension: ExtensionWrapper = {
    extendsion: [TableOfContents.configure({
        getIndex: getHierarchicalIndexes
    })],
    name: TableOfContents.name,
}

export { TableOfContents }