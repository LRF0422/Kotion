import { PMNode as Node, ReactNodeViewRenderer, mergeAttributes } from "@kn/editor"
import { DrawnixView } from "./DrawnixView"

declare module "@kn/editor" {
    interface Commands<ReturnType> {
        drawnix: {
            insertDrawnix: () => ReturnType
        }
    }
}

export const Drawnix = Node.create({
    name: "drawnix",
    group: "block",
    atom: true,
    defining: true,
    addAttributes() {
        return {
            data: {
                default: null
            }
        }
    },

    renderHTML({ HTMLAttributes }) {
        return ["div", mergeAttributes(HTMLAttributes, { class: "node-drawnix" })]
    },
    addNodeView() {
        return ReactNodeViewRenderer(DrawnixView, {
            stopEvent: () => true
        })
    },
    addCommands() {
        return {
            insertDrawnix: () => ({ commands }) => {
                return commands.insertContent({
                    type: this.name,
                })

            }
        }
    }
})