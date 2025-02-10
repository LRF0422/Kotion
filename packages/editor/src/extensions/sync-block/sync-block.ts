import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { SyncBlockView } from "./SyncBlock";


export interface SyncBlockProps {

}

export const SyncBlock = Node.create({

    name: 'syncBlock',
    group: 'block',
    isolating: true,
    atom: true,
    addOptions() {
        return {
        }
    },
    addAttributes() {
        return {
            id: {
                default: null
            },
            content: {
                default: null,
                rendered: false,
            },
            init: {
                default: false
            }
        }
    },
    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { class: 'node-sync-block' })]
    },
    addNodeView() {
        return ReactNodeViewRenderer(SyncBlockView)
    }
})