import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ExcalidrawView } from "./ExcalidrawView";


declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        excalidraw: {
            insertExcalidraw: () => ReturnType;
        };
    }
}

export const Excalidraw = Node.create({
    name: 'excalidraw',
    group: 'block',
    addOptions() {
        return {
            initialData: {
                elements: [],
                appState: { isLoading: false }
            }
        }
    },
    addAttributes() {
        return {
            elements: {
                default: []
            },
            appState: {
                default: {
                    isLoading: false
                }
            },
            files: null
        }
    },
    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { class: 'node-excalidraw' }), 0]
    },
    addCommands() {
        return {
            insertExcalidraw: () => ({ commands }) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: {
                        elements: [],
                        appState: {
                            isLoading: false
                        }
                    }
                })
            }
        }
    },
    addNodeView() {
        return ReactNodeViewRenderer(ExcalidrawView, {
            stopEvent: () => true
        })
    }
})