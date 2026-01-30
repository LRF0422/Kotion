import { PMNode as Node, mergeAttributes } from "@kn/editor";
import { ReactNodeViewRenderer } from "@kn/editor";
import { WeaverOAComponent } from "../components/WeaverOAComponent";

/**
 * Weaver OA Node Extension
 * 
 * Custom node type for embedding Weaver OA content in the editor
 * Supports: documents, workflows, forms, and approval processes
 */
export const WeaverOANode = Node.create({
    name: "weaverOA",

    group: "block",

    atom: true,

    draggable: true,

    addAttributes() {
        return {
            type: {
                default: "document",
                parseHTML: (element) => element.getAttribute("data-type"),
                renderHTML: (attributes) => {
                    return {
                        "data-type": attributes.type,
                    };
                },
            },
            documentId: {
                default: "",
                parseHTML: (element) => element.getAttribute("data-document-id"),
                renderHTML: (attributes) => {
                    return {
                        "data-document-id": attributes.documentId,
                    };
                },
            },
            workflowId: {
                default: "",
                parseHTML: (element) => element.getAttribute("data-workflow-id"),
                renderHTML: (attributes) => {
                    return {
                        "data-workflow-id": attributes.workflowId,
                    };
                },
            },
            formId: {
                default: "",
                parseHTML: (element) => element.getAttribute("data-form-id"),
                renderHTML: (attributes) => {
                    return {
                        "data-form-id": attributes.formId,
                    };
                },
            },
            approvalId: {
                default: "",
                parseHTML: (element) => element.getAttribute("data-approval-id"),
                renderHTML: (attributes) => {
                    return {
                        "data-approval-id": attributes.approvalId,
                    };
                },
            },
            title: {
                default: "Weaver OA Content",
                parseHTML: (element) => element.getAttribute("data-title"),
                renderHTML: (attributes) => {
                    return {
                        "data-title": attributes.title,
                    };
                },
            },
            url: {
                default: "",
                parseHTML: (element) => element.getAttribute("data-url"),
                renderHTML: (attributes) => {
                    return {
                        "data-url": attributes.url,
                    };
                },
            },
            syncStatus: {
                default: "idle",
                parseHTML: (element) => element.getAttribute("data-sync-status"),
                renderHTML: (attributes) => {
                    return {
                        "data-sync-status": attributes.syncStatus,
                    };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-type="weaver-oa"]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ["div", mergeAttributes(HTMLAttributes, { "data-type": "weaver-oa" })];
    },

    addNodeView() {
        return ReactNodeViewRenderer(WeaverOAComponent);
    },
});
