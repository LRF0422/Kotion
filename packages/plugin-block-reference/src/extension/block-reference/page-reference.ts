import { PMNode as Node, ReactNodeViewRenderer, mergeAttributes } from "@kn/editor";
import { PageReferenceView } from "./PageReferenceView";



export const PageReference = Node.create({
    name: "PageReference",
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
        return ["span", mergeAttributes(HTMLAttributes, { class: "page-reference" }), 0]
    },
    addNodeView() {
        return ReactNodeViewRenderer(PageReferenceView)
    }


})