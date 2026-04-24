import { PMNode as Node, ReactNodeViewRenderer } from "@kn/editor";
import { ChartView } from "./ChartView";

/**
 * Chart data structure stored in the node's `data` attribute.
 * The agent provides this as JSON and the ChartView renders it with recharts.
 */
export interface ChartData {
    /** Chart type: bar | line | area | pie | radar | radialBar | scatter */
    type: string;
    /** Chart title */
    title?: string;
    /** Chart description */
    description?: string;
    /** Data array - each item is a row/object */
    data: Record<string, any>[];
    /** Data keys for series (y-axis values) */
    dataKeys: string[];
    /** Key for x-axis / category axis */
    categoryKey?: string;
    /** Color mapping for each data key */
    colors?: Record<string, string>;
    /** Display options */
    showLegend?: boolean;
    showGrid?: boolean;
    showDataLabels?: boolean;
    smoothLine?: boolean;
    stacked?: boolean;
    horizontal?: boolean;
    /** Chart height in pixels */
    height?: number;
    /** Pie chart specific */
    innerRadius?: number;
}

declare module '@kn/editor' {
    interface Commands<ReturnType> {
        chart: {
            insertChart: (data?: ChartData) => ReturnType;
        };
    }
}

export const Chart = Node.create({
    name: "chart",
    group: "block",
    draggable: true,
    atom: true,

    renderHTML() {
        return ["div", { class: "node-chart" }, 0];
    },

    addNodeView() {
        return ReactNodeViewRenderer(ChartView, {
            stopEvent: () => true
        })
    },

    addAttributes() {
        return {
            data: {
                default: null
            }
        }
    },

    addCommands() {
        return {
            insertChart: (data) => ({ commands }) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: {
                        data: data ? JSON.stringify(data) : null
                    }
                })
            }
        }
    }
})
