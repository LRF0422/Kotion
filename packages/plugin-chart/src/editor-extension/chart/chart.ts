import { PMNode as Node, ReactNodeViewRenderer } from "@kn/editor";
import { ChartView } from "./ChartView";

/**
 * Configuration for a single series within a compose chart.
 * Determines how each dataKey is rendered (bar/line/area) and which Y-axis it uses.
 */
export interface SeriesConfig {
    /** Chart type for this specific series */
    type: 'bar' | 'line' | 'area';
    /** Which Y-axis to use */
    yAxisId?: 'left' | 'right';
}

/**
 * Chart data structure stored in the node's `data` attribute.
 * The agent provides this as JSON and the ChartView renders it with recharts.
 */
export interface ChartData {
    /** Chart type: bar | line | area | pie | radar | radialBar | scatter | compose */
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
    /** Named color scheme for automatic light/dark adaptation.
     *  Available values: "default" | "ocean" | "warm" | "pastel" | "vivid" | "earth"
     *  When set, overrides the built-in default palette. Each scheme provides
     *  curated colors with both light and dark mode variants.
     */
    colorScheme?: string;
    /** @deprecated Use colorScheme instead. Manual color mapping does not adapt to dark/light mode. */
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
    /** Series config for compose charts - maps dataKey to rendering config */
    seriesConfig?: Record<string, SeriesConfig>;
    /** Whether to show a right Y-axis (for compose charts with dual axes) */
    rightYAxis?: boolean;
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
