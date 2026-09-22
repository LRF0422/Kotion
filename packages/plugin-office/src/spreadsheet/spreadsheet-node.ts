import React from "react"
import { PMNode as Node, mergeAttributes, NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer, withNodeViewErrorBoundary } from "@kn/editor"
import { DEFAULT_SPREADSHEET_HEIGHT } from "./constants"

const LazySpreadsheetView = React.lazy(async () => {
    const module = await import("./SpreadsheetView")
    return { default: module.SpreadsheetView }
})

const SpreadsheetNodeView: React.FC<NodeViewProps> = (props) => React.createElement(
    React.Suspense,
    {
        fallback: React.createElement(NodeViewWrapper, {
            className: "relative my-2 rounded-md border bg-muted/20",
            style: { height: props.node.attrs.height ?? DEFAULT_SPREADSHEET_HEIGHT },
        }),
    },
    React.createElement(LazySpreadsheetView, props),
)

declare module "@kn/editor" {
    interface Commands<ReturnType> {
        spreadsheet: {
            insertSpreadsheet: (workbookData?: Record<string, any> | null) => ReturnType
        }
    }
}

export const SpreadsheetNode = Node.create({
    name: 'spreadsheet',
    group: 'block',
    atom: true,

    addAttributes() {
        return {
            // L3: the workbook body lives in the shared Y.Doc (workbook-store.ts)
            // and is addressed by this ref. `workbookData` stays as the legacy /
            // non-collaborative payload and as the migration source.
            workbookRef: {
                default: null,
            },
            // Bumped by out-of-band writers (AI tools) so a mounted view reloads
            // the store without the tool having to know about the node view.
            workbookRevision: {
                default: 0,
            },
            workbookData: {
                default: null,
            },
            height: {
                default: DEFAULT_SPREADSHEET_HEIGHT,
            },
        }
    },

    parseHTML() {
        return [{ tag: 'div[data-type="spreadsheet"]' }]
    },

    renderHTML({ HTMLAttributes }) {
        // The workbook snapshot lives in the document JSON (and collaboration
        // state) only. Serialising it to an HTML attribute would bloat the
        // clipboard payload and lose fidelity, so it is stripped here.
        const { workbookData: _workbookData, ...rest } = HTMLAttributes
        return ['div', mergeAttributes({ class: 'node-spreadsheet' }, { 'data-type': 'spreadsheet', ...rest })]
    },

    addCommands() {
        return {
            insertSpreadsheet:
                (workbookData?: Record<string, any> | null) =>
                ({ commands }) => {
                    return commands.insertContent({
                        type: this.name,
                        attrs: {
                            workbookData: workbookData ?? null,
                        },
                    })
                },
        }
    },

    addNodeView() {
        return ReactNodeViewRenderer(withNodeViewErrorBoundary(SpreadsheetNodeView, 'Spreadsheet'), {
            stopEvent: () => true,
        })
    },
})
