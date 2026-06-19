import { PMNode as Node, ReactNodeViewRenderer, withNodeViewErrorBoundary } from "@kn/editor";
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
 * A reference / threshold line drawn over a cartesian chart
 * (bar / line / area / compose / scatter). Useful for targets,
 * averages, limits, or annotations.
 */
export interface ReferenceLineConfig {
    /** Which axis the line is anchored to. 'y' (horizontal line) is the default. */
    axis?: 'x' | 'y';
    /** Value on that axis where the line is drawn (number, or category for x). */
    value: number | string;
    /** Optional label text shown next to the line. */
    label?: string;
    /** Optional explicit color; falls back to a theme-aware palette color. */
    color?: string;
    /** Render as a dashed line (default solid). */
    dashed?: boolean;
}

/**
 * A single series for a multi-series scatter / bubble chart.
 * Each series carries its own x/y (and optional size) field names and data.
 */
export interface ScatterSeriesConfig {
    /** Series display name (legend). */
    name: string;
    /** Field name for the X axis. */
    xKey: string;
    /** Field name for the Y axis. */
    yKey: string;
    /** Optional field name controlling bubble size (Z axis). */
    sizeKey?: string;
    /** Optional per-series data; falls back to the chart's top-level `data`. */
    data?: Record<string, any>[];
}

/**
 * Data model for a Sankey (flow) chart. Unlike other charts, a Sankey is
 * defined by a graph of nodes and the weighted links between them rather than
 * a flat row array.
 */
export interface SankeyData {
    /** Graph nodes; their order defines the index used by links. */
    nodes: Array<{ name: string }>;
    /** Weighted links referencing nodes by their index in `nodes`. */
    links: Array<{ source: number; target: number; value: number }>;
}

/**
 * Chart data structure stored in the node's `data` attribute.
 * The agent provides this as JSON and the ChartView renders it with recharts.
 */
export interface ChartData {
    /** Chart type: bar | line | area | pie | radar | radialBar | scatter | compose | funnel | treemap | sankey */
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

    // --- Advanced features (cartesian charts: bar/line/area/compose/scatter) ---
    /** Reference / threshold lines drawn over the chart (targets, averages, limits). */
    referenceLines?: ReferenceLineConfig[];
    /** Show a Brush control for zooming/panning large datasets. */
    enableBrush?: boolean;
    /** Stacking offset. 'expand' produces a 100% (percentage) stacked chart;
     *  only meaningful together with `stacked: true`. Defaults to 'none'. */
    stackOffset?: 'none' | 'expand';
    /** Fill area charts (and compose area series) with a vertical gradient. */
    gradientFill?: boolean;
    /** Use a logarithmic scale on the value (Y) axis. */
    logScale?: boolean;

    // --- Scatter / bubble specific ---
    /** Field name controlling bubble size (Z axis). Falls back to dataKeys[2]. */
    sizeKey?: string;
    /** Multiple scatter/bubble series. When set, overrides the single-series
     *  behaviour derived from `dataKeys`. */
    scatterSeries?: ScatterSeriesConfig[];

    // --- Sankey specific ---
    /** Node/link graph for sankey charts. Required when `type` is 'sankey'. */
    sankey?: SankeyData;
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
        return ReactNodeViewRenderer(withNodeViewErrorBoundary(ChartView), {
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
