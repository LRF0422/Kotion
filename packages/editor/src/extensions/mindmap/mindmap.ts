import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { MindMapView } from "./MindMapView";

declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        mindMap: {
            insertMindMap: () => ReturnType;
        };
    }
}

export const MindMap = Node.create({
    name: 'mindmap',
    group: 'block',
    isolating: true,
    atom: true,
    addAttributes() {
        return {
            data: {
                default: null
            }
        }
    },
    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { class: 'node-mind-map' })]
    },
    addNodeView() {
        return ReactNodeViewRenderer(MindMapView, {
            stopEvent: () => true
        })
    },
    addCommands() {
        return {
            insertMindMap: () => ({ commands }) => {
                return commands.insertContent({
                    type: this.name
                })
            }
        }
    }
})