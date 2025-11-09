import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { UnknownNodeView } from "./UnknowNodeView";


export const UnknownNode = Node.create({
    name: 'unknownNode',
    group: 'block',
    addNodeView() {
        return ReactNodeViewRenderer(UnknownNodeView)
    },

    addAttributes() {
        return {
            nodeType: {
                default: null
            },
            data: {
                default: null
            }
        }
    },

    renderHTML() {
        return ['div']
    }
})