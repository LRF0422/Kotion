import { PMNode as Node, mergeAttributes } from "@kn/editor";
import { ReactNodeViewRenderer } from "@kn/editor";
import { FineReportChartComponent } from "../components/FineReportChartComponent";

/**
 * FineReport BI Chart Node Extension
 *
 * Custom node type for displaying FineReport BI chart configuration
 */
export const FineReportChartNode = Node.create({
    name: "fineReportChart",

    group: "block",

    atom: true,

    draggable: true,

    addAttributes() {
        return {
            title: {
                default: "帆软BI - 图表配置",
                parseHTML: (element) => element.getAttribute("data-title"),
                renderHTML: (attributes) => {
                    return {
                        "data-title": attributes.title,
                    };
                },
            },
            chartType: {
                default: "bar",
                parseHTML: (element) => element.getAttribute("data-chart-type"),
                renderHTML: (attributes) => {
                    return {
                        "data-chart-type": attributes.chartType,
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
            dimension: {
                default: "",
                parseHTML: (element) => element.getAttribute("data-dimension"),
                renderHTML: (attributes) => {
                    return {
                        "data-dimension": attributes.dimension,
                    };
                },
            },
            measure: {
                default: "",
                parseHTML: (element) => element.getAttribute("data-measure"),
                renderHTML: (attributes) => {
                    return {
                        "data-measure": attributes.measure,
                    };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-type="finereport-chart"]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ["div", mergeAttributes(HTMLAttributes, { "data-type": "finereport-chart" })];
    },

    addNodeView() {
        return ReactNodeViewRenderer(FineReportChartComponent);
    },
});
