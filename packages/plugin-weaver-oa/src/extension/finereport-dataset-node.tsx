import { PMNode as Node, mergeAttributes } from "@kn/editor";
import { ReactNodeViewRenderer } from "@kn/editor";
import { FineReportDatasetComponent } from "../components/FineReportDatasetComponent";

/**
 * FineReport BI Dataset Node Extension
 *
 * Custom node type for displaying FineReport BI datasets viewer
 */
export const FineReportDatasetNode = Node.create({
    name: "fineReportDataset",

    group: "block",

    atom: true,

    draggable: true,

    addAttributes() {
        return {
            title: {
                default: "帆软BI - 数据集",
                parseHTML: (element) => element.getAttribute("data-title"),
                renderHTML: (attributes) => {
                    return {
                        "data-title": attributes.title,
                    };
                },
            },
            dataSourceId: {
                default: "",
                parseHTML: (element) => element.getAttribute("data-datasource-id"),
                renderHTML: (attributes) => {
                    return {
                        "data-datasource-id": attributes.dataSourceId,
                    };
                },
            },
            category: {
                default: "全部",
                parseHTML: (element) => element.getAttribute("data-category"),
                renderHTML: (attributes) => {
                    return {
                        "data-category": attributes.category,
                    };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-type="finereport-dataset"]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ["div", mergeAttributes(HTMLAttributes, { "data-type": "finereport-dataset" })];
    },

    addNodeView() {
        return ReactNodeViewRenderer(FineReportDatasetComponent);
    },
});
