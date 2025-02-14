import { Node, ReactNodeViewRenderer, mergeAttributes } from "@repo/editor";
import { FolderView } from "./FolderView";


export const Folder = Node.create({
    name: "folder",
    group: "block",
    addAttributes() {
        return {
            folderId: {
                default: null
            }
        }
    },
    renderHTML({ HTMLAttributes }) {
        return [
            "div",
            mergeAttributes(HTMLAttributes, { class: 'node-folder' })
        ]
    },
    addNodeView() {
        return ReactNodeViewRenderer(FolderView)
    }
});