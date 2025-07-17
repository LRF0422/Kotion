import { Node, ReactNodeViewRenderer, mergeAttributes } from "@kn/editor";
import { AttachmentView } from "./AttachmentView";



export const Attachment = Node.create({
    name: "attachment",
    group: "block",

    addAttributes() {
        return {
            id: {
                default: null
            },
            name: {
                default: null
            },
            type: {
                default: null
            }
        }
    },
    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { class: 'node-attachment' })]
    },
    addNodeView() {
        return ReactNodeViewRenderer(AttachmentView)
    }
})