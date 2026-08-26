import React from "react"
import { PMNode as Node, mergeAttributes, NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer, withNodeViewErrorBoundary } from "@kn/editor"
import { DEFAULT_DOCUMENT_HEIGHT } from "./constants"

const LazyDocumentView = React.lazy(async () => {
    const module = await import("./DocumentView")
    return { default: module.DocumentView }
})

const DocumentNodeView: React.FC<NodeViewProps> = (props) => React.createElement(
    React.Suspense,
    {
        fallback: React.createElement(NodeViewWrapper, {
            className: "relative my-2 rounded-md border bg-muted/20",
            style: { height: props.node.attrs.height ?? DEFAULT_DOCUMENT_HEIGHT },
        }),
    },
    React.createElement(LazyDocumentView, props),
)

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
        return ReactNodeViewRenderer(withNodeViewErrorBoundary(DocumentNodeView), {
            stopEvent: () => true,
        })
    },
})