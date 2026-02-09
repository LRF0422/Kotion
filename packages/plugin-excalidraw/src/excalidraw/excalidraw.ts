import { PMNode as Node, mergeAttributes } from "@kn/editor";
import { ReactNodeViewRenderer } from "@kn/editor";
import { ExcalidrawView } from "./ExcalidrawView";


declare module "@kn/editor" {
    interface Commands<ReturnType> {
        excalidraw: {
            insertExcalidraw: (elements?: any[], appState?: Record<string, any>) => ReturnType;
        }
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
            files: {
                default: null
            },
            libraryItems: {
                default: null
            }

        }
    },
    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { class: 'node-excalidraw' }), 0]
    },
    addCommands() {
        return {
            insertExcalidraw: (elements?: any[], appState?: Record<string, any>) => ({ commands }) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: {
                        elements: elements || [],
                        appState: {
                            isLoading: false,
                            ...appState
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