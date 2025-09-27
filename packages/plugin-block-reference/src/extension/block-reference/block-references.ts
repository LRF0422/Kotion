


import { PMNode as Node, ReactNodeViewRenderer, mergeAttributes } from "@kn/editor";
import { PageReferenceView } from "./PageReferenceView";
import { BlockReferenceView } from "./BlockReferenceView";



export const BlockReference = Node.create({
    name: "BlockReference",
    group: "block",
    inline: false,
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
            },
            blockId: {
                default: null
            }
        }
    },

    renderHTML({ HTMLAttributes }) {
        return ["div", mergeAttributes(HTMLAttributes, { class: "block-reference" }), 0]
    },
    addNodeView() {
        return ReactNodeViewRenderer(BlockReferenceView)
    }


})