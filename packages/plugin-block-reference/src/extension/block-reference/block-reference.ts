import { PMNode as Node, mergeAttributes } from "@kn/editor";



export const BlockReference = Node.create({
    name: "blockReference",
    group: "inline",
    inline: true,


    addAttributes() {
        return {
            pageId: {
                default: null
            },
            spaceId: {
                default: null
            }
        }
    },

    renderHTML({ HTMLAttributes }) {
        return ["span", mergeAttributes(HTMLAttributes, { class: "block-reference" }), 0]
    }


})