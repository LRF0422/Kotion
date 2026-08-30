import { PMNode as Node, ReactNodeViewRenderer, mergeAttributes, withNodeViewErrorBoundary } from "@kn/editor";
import { BitableView } from "./BitableView";
import { getDefaultFields, getDefaultViews } from "./constants/defaults";
import { createRecords } from "../utils/record";

declare module '@kn/editor' {
    interface Commands<ReturnType> {
        bitable: {
            insertBitable: (fields?: string[], data?: any[]) => ReturnType;
        };
    }
}

export const Bitable = Node.create({
    name: "bitable",
    group: "block",
    atom: true,
    selectable: true,
    draggable: true,

    addAttributes() {
        const defaultViews = getDefaultViews();
        return {
            fields: {
                default: getDefaultFields(),
            },
            views: {
                default: defaultViews,
            },
            currentView: {
                default: defaultViews[0]?.id,
            },
            data: {
                default: [],
            }
        };
    },

    renderHTML({ HTMLAttributes }) {
        return ["div", mergeAttributes(HTMLAttributes, { class: "node-bitable" })];
    },

    parseHTML() {
        return [
            {
                tag: 'div[class=node-bitable]'
            }
        ];
    },

    addNodeView() {
        return ReactNodeViewRenderer(withNodeViewErrorBoundary(BitableView), {
            stopEvent: (eventWrapper) => {
                const event = eventWrapper.event;
                // Allow mousedown to reach ProseMirror so it can create NodeSelection
                // for selectable nodes and update cursor position
                if (event instanceof MouseEvent && event.type === 'mousedown') {
                    return false;
                }
                // Allow undo/redo to reach the ProseMirror editor
                if (event instanceof KeyboardEvent) {
                    if (
                        (event.ctrlKey || event.metaKey) &&
                        (event.key === 'z' || event.key === 'y' || (event.key === 'Z' && event.shiftKey))
                    ) {
                        return false;
                    }
                }
                // Allow beforeinput events for historyUndo/historyRedo
                if (event instanceof InputEvent) {
                    const inputType = event.inputType;
                    if (inputType === 'historyUndo' || inputType === 'historyRedo') {
                        return false;
                    }
                }
                return true;
            },
        });
    },

    addCommands() {
        return {
            insertBitable: (customFields?: string[], data: any[] = []) => ({ commands }) => {
                const fields = getDefaultFields(customFields);
                const views = getDefaultViews();
                const fieldIdByTitle = new Map(fields.map((field) => [field.title, field.id]));
                const values = data.map((row) =>
                    Object.fromEntries(
                        Object.entries(row).map(([key, value]) => [fieldIdByTitle.get(key) || key, value])
                    )
                );
                return commands.insertContent({
                    type: this.name,
                    attrs: {
                        fields,
                        views,
                        currentView: views[0]?.id,
                        data: createRecords(fields, [], values)
                    }
                });
            }
        };
    }
});
