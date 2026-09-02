import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { UnknownInlineNodeView } from "./UnknownInlineNodeView";

export const UnknownInlineNode = Node.create({
    name: "unknownInlineNode",
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,

    addNodeView() {
        return ReactNodeViewRenderer(UnknownInlineNodeView);
    },

    addAttributes() {
        return {
            nodeType: {
                default: null,
            },
            data: {
                default: null,
            },
            originalContent: {
                default: null,
            },
        };
    },

    renderHTML() {
        return ["span"];
    },
});
