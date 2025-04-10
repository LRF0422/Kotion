import { ExtensionWrapper } from "@repo/common";
import { TableOfContent } from "./table-of-content";



export const TableOfContentExtension: ExtensionWrapper = {
    extendsion: [TableOfContent],
    name: TableOfContent.name,
}