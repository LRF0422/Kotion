import { Node, mergeAttributes } from "@repo/editor";



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
    }
})