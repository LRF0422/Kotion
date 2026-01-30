import { PMNode as Node, mergeAttributes } from "@kn/editor";
import { ReactNodeViewRenderer } from "@kn/editor";
import { OATodoKanbanComponent } from "../components/OATodoKanbanComponent";

/**
 * OA Todo Kanban Node Extension
 *
 * Custom node type for displaying OA workflow todo items in kanban format
 */
export const OATodoKanbanNode = Node.create({
    name: "oaTodoKanban",

    group: "block",

    atom: true,

    draggable: true,

    addAttributes() {
        return {
            title: {
                default: "OA流程待办看板",
                parseHTML: (element) => element.getAttribute("data-title"),
                renderHTML: (attributes) => {
                    return {
                        "data-title": attributes.title,
                    };
                },
            },
            userId: {
                default: "",
                parseHTML: (element) => element.getAttribute("data-user-id"),
                renderHTML: (attributes) => {
                    return {
                        "data-user-id": attributes.userId,
                    };
                },
            },
            filterType: {
                default: "all",
                parseHTML: (element) => element.getAttribute("data-filter-type"),
                renderHTML: (attributes) => {
                    return {
                        "data-filter-type": attributes.filterType,
                    };
                },
            },
            lastRefresh: {
                default: "",
                parseHTML: (element) => element.getAttribute("data-last-refresh"),
                renderHTML: (attributes) => {
                    return {
                        "data-last-refresh": attributes.lastRefresh,
                    };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-type="oa-todo-kanban"]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ["div", mergeAttributes(HTMLAttributes, { "data-type": "oa-todo-kanban" })];
    },

    addNodeView() {
        return ReactNodeViewRenderer(OATodoKanbanComponent);
    },
});
