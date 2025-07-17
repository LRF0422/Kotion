import { CommandProps, Node, RawCommands, ReactNodeViewRenderer, mergeAttributes } from "@kn/editor";
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
        return ReactNodeViewRenderer(FolderView, {
            stopEvent: () => true
        })
    },
    addCommands() {
        return {
            insertFolder: () => ({ commands }: CommandProps) => {
                return commands.insertContent({
                    type: this.name
                })
            }
        } as Partial<RawCommands>
    },
});