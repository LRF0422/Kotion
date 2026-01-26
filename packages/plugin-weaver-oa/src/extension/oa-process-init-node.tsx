import { PMNode as Node, mergeAttributes } from "@kn/editor";
import { ReactNodeViewRenderer } from "@kn/editor";
import { OAProcessInitComponent } from "../components/OAProcessInitComponent";

/**
 * OA Process Initiation Node Extension
 *
 * Custom node type for displaying OA workflow initiation panel
 */
export const OAProcessInitNode = Node.create({
    name: "oaProcessInit",

    group: "block",

    atom: true,

    draggable: true,

    addAttributes() {
        return {
            title: {
                default: "OA流程发起",
                parseHTML: (element) => element.getAttribute("data-title"),
                renderHTML: (attributes) => {
                    return {
                        "data-title": attributes.title,
                    };
                },
            },
            defaultCategory: {
                default: "",
                parseHTML: (element) => element.getAttribute("data-default-category"),
                renderHTML: (attributes) => {
                    return {
                        "data-default-category": attributes.defaultCategory,
                    };
                },
            },
            showRecent: {
                default: true,
                parseHTML: (element) => element.getAttribute("data-show-recent") === "true",
                renderHTML: (attributes) => {
                    return {
                        "data-show-recent": String(attributes.showRecent),
                    };
                },
            },
            showPopular: {
                default: true,
                parseHTML: (element) => element.getAttribute("data-show-popular") === "true",
                renderHTML: (attributes) => {
                    return {
                        "data-show-popular": String(attributes.showPopular),
                    };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-type="oa-process-init"]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ["div", mergeAttributes(HTMLAttributes, { "data-type": "oa-process-init" })];
    },

    addNodeView() {
        return ReactNodeViewRenderer(OAProcessInitComponent);
    },
});
