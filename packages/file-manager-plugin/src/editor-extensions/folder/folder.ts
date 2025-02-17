import { CommandProps, Node, RawCommands, ReactNodeViewRenderer, mergeAttributes } from "@repo/editor";
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
    },
    addCommands() {
        return {
            insertFolder: (folderId: string) => ({ commands }: CommandProps) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: {
                        folderId: folderId
                    }
                })
            }
        } as Partial<RawCommands>
    },
});