import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { resizableColumnsView } from "./ResizableColumnsView";

export const ResizableColumns = Node.create({
    name: 'resizableColumns',
    group: 'block',
    content: 'resizableColumn*',

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { class: 'node-resizable-columns' }), 0]
    },
    addNodeView() {
        return ReactNodeViewRenderer(resizableColumnsView)
    },
})