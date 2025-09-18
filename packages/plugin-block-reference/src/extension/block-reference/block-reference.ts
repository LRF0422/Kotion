import { PMNode as Node, ReactNodeViewRenderer, mergeAttributes } from "@kn/editor";
import { BlockReferenceView } from "./BlockReferenceView";



export const BlockReference = Node.create({
    name: "blockReference",
    group: "inline",
    inline: true,
    draggable: true,
    atom: true,

    addAttributes() {
        return {
            pageId: {
                default: null
            },
            spaceId: {
                default: null
            },
            type: {
                default: "CHILD"
            }
        }
    },

    renderHTML({ HTMLAttributes }) {
        return ["span", mergeAttributes(HTMLAttributes, { class: "block-reference" }), 0]
    },
    addNodeView() {
        return ReactNodeViewRenderer(BlockReferenceView)
    }


})