import { PMNode as Node, mergeAttributes } from "@kn/editor"
import { ReactNodeViewRenderer } from "@kn/editor"
import { SpreadsheetView } from "./SpreadsheetView"
import { DEFAULT_SPREADSHEET_HEIGHT } from "./constants"

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
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'spreadsheet', class: 'node-spreadsheet' })]
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
        return ReactNodeViewRenderer(SpreadsheetView, {
            stopEvent: () => true,
        })
    },
})
