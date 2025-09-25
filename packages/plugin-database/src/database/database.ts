import { PMNode as Node, mergeAttributes } from "@kn/editor";
import { ReactNodeViewRenderer } from "@kn/editor";
import { DatabaseView } from "./DatabaseView";
import { createGridView } from "./utils";
import { TextSelection } from "@kn/editor";

declare module "@kn/editor" {
    interface Commands<ReturnType> {
        database: {
            insertDatabase: () => ReturnType
        };
    }
}
export const Database = Node.create({
    name: 'database',
    group: 'block',
    content: 'gridRow*',
    isolating: true,
    addOptions() {
        return {
            defaultViewConfig: {
                table: {
                    key: 'table',
                    columns: [
                        {
                            title: 'ID',
                            id: 'id',
                            dataType: 'id',
                            isShow: true
                        },
                        {
                            title: 'Test',
                            id: 'test',
                            dataType: 'text',
                            isShow: true
                        },
                        {
                            title: 'Test1',
                            id: 'test1',
                            dataType: 'star-cell',
                            isShow: true
                        },
                        {
                            title: 'Test2',
                            id: 'test2',
                            dataType: 'date-picker-cell',
                            isShow: true
                        },
                        {
                            title: 'Test3',
                            id: 'test3',
                            dataType: 'date-picker-cell',
                            isShow: true
                        }
                    ]
                },
                chart: {
                    key: 'chart',
                    options: {
                        type: 'bar'
                    }
                }
            },
        }
    },
    addAttributes() {
        return {
            columns: {
                default: this.options.defaultViewConfig.table.columns,
                rendered: true
            },
            remoteConfig: {
                default: {
                    url: null,
                    header: null
                }
            },
            views: {
                default: ["table", "chart", "calendar"],
                rendered: true
            },
            viewOptions: {
                default: this.options.defaultViewConfig,
                rendered: true
            },
        }
    },
    renderHTML({ HTMLAttributes }) {
        return [
            'div', mergeAttributes(HTMLAttributes, { class: 'node-database' })
        ]
    },
    parseHTML() {
        return [
            {
                tag: 'div[class=node-database]'
            }
        ]
    },
    addNodeView() {
        return ReactNodeViewRenderer(DatabaseView, {
            stopEvent: () => true,
        })
    },
    addCommands() {
        return {
            insertDatabase: () => ({ state, dispatch, tr }) => {
                const node = createGridView(state.schema, this.options.defaultViewConfig.table.columns);
                if (dispatch) {
                    const offset = tr.selection.anchor + 1;
                    tr.replaceSelectionWith(node)
                        // .insert(state.selection.anchor, node)
                        .scrollIntoView()
                        .setSelection(TextSelection.near(tr.doc.resolve(offset)))
                }
                return true;
            }
        }
    },
})