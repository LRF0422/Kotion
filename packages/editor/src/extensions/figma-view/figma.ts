import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { FigmaViewComponent } from "./FigmaView";


declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        figma: {
            insertFigma: () => ReturnType;
        };
    }
}

export const Figma = Node.create({
    name: 'figmaView',
    group: 'block',
    addAttributes() {
        return {
            url: {
                default: null
            }
        }
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { class: 'node-figma' })]
    },

    addNodeView() {
        return ReactNodeViewRenderer(FigmaViewComponent)
    },
    addCommands() {
        return {
            insertFigma: () => ({ commands }) => {
                return commands.insertContent({
                    type: this.name,
                })
            }
        }
    }
})