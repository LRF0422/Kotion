import { PMNode as Node, mergeAttributes } from "@kn/editor"
import { ReactNodeViewRenderer } from "@kn/editor"
import { DocumentView } from "./DocumentView"
import { DEFAULT_DOCUMENT_HEIGHT } from "./constants"

declare module "@kn/editor" {
    interface Commands<ReturnType> {
        document: {
            insertDocument: (documentData?: Record<string, any> | null) => ReturnType
        }
    }
}

export const DocumentNode = Node.create({
    name: 'document',
    group: 'block',
    atom: true,

    addAttributes() {
        return {
            documentData: {
                default: null,
            },
            height: {
                default: DEFAULT_DOCUMENT_HEIGHT,
            },
        }
    },

    parseHTML() {
        return [{ tag: 'div[data-type="document"]' }]
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'document', class: 'node-document' })]
    },

    addCommands() {
        return {
            insertDocument:
                (documentData?: Record<string, any> | null) =>
                ({ commands }) => {
                    return commands.insertContent({
                        type: this.name,
                        attrs: {
                            documentData: documentData ?? null,
                        },
                    })
                },
        }
    },

    addNodeView() {
        return ReactNodeViewRenderer(DocumentView, {
            stopEvent: () => true,
        })
    },
})