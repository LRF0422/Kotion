import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { UnknownNodeView } from "./UnknowNodeView";


export const UnknownNode = Node.create({
    name: 'unknownNode',
    group: 'block',
    atom: true,
    isolating: true,
    addNodeView() {
        return ReactNodeViewRenderer(UnknownNodeView)
    },

    addAttributes() {
        return {
            nodeType: {
                default: null
            }
        }
    },

    renderHTML() {
        return ['div']
    }
})