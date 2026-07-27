import React, { useMemo, useState, useCallback, useEffect } from "react"
import { NodeViewProps, NodeViewWrapper } from "@kn/editor"
import { useDebounce } from "@kn/common"
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    ChartLegend,
    ChartLegendContent,
    type ChartConfig,
    EmptyState,
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
    Input,
    Slider,
    Badge,
    ScrollArea,
    Textarea,
    useTheme,
    // Table components
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
    // Recharts components
    BarChart,
    Bar,
    LineChart,
    Line,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell,
    RadarChart,
    Radar,
    PolarAngleAxis,
    PolarGrid,
    PolarRadiusAxis,
    RadialBarChart,
    RadialBar,
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    CartesianGrid,
    LabelList,
    ZAxis,
    ComposedChart,
    Funnel,
    FunnelChart,
    Treemap,
    Sankey,
    ReferenceLine,
    Brush,
} from "@kn/ui"
import {
    BarChart3,
    Table2,
    Settings2,
    AlertCircle,
} from "@kn/icon"
import type { ChartData, SeriesConfig, ScatterSeriesConfig, SankeyData } from "./chart"
import { getThemeColorFromPalette, getPalette, COLOR_PALETTES } from "./chart-colors"

/**
 * Get the fallback color for a given index, accounting for the current theme.
 * Uses the chart's colorScheme if set, otherwise falls back to the default palette.
 */
function getFallbackColor(index: number, isDark: boolean, colorScheme?: string): string {
    const tc = getThemeColorFromPalette(colorScheme, index)
    return isDark ? tc.dark : tc.light
}

/**
 * Resolve a concrete color for a series/category.
 *
 * Priority: explicit custom color → colorScheme palette (theme-aware).
 *
 * We compute the color directly instead of relying on the `var(--color-<key>)`
 * CSS variables emitted by ChartStyle. Those variables are named after the raw
 * dataKey, so a key containing characters that are invalid in a CSS custom
 * property name (a space, parens, etc. — e.g. "Q1 Revenue") produces a
 * malformed variable that fails to resolve, leaving the series filled with the
 * SVG default (black). Resolving the color here sidesteps that entirely and
 * stays theme-aware because ChartView re-renders on theme change (isDark).
 */
function resolveSeriesColor(chartData: ChartData, key: string, index: number, isDark: boolean): string {
    const custom = chartData.colors?.[key]
    if (custom) return custom
    return getFallbackColor(index, isDark, chartData.colorScheme)
}

/**
 * Build a ChartConfig from ChartData for shadcn ChartContainer.
 * Uses the selected colorScheme palette with light/dark theme support.
 * When no custom color is set, each series gets a `theme` entry
 * so ChartStyle generates CSS for both light and dark modes.
 */
function buildChartConfig(chartData: ChartData): ChartConfig {
    const config: ChartConfig = {}
    const dataKeys = chartData.dataKeys || []
    const colorScheme = chartData.colorScheme

    dataKeys.forEach((key, index) => {
        const customColor = chartData.colors?.[key]
        if (customColor) {
            // User-specified color: use as-is for both themes
            config[key] = {
                label: key,
                color: customColor,
            }
        } else {
            // Palette-derived color with light/dark variants
            const tc = getThemeColorFromPalette(colorScheme, index)
            config[key] = {
                label: key,
                theme: {
                    light: tc.light,
                    dark: tc.dark,
                },
            }
        }
    })

    return config
}

/**
 * Whether a chart has enough data to render. Most types need a non-empty
 * `data` array; sankey instead needs its `sankey` node/link graph.
 */
function hasRenderableData(chartData: ChartData | null): chartData is ChartData {
    if (!chartData) return false
    if (chartData.type === "sankey") {
        return !!(chartData.sankey?.nodes?.length && chartData.sankey?.links?.length)
    }
    return Array.isArray(chartData.data) && chartData.data.length > 0
}

/**
 * Validate a sankey graph before handing it to recharts.
 *
 * recharts' Sankey layout (`updateDepthOfTargets`) walks the graph recursively
 * with NO visited guard, so a self-loop or any cycle reachable from a source
 * recurses until the call stack overflows — which crashes the whole editor via
 * the plugin error boundary. We therefore reject self-loops, out-of-range
 * indices, and cycles up front and render a friendly message instead.
 */
function validateSankeyGraph(sankey?: SankeyData): { ok: boolean; error?: string } {
    if (!sankey || !sankey.nodes?.length || !sankey.links?.length) {
        return { ok: false, error: "Provide `sankey.nodes` and `sankey.links` to render the flow" }
    }
    const n = sankey.nodes.length
    const adj: number[][] = Array.from({ length: n }, () => [])
    for (const link of sankey.links) {
        const { source, target } = link
        if (typeof source !== "number" || typeof target !== "number"
            || !Number.isInteger(source) || !Number.isInteger(target)
            || source < 0 || target < 0 || source >= n || target >= n) {
            return { ok: false, error: "A sankey link references a node index out of range (links use 0-based node indices)" }
        }
        if (source === target) {
            return { ok: false, error: "A sankey link connects a node to itself; self-loops are not allowed" }
        }
        adj[source].push(target)
    }
    // Cycle detection via 3-color DFS — bounded by node count, so it cannot
    // overflow the way recharts' own traversal would.
    const WHITE = 0, GRAY = 1, BLACK = 2
    const color = new Array(n).fill(WHITE)
    const hasCycle = (u: number): boolean => {
        color[u] = GRAY
        for (const v of adj[u]) {
            if (color[v] === GRAY) return true
            if (color[v] === WHITE && hasCycle(v)) return true
        }
        color[u] = BLACK
        return false
    }
    for (let i = 0; i < n; i++) {
        if (color[i] === WHITE && hasCycle(i)) {
            return { ok: false, error: "Sankey data contains a cycle; flows must form a directed acyclic graph" }
        }
    }
    return { ok: true }
}

/**
 * Build the recharts `scale` prop for the value (Y) axis.
 * When logScale is set we also need an explicit positive domain + allowDataOverflow
 * so recharts doesn't fall back to a linear-looking auto domain.
 */
function valueAxisScaleProps(chartData: ChartData) {
    if (!chartData.logScale) return {}
    return { scale: "log" as const, domain: ["auto", "auto"] as [string, string], allowDataOverflow: true }
}

/** Compact number formatter shared by axis ticks and data labels (8100000 → 8.1M). */
const compactFormatter = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })

/**
 * Format a numeric value according to the chart's `valueFormat`.
 * 'auto' (default) keeps small numbers readable and compacts large ones;
 * 'compact' always compacts; 'percent' appends '%'; 'none' shows the raw value.
 */
function formatValue(value: unknown, format?: string): string {
    if (typeof value !== "number" || !Number.isFinite(value)) return String(value ?? "")
    switch (format) {
        case "none":
            return String(value)
        case "percent":
            return `${value.toLocaleString()}%`
        case "compact":
            return compactFormatter.format(value)
        case "auto":
        default:
            return Math.abs(value) >= 10000 ? compactFormatter.format(value) : value.toLocaleString()
    }
}

/**
 * Tick formatter for the value axis. In 100% stacked mode ('expand') the axis
 * runs 0–1, so ticks are rendered as percentages regardless of valueFormat.
 */
function getValueTickFormatter(chartData: ChartData): (v: any) => string {
    if (chartData.stacked && chartData.stackOffset === "expand") {
        return (v: any) => (typeof v === "number" ? `${Math.round(v * 100)}%` : String(v))
    }
    return (v: any) => formatValue(v, chartData.valueFormat)
}

/** Truncate long category labels so axis ticks stay readable (full text stays in the tooltip). */
const CATEGORY_LABEL_MAX = 14
function truncateLabel(v: any): string {
    const s = String(v ?? "")
    return s.length > CATEGORY_LABEL_MAX ? `${s.slice(0, CATEGORY_LABEL_MAX - 1)}…` : s
}

/**
 * Extra props for the category (X) axis to handle long / crowded labels.
 * An explicit `xTickAngle` wins; otherwise labels auto-rotate when many
 * categories or long labels would overlap. Labels are always truncated.
 */
function categoryAxisProps(chartData: ChartData): Record<string, any> {
    const categoryKey = chartData.categoryKey || "name"
    const data = chartData.data || []
    const maxLen = data.reduce((m, row) => Math.max(m, String(row?.[categoryKey] ?? "").length), 0)
    const autoRotate = (data.length > 8 && maxLen > 4) || maxLen > 10
    const angle = chartData.xTickAngle ?? (autoRotate ? -35 : 0)
    if (!angle) {
        return { tickFormatter: truncateLabel }
    }
    return {
        tickFormatter: truncateLabel,
        angle,
        textAnchor: angle < 0 ? "end" : "start",
        height: 60,
    }
}

/** Width for the category Y-axis of horizontal bar charts, sized to the (truncated) labels. */
function horizontalCategoryAxisWidth(chartData: ChartData): number {
    const categoryKey = chartData.categoryKey || "name"
    const maxLen = (chartData.data || []).reduce((m, row) => {
        const len = Math.min(String(row?.[categoryKey] ?? "").length, CATEGORY_LABEL_MAX)
        return Math.max(m, len)
    }, 0)
    // ~6.5px per character at the 12px tick font, plus padding
    return Math.min(160, Math.max(60, Math.round(maxLen * 6.5) + 16))
}

/**
 * Domain for radialBar rings. Values within 0–100 keep the classic percentage
 * domain; larger values get a rounded-up "nice" maximum so raw counts don't
 * overflow (previously the domain was hard-coded to [0, 100]).
 */
function radialBarDomain(chartData: ChartData, dataKey: string): [number, number] {
    const values = (chartData.data || [])
        .map(row => Number(row?.[dataKey]))
        .filter(v => Number.isFinite(v))
    const max = values.length ? Math.max(...values) : 0
    if (max <= 100) return [0, 100]
    const pow = 10 ** Math.floor(Math.log10(max))
    const niceStep = [1, 1.5, 2, 2.5, 5, 10].find(s => s * pow >= max) ?? 10
    return [0, niceStep * pow]
}

/** Hide per-point dots on dense line charts to keep rendering fast and clean. */
const LINE_DOT_LIMIT = 60
function lineDotProps(chartData: ChartData): false | { r: number } {
    return (chartData.data?.length ?? 0) > LINE_DOT_LIMIT ? false : { r: 4 }
}

/**
 * Render the configured reference / threshold lines for a cartesian chart.
 * Returns an array of <ReferenceLine> elements (empty when none configured).
 * `yAxisId` is passed through for compose charts that declare axes.
 */
function renderReferenceLines(chartData: ChartData, isDark: boolean, yAxisId?: string): React.ReactNode[] {
    const lines = chartData.referenceLines
    if (!lines || lines.length === 0) return []
    return lines.map((ln, i) => {
        const color = ln.color || getFallbackColor(i, isDark, chartData.colorScheme)
        const axisProps = ln.axis === "x" ? { x: ln.value } : { y: ln.value }
        return (
            <ReferenceLine
                key={`ref-${i}`}
                {...axisProps}
                {...(yAxisId ? { yAxisId } : {})}
                stroke={color}
                strokeDasharray={ln.dashed === false ? undefined : "6 4"}
                strokeWidth={1.5}
                label={ln.label ? { value: ln.label, position: "insideTopRight", fill: color, fontSize: 11 } : undefined}
            />
        )
    })
}

/**
 * Render a <Brush> control when enabled, for zooming/panning large datasets.
 */
function renderBrush(chartData: ChartData, categoryKey: string): React.ReactNode {
    if (!chartData.enableBrush) return null
    return <Brush dataKey={categoryKey} height={22} travellerWidth={8} stroke="hsl(var(--muted-foreground))" />
}

/**
 * Render the SVG <defs> gradients used by area fills when gradientFill is set.
 * One vertical gradient per series keyed by `gradient-<index>`.
 */
function renderAreaGradients(chartData: ChartData, isDark: boolean): React.ReactNode {
    if (!chartData.gradientFill) return null
    const dataKeys = chartData.dataKeys || []
    return (
        <defs>
            {dataKeys.map((key, index) => {
                const color = resolveSeriesColor(chartData, key, index, isDark)
                return (
                    <linearGradient key={key} id={`gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.7} />
                        <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                    </linearGradient>
                )
            })}
        </defs>
    )
}

/**
 * Render a Bar Chart
 */
const BarChartRender: React.FC<{ chartData: ChartData; config: ChartConfig; height: number; isDark: boolean }> = ({
    chartData, config, height, isDark
}) => {
    const dataKeys = chartData.dataKeys || []
    const categoryKey = chartData.categoryKey || "name"

    const stackOffset = chartData.stacked && chartData.stackOffset === "expand" ? "expand" : undefined

    return (
        <ChartContainer config={config} className="w-full" style={{ height }}>
            <BarChart
                data={chartData.data}
                layout={chartData.horizontal ? "vertical" : "horizontal"}
                stackOffset={stackOffset}
                accessibilityLayer
            >
                {chartData.showGrid !== false && <CartesianGrid vertical={false} strokeDasharray="3 3" />}
                {chartData.horizontal ? (
                    <>
                        <YAxis
                            dataKey={categoryKey}
                            type="category"
                            tickLine={false}
                            axisLine={false}
                            width={horizontalCategoryAxisWidth(chartData)}
                            tickFormatter={truncateLabel}
                        />
                        <XAxis type="number" hide={false} tickFormatter={getValueTickFormatter(chartData)} {...valueAxisScaleProps(chartData)} />
                    </>
                ) : (
                    <>
                        <XAxis dataKey={categoryKey} tickLine={false} tickMargin={10} axisLine={false} {...categoryAxisProps(chartData)} />
                        <YAxis tickLine={false} axisLine={false} tickFormatter={getValueTickFormatter(chartData)} {...valueAxisScaleProps(chartData)} />
                    </>
                )}
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                {dataKeys.map((key, index) => (
                    <Bar
                        key={key}
                        dataKey={key}
                        fill={resolveSeriesColor(chartData, key, index, isDark)}
                        stackId={chartData.stacked ? "stack" : undefined}
                        radius={chartData.stacked ? undefined : [4, 4, 0, 0]}
                    >
                        {chartData.showDataLabels && (
                            <LabelList dataKey={key} position="top" className="fill-foreground text-xs" formatter={(v: any) => formatValue(v, chartData.valueFormat)} />
                        )}
                    </Bar>
                ))}
                {renderReferenceLines(chartData, isDark)}
                {renderBrush(chartData, categoryKey)}
                {chartData.showLegend !== false && <ChartLegend content={<ChartLegendContent />} />}
            </BarChart>
        </ChartContainer>
    )
}

/**
 * Render a Line Chart
 */
const LineChartRender: React.FC<{ chartData: ChartData; config: ChartConfig; height: number; isDark: boolean }> = ({
    chartData, config, height, isDark
}) => {
    const dataKeys = chartData.dataKeys || []
    const categoryKey = chartData.categoryKey || "name"

    return (
        <ChartContainer config={config} className="w-full" style={{ height }}>
            <LineChart data={chartData.data} accessibilityLayer>
                {chartData.showGrid !== false && <CartesianGrid strokeDasharray="3 3" />}
                <XAxis dataKey={categoryKey} tickLine={false} tickMargin={10} axisLine={false} {...categoryAxisProps(chartData)} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={getValueTickFormatter(chartData)} {...valueAxisScaleProps(chartData)} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                {dataKeys.map((key, index) => (
                    <Line
                        key={key}
                        type={chartData.smoothLine !== false ? "monotone" : "linear"}
                        dataKey={key}
                        stroke={resolveSeriesColor(chartData, key, index, isDark)}
                        strokeWidth={2}
                        dot={lineDotProps(chartData)}
                    >
                        {chartData.showDataLabels && (
                            <LabelList dataKey={key} position="top" className="fill-foreground text-xs" formatter={(v: any) => formatValue(v, chartData.valueFormat)} />
                        )}
                    </Line>
                ))}
                {renderReferenceLines(chartData, isDark)}
                {renderBrush(chartData, categoryKey)}
                {chartData.showLegend !== false && <ChartLegend content={<ChartLegendContent />} />}
            </LineChart>
        </ChartContainer>
    )
}

/**
 * Render an Area Chart
 */
const AreaChartRender: React.FC<{ chartData: ChartData; config: ChartConfig; height: number; isDark: boolean }> = ({
    chartData, config, height, isDark
}) => {
    const dataKeys = chartData.dataKeys || []
    const categoryKey = chartData.categoryKey || "name"

    const stackOffset = chartData.stacked && chartData.stackOffset === "expand" ? "expand" : undefined
    const useGradient = chartData.gradientFill === true

    return (
        <ChartContainer config={config} className="w-full" style={{ height }}>
            <AreaChart data={chartData.data} stackOffset={stackOffset} accessibilityLayer>
                {renderAreaGradients(chartData, isDark)}
                {chartData.showGrid !== false && <CartesianGrid vertical={false} strokeDasharray="3 3" />}
                <XAxis dataKey={categoryKey} tickLine={false} tickMargin={10} axisLine={false} {...categoryAxisProps(chartData)} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={getValueTickFormatter(chartData)} {...valueAxisScaleProps(chartData)} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                {dataKeys.map((key, index) => {
                    const color = resolveSeriesColor(chartData, key, index, isDark)
                    return (
                        <Area
                            key={key}
                            type={chartData.smoothLine !== false ? "monotone" : "linear"}
                            dataKey={key}
                            fill={useGradient ? `url(#gradient-${index})` : color}
                            fillOpacity={useGradient ? 1 : 0.4}
                            stroke={color}
                            stackId={chartData.stacked ? "stack" : undefined}
                        />
                    )
                })}
                {renderReferenceLines(chartData, isDark)}
                {renderBrush(chartData, categoryKey)}
                {chartData.showLegend !== false && <ChartLegend content={<ChartLegendContent />} />}
            </AreaChart>
        </ChartContainer>
    )
}

/**
 * Render a Pie Chart
 */
const PieChartRender: React.FC<{ chartData: ChartData; config: ChartConfig; height: number; isDark: boolean }> = ({
    chartData, config, height, isDark
}) => {
    const dataKeys = chartData.dataKeys || []
    const dataKey = dataKeys[0] || "value"
    const categoryKey = chartData.categoryKey || "name"
    const innerRadius = chartData.innerRadius || 0

    return (
        <ChartContainer config={config} className="w-full" style={{ height }}>
            <PieChart>
                <ChartTooltip content={<ChartTooltipContent nameKey={categoryKey} />} />
                <Pie
                    data={chartData.data}
                    dataKey={dataKey}
                    nameKey={categoryKey}
                    cx="50%"
                    cy="50%"
                    innerRadius={innerRadius}
                    outerRadius={Math.min(height, 300) / 2 - 20}
                >
                    {chartData.data.map((row, index) => {
                        const name = String(row?.[categoryKey] ?? "")
                        const customColor = chartData.colors?.[name]
                        const fill = customColor || getFallbackColor(index, isDark, chartData.colorScheme)
                        return <Cell key={`cell-${index}`} fill={fill} />
                    })}
                    {chartData.showDataLabels && (
                        <LabelList dataKey={categoryKey} className="fill-foreground text-xs" />
                    )}
                </Pie>
                {chartData.showLegend !== false && <ChartLegend content={<ChartLegendContent nameKey={categoryKey} />} />}
            </PieChart>
        </ChartContainer>
    )
}

/**
 * Render a Radar Chart
 */
const RadarChartRender: React.FC<{ chartData: ChartData; config: ChartConfig; height: number; isDark: boolean }> = ({
    chartData, config, height, isDark
}) => {
    const dataKeys = chartData.dataKeys || []
    const categoryKey = chartData.categoryKey || "name"

    return (
        <ChartContainer config={config} className="w-full" style={{ height }}>
            <RadarChart data={chartData.data} cx="50%" cy="50%" outerRadius="80%">
                {chartData.showGrid !== false && <PolarGrid />}
                <PolarAngleAxis dataKey={categoryKey} />
                <PolarRadiusAxis />
                <ChartTooltip content={<ChartTooltipContent />} />
                {dataKeys.map((key, index) => (
                    <Radar
                        key={key}
                        name={key}
                        dataKey={key}
                        stroke={resolveSeriesColor(chartData, key, index, isDark)}
                        fill={resolveSeriesColor(chartData, key, index, isDark)}
                        fillOpacity={0.3}
                    />
                ))}
                {chartData.showLegend !== false && <ChartLegend content={<ChartLegendContent />} />}
            </RadarChart>
        </ChartContainer>
    )
}

/**
 * Render a Radial Bar Chart
 */
const RadialBarChartRender: React.FC<{ chartData: ChartData; config: ChartConfig; height: number; isDark: boolean }> = ({
    chartData, config, height, isDark
}) => {
    const dataKeys = chartData.dataKeys || []
    const dataKey = dataKeys[0] || "value"
    const categoryKey = chartData.categoryKey || "name"

    return (
        <ChartContainer config={config} className="w-full" style={{ height }}>
            <RadialBarChart data={chartData.data} cx="50%" cy="50%" innerRadius="20%" outerRadius="90%">
                <ChartTooltip content={<ChartTooltipContent nameKey={categoryKey} />} />
                <PolarAngleAxis dataKey={dataKey} type="number" domain={radialBarDomain(chartData, dataKey)} tick={false} />
                {/* Each ring is a separate category, so color per-row via <Cell>
                    (like the pie chart). Without explicit fills, RadialBar falls
                    back to the SVG default and renders every ring black. */}
                <RadialBar dataKey={dataKey} background cornerRadius={10}>
                    {chartData.data.map((row, index) => {
                        const name = String(row?.[categoryKey] ?? "")
                        const customColor = chartData.colors?.[name]
                        const fill = customColor || getFallbackColor(index, isDark, chartData.colorScheme)
                        return <Cell key={`cell-${index}`} fill={fill} />
                    })}
                </RadialBar>
                {chartData.showLegend !== false && <ChartLegend content={<ChartLegendContent nameKey={categoryKey} />} />}
            </RadialBarChart>
        </ChartContainer>
    )
}

/**
 * Render a Scatter Chart
 */
const ScatterChartRender: React.FC<{ chartData: ChartData; config: ChartConfig; height: number; isDark: boolean }> = ({
    chartData, config, height, isDark
}) => {
    const dataKeys = chartData.dataKeys || []
    const multi = chartData.scatterSeries && chartData.scatterSeries.length > 0

    // Resolve the axis field names. With explicit series we take them from the
    // first series; otherwise we fall back to the single-series dataKeys layout.
    const series: ScatterSeriesConfig[] = multi
        ? chartData.scatterSeries!
        : [{
            name: dataKeys[0] || "series",
            xKey: dataKeys[0] || "x",
            yKey: dataKeys[1] || "y",
            sizeKey: chartData.sizeKey || dataKeys[2],
            data: chartData.data,
        }]

    const xKey = series[0].xKey
    const yKey = series[0].yKey
    // Bubble sizing is active if any series declares a size field.
    const hasSize = series.some(s => s.sizeKey)

    return (
        <ChartContainer config={config} className="w-full" style={{ height }}>
            <ScatterChart>
                {chartData.showGrid !== false && <CartesianGrid strokeDasharray="3 3" />}
                <XAxis type="number" dataKey={xKey} name={xKey} tickLine={false} axisLine={false} tickFormatter={getValueTickFormatter(chartData)} {...valueAxisScaleProps(chartData)} />
                <YAxis type="number" dataKey={yKey} name={yKey} tickLine={false} axisLine={false} tickFormatter={getValueTickFormatter(chartData)} />
                {hasSize && <ZAxis type="number" dataKey={series[0].sizeKey} range={[60, 600]} />}
                <ChartTooltip cursor={{ strokeDasharray: "3 3" }} content={<ChartTooltipContent />} />
                {series.map((s, index) => (
                    <Scatter
                        key={s.name || index}
                        name={s.name}
                        data={s.data || chartData.data}
                        fill={resolveSeriesColor(chartData, s.name || `series-${index}`, index, isDark)}
                        fillOpacity={hasSize ? 0.65 : 1}
                    />
                ))}
                {renderReferenceLines(chartData, isDark)}
                {chartData.showLegend !== false && <ChartLegend content={<ChartLegendContent />} />}
            </ScatterChart>
        </ChartContainer>
    )
}

/**
 * Render a Composed (combination) Chart
 * Mixes bar, line, and area series in a single chart with optional dual Y-axes.
 */
const ComposedChartRender: React.FC<{ chartData: ChartData; config: ChartConfig; height: number; isDark: boolean }> = ({
    chartData, config, height, isDark
}) => {
    const dataKeys = chartData.dataKeys || []
    const categoryKey = chartData.categoryKey || "name"
    const seriesConfig = chartData.seriesConfig || {}
    const showRight = chartData.rightYAxis === true

    // Check if any series uses the right Y-axis
    const hasRightSeries = dataKeys.some(key => seriesConfig[key]?.yAxisId === 'right')

    const useGradient = chartData.gradientFill === true

    return (
        <ChartContainer config={config} className="w-full" style={{ height }}>
            <ComposedChart data={chartData.data} accessibilityLayer>
                {renderAreaGradients(chartData, isDark)}
                {chartData.showGrid !== false && <CartesianGrid vertical={false} strokeDasharray="3 3" />}
                <XAxis dataKey={categoryKey} tickLine={false} tickMargin={10} axisLine={false} {...categoryAxisProps(chartData)} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} tickFormatter={getValueTickFormatter(chartData)} {...valueAxisScaleProps(chartData)} />
                {(showRight || hasRightSeries) && (
                    <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tickFormatter={getValueTickFormatter(chartData)} />
                )}
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                {dataKeys.map((key, index) => {
                    const sc: SeriesConfig = seriesConfig[key] || { type: 'bar' }
                    const yAxisId = sc.yAxisId === 'right' && (showRight || hasRightSeries) ? 'right' : 'left'
                    const colorVar = resolveSeriesColor(chartData, key, index, isDark)

                    switch (sc.type) {
                        case 'line':
                            return (
                                <Line
                                    key={key}
                                    yAxisId={yAxisId}
                                    type={chartData.smoothLine !== false ? "monotone" : "linear"}
                                    dataKey={key}
                                    stroke={colorVar}
                                    strokeWidth={2}
                                    dot={lineDotProps(chartData)}
                                >
                                    {chartData.showDataLabels && (
                                        <LabelList dataKey={key} position="top" className="fill-foreground text-xs" formatter={(v: any) => formatValue(v, chartData.valueFormat)} />
                                    )}
                                </Line>
                            )
                        case 'area':
                            return (
                                <Area
                                    key={key}
                                    yAxisId={yAxisId}
                                    type={chartData.smoothLine !== false ? "monotone" : "linear"}
                                    dataKey={key}
                                    fill={useGradient ? `url(#gradient-${index})` : colorVar}
                                    fillOpacity={useGradient ? 1 : 0.4}
                                    stroke={colorVar}
                                />
                            )
                        case 'bar':
                        default:
                            return (
                                <Bar
                                    key={key}
                                    yAxisId={yAxisId}
                                    dataKey={key}
                                    fill={colorVar}
                                    radius={[4, 4, 0, 0]}
                                >
                                    {chartData.showDataLabels && (
                                        <LabelList dataKey={key} position="top" className="fill-foreground text-xs" formatter={(v: any) => formatValue(v, chartData.valueFormat)} />
                                    )}
                                </Bar>
                            )
                    }
                })}
                {renderReferenceLines(chartData, isDark, "left")}
                {renderBrush(chartData, categoryKey)}
                {chartData.showLegend !== false && <ChartLegend content={<ChartLegendContent />} />}
            </ComposedChart>
        </ChartContainer>
    )
}

/**
 * Render a Funnel Chart
 * Single value series; each stage is colored per-row like the pie chart.
 */
const FunnelChartRender: React.FC<{ chartData: ChartData; config: ChartConfig; height: number; isDark: boolean }> = ({
    chartData, config, height, isDark
}) => {
    const dataKeys = chartData.dataKeys || []
    const dataKey = dataKeys[0] || "value"
    const categoryKey = chartData.categoryKey || "name"

    return (
        <ChartContainer config={config} className="w-full" style={{ height }}>
            <FunnelChart>
                <ChartTooltip content={<ChartTooltipContent nameKey={categoryKey} />} />
                <Funnel dataKey={dataKey} nameKey={categoryKey} data={chartData.data} isAnimationActive>
                    {chartData.data.map((row, index) => {
                        const name = String(row?.[categoryKey] ?? "")
                        const customColor = chartData.colors?.[name]
                        const fill = customColor || getFallbackColor(index, isDark, chartData.colorScheme)
                        return <Cell key={`cell-${index}`} fill={fill} />
                    })}
                    <LabelList position="right" dataKey={categoryKey} className="fill-foreground text-xs" stroke="none" />
                    {chartData.showDataLabels && (
                        <LabelList position="inside" dataKey={dataKey} className="fill-background text-xs" stroke="none" formatter={(v: any) => formatValue(v, chartData.valueFormat)} />
                    )}
                </Funnel>
            </FunnelChart>
        </ChartContainer>
    )
}

/**
 * Custom Treemap cell content — colors each top-level rectangle from the palette
 * and renders the category label when the cell is large enough.
 */
const TreemapContent = (colorScheme: string | undefined, isDark: boolean) => (props: any) => {
    const { x, y, width, height, index, name, depth } = props
    const fill = getFallbackColor(index || 0, isDark, colorScheme)
    return (
        <g>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                style={{ fill, stroke: "hsl(var(--background))", strokeWidth: 2, fillOpacity: depth < 2 ? 0.9 : 0.65 }}
            />
            {width > 50 && height > 22 && name && (
                <text x={x + 6} y={y + 18} fill="hsl(var(--background))" fontSize={12} className="font-medium">
                    {String(name)}
                </text>
            )}
        </g>
    )
}

/**
 * Render a Treemap Chart
 * Proportional nested rectangles; size from dataKeys[0], label from categoryKey.
 */
const TreemapChartRender: React.FC<{ chartData: ChartData; config: ChartConfig; height: number; isDark: boolean }> = ({
    chartData, config, height, isDark
}) => {
    const dataKeys = chartData.dataKeys || []
    const dataKey = dataKeys[0] || "value"
    const categoryKey = chartData.categoryKey || "name"

    return (
        <ChartContainer config={config} className="w-full" style={{ height }}>
            <Treemap
                data={chartData.data}
                dataKey={dataKey}
                nameKey={categoryKey}
                aspectRatio={4 / 3}
                isAnimationActive={false}
                content={TreemapContent(chartData.colorScheme, isDark) as any}
            >
                <ChartTooltip content={<ChartTooltipContent nameKey={categoryKey} />} />
            </Treemap>
        </ChartContainer>
    )
}

/**
 * Render a Sankey (flow) Chart
 * Requires the dedicated `sankey` node/link graph rather than a flat data array.
 */
const SankeyChartRender: React.FC<{ chartData: ChartData; config: ChartConfig; height: number; isDark: boolean }> = ({
    chartData, config, height, isDark
}) => {
    const sankey = chartData.sankey
    // Validate up front: an invalid graph (cycle / self-loop / bad index) would
    // make recharts' Sankey recurse until the call stack overflows and crash the
    // whole editor, so we render a message instead of attempting to draw it.
    const validation = validateSankeyGraph(sankey)
    if (!validation.ok) {
        return (
            <div className="flex items-center justify-center w-full" style={{ height }}>
                <EmptyState
                    className="border-none rounded-md"
                    title="Sankey Chart"
                    description={validation.error || "Invalid sankey data"}
                    icons={[BarChart3]}
                />
            </div>
        )
    }

    const nodeColor = getFallbackColor(0, isDark, chartData.colorScheme)
    const linkColor = getFallbackColor(1, isDark, chartData.colorScheme)

    return (
        <ChartContainer config={config} className="w-full" style={{ height }}>
            <Sankey
                data={sankey!}
                nodePadding={24}
                nodeWidth={12}
                linkCurvature={0.5}
                iterations={32}
                node={{ fill: nodeColor, stroke: nodeColor }}
                link={{ stroke: linkColor, strokeOpacity: 0.25 }}
                margin={{ top: 8, right: 80, bottom: 8, left: 8 }}
            >
                <ChartTooltip content={<ChartTooltipContent />} />
            </Sankey>
        </ChartContainer>
    )
}

/**
 * Chart type options for the config selector
 */
const CHART_TYPE_OPTIONS = [
    { value: "bar", label: "Bar Chart" },
    { value: "line", label: "Line Chart" },
    { value: "area", label: "Area Chart" },
    { value: "pie", label: "Pie Chart" },
    { value: "radar", label: "Radar Chart" },
    { value: "radialBar", label: "Radial Bar Chart" },
    { value: "scatter", label: "Scatter / Bubble Chart" },
    { value: "compose", label: "Composite Chart" },
    { value: "funnel", label: "Funnel Chart" },
    { value: "treemap", label: "Treemap" },
    { value: "sankey", label: "Sankey Chart" },
] as const

/** Compact uppercase section header for the config panel */
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold select-none">
        {children}
    </div>
)

/** Compact toggle row - label + Switch in one tight line */
const ToggleRow: React.FC<{
    label: string
    checked: boolean
    onChange: (v: boolean) => void
}> = ({ label, checked, onChange }) => (
    <label className="flex items-center justify-between gap-2 rounded px-1.5 py-0.5 hover:bg-accent/40 cursor-pointer">
        <span className="text-xs text-foreground/90 truncate">{label}</span>
        <Switch
            checked={checked}
            onCheckedChange={onChange}
            className="scale-[0.7] origin-right -mr-1"
        />
    </label>
)

/**
 * DataTableView - Renders chart data as a read-only table
 */
const DataTableView: React.FC<{ chartData: ChartData }> = ({ chartData }) => {
    const categoryKey = chartData.categoryKey || "name"
    const dataKeys = chartData.dataKeys || []
    const data = chartData.data || []

    // Collect all unique keys from data rows to display as columns
    const allKeys = useMemo(() => {
        if (data.length === 0) return []
        const keySet = new Set<string>()
        // Always start with categoryKey, then dataKeys, then any remaining keys
        if (categoryKey) keySet.add(categoryKey)
        dataKeys.forEach(k => keySet.add(k))
        for (const row of data) {
            for (const k of Object.keys(row)) {
                keySet.add(k)
            }
        }
        // Return in order: categoryKey first, then dataKeys, then the rest
        const ordered: string[] = []
        if (categoryKey && keySet.has(categoryKey)) {
            ordered.push(categoryKey)
            keySet.delete(categoryKey)
        }
        for (const dk of dataKeys) {
            if (keySet.has(dk)) {
                ordered.push(dk)
                keySet.delete(dk)
            }
        }
        for (const k of keySet) {
            ordered.push(k)
        }
        return ordered
    }, [data, dataKeys, categoryKey])

    if (data.length === 0) {
        return (
            <div className="p-4 text-xs text-muted-foreground text-center">
                No data to display
            </div>
        )
    }

    return (
        <div className="overflow-auto not-prose" style={{ maxHeight: Math.max(chartData.height || 300, 300) }}>
            <Table className="text-xs w-full">
                <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                        {allKeys.map((key, i) => (
                            <TableHead
                                key={key}
                                className={`h-7 text-[11px] font-semibold tracking-wide uppercase text-muted-foreground/80 ${i === 0 ? 'pl-3' : 'text-right pr-3'}`}
                            >
                                {key}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((row, rowIndex) => (
                        <TableRow key={rowIndex} className={`${rowIndex % 2 === 0 ? '' : 'bg-muted/20'} hover:bg-muted/40 transition-colors`}>
                            {allKeys.map((key, i) => (
                                <TableCell
                                    key={key}
                                    className={`py-1 text-xs tabular-nums ${i === 0 ? 'pl-3 font-medium' : 'text-right pr-3 text-muted-foreground'}`}
                                >
                                    {row[key] != null ? String(row[key]) : "-"}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
/**
 * ConfigPanel - Form controls for editing chart configuration
 */
const ConfigPanel: React.FC<{
    chartData: ChartData
    onUpdate: (updates: Partial<ChartData>) => void
    isDark: boolean
}> = ({ chartData, onUpdate, isDark }) => {
    const showSmoothLine = chartData.type === "line" || chartData.type === "area" || chartData.type === "compose"
    const showStacked = chartData.type === "bar" || chartData.type === "area"
    const showHorizontal = chartData.type === "bar"
    const showInnerRadius = chartData.type === "pie"
    const showComposeConfig = chartData.type === "compose"

    // Advanced feature visibility
    const isCartesian = ["bar", "line", "area", "compose", "scatter"].includes(chartData.type)
    const showGradient = chartData.type === "area" || chartData.type === "compose"
    const showPercentStack = (chartData.type === "bar" || chartData.type === "area") && chartData.stacked === true

    // Reference line editing helpers
    const refLines = chartData.referenceLines || []
    const addReferenceLine = () => {
        onUpdate({ referenceLines: [...refLines, { axis: "y", value: 0 }] })
    }
    const updateReferenceLine = (i: number, updates: Partial<typeof refLines[number]>) => {
        const next = refLines.map((ln, idx) => (idx === i ? { ...ln, ...updates } : ln))
        onUpdate({ referenceLines: next })
    }
    const removeReferenceLine = (i: number) => {
        onUpdate({ referenceLines: refLines.filter((_, idx) => idx !== i) })
    }

    // Helper to update a single series config
    const updateSeriesConfig = (key: string, updates: Partial<SeriesConfig>) => {
        const prev = chartData.seriesConfig || {}
        const existing = prev[key] || { type: 'bar' as const }
        onUpdate({
            seriesConfig: {
                ...prev,
                [key]: { ...existing, ...updates }
            }
        })
    }

    return (
        <div className="p-3 space-y-4">
            {/* Type */}
            <div className="space-y-1.5">
                <SectionLabel>Type</SectionLabel>
                <Select
                    value={chartData.type}
                    onValueChange={(value) => onUpdate({ type: value })}
                >
                    <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {CHART_TYPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Text */}
            <div className="space-y-1.5">
                <SectionLabel>Text</SectionLabel>
                <Input
                    value={chartData.title || ""}
                    onChange={(e) => onUpdate({ title: e.target.value || undefined })}
                    placeholder="Title"
                    className="h-7 text-xs"
                />
                <Input
                    value={chartData.description || ""}
                    onChange={(e) => onUpdate({ description: e.target.value || undefined })}
                    placeholder="Description"
                    className="h-7 text-xs"
                />
            </div>

            {/* Axis */}
            <div className="space-y-1.5">
                <SectionLabel>Axis</SectionLabel>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16 shrink-0">Category</span>
                    <Input
                        value={chartData.categoryKey || ""}
                        onChange={(e) => onUpdate({ categoryKey: e.target.value || undefined })}
                        placeholder="e.g. name"
                        className="h-7 text-xs flex-1 min-w-0"
                    />
                </div>
                <div className="flex items-start gap-2">
                    <span className="text-xs text-muted-foreground w-16 shrink-0 pt-1">Series</span>
                    <div className="flex flex-wrap gap-1 flex-1 min-h-[1.75rem] items-center">
                        {chartData.dataKeys && chartData.dataKeys.length > 0 ? (
                            chartData.dataKeys.map((key) => (
                                <Badge
                                    key={key}
                                    variant="secondary"
                                    className="text-[10px] h-5 px-1.5 font-normal"
                                >
                                    {key}
                                </Badge>
                            ))
                        ) : (
                            <span className="text-[11px] text-muted-foreground/60">None defined</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Display */}
            <div className="space-y-1.5">
                <SectionLabel>Display</SectionLabel>
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 -mx-1.5">
                    <ToggleRow
                        label="Legend"
                        checked={chartData.showLegend !== false}
                        onChange={(c) => onUpdate({ showLegend: c })}
                    />
                    <ToggleRow
                        label="Grid"
                        checked={chartData.showGrid !== false}
                        onChange={(c) => onUpdate({ showGrid: c })}
                    />
                    <ToggleRow
                        label="Data Labels"
                        checked={chartData.showDataLabels === true}
                        onChange={(c) => onUpdate({ showDataLabels: c })}
                    />
                    {showSmoothLine && (
                        <ToggleRow
                            label="Smooth"
                            checked={chartData.smoothLine !== false}
                            onChange={(c) => onUpdate({ smoothLine: c })}
                        />
                    )}
                    {showStacked && (
                        <ToggleRow
                            label="Stacked"
                            checked={chartData.stacked === true}
                            onChange={(c) => onUpdate({ stacked: c })}
                        />
                    )}
                    {showHorizontal && (
                        <ToggleRow
                            label="Horizontal"
                            checked={chartData.horizontal === true}
                            onChange={(c) => onUpdate({ horizontal: c })}
                        />
                    )}
                    {showComposeConfig && (
                        <ToggleRow
                            label="Right Y-Axis"
                            checked={chartData.rightYAxis === true}
                            onChange={(c) => onUpdate({ rightYAxis: c })}
                        />
                    )}
                </div>
            </div>

            {/* Advanced (cartesian charts only) */}
            {isCartesian && (
                <div className="space-y-1.5">
                    <SectionLabel>Advanced</SectionLabel>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 -mx-1.5">
                        <ToggleRow
                            label="Zoom (Brush)"
                            checked={chartData.enableBrush === true}
                            onChange={(c) => onUpdate({ enableBrush: c })}
                        />
                        <ToggleRow
                            label="Log Scale"
                            checked={chartData.logScale === true}
                            onChange={(c) => onUpdate({ logScale: c })}
                        />
                        {showPercentStack && (
                            <ToggleRow
                                label="100% Stack"
                                checked={chartData.stackOffset === "expand"}
                                onChange={(c) => onUpdate({ stackOffset: c ? "expand" : "none" })}
                            />
                        )}
                        {showGradient && (
                            <ToggleRow
                                label="Gradient Fill"
                                checked={chartData.gradientFill === true}
                                onChange={(c) => onUpdate({ gradientFill: c })}
                            />
                        )}
                    </div>

                    {/* Value formatting & X label angle */}
                    <div className="flex items-center gap-2 pt-1">
                        <span className="text-[11px] text-muted-foreground w-20 shrink-0">Value Format</span>
                        <Select
                            value={chartData.valueFormat || "auto"}
                            onValueChange={(v) => onUpdate({ valueFormat: v === "auto" ? undefined : v as ChartData["valueFormat"] })}
                        >
                            <SelectTrigger className="h-6 text-[11px] flex-1">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="auto" className="text-xs">Auto (8.1M)</SelectItem>
                                <SelectItem value="compact" className="text-xs">Compact</SelectItem>
                                <SelectItem value="percent" className="text-xs">Percent (%)</SelectItem>
                                <SelectItem value="none" className="text-xs">Raw</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {chartData.type !== "scatter" && (
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground w-20 shrink-0">Label Angle</span>
                            <Select
                                value={chartData.xTickAngle === undefined ? "auto" : String(chartData.xTickAngle)}
                                onValueChange={(v) => onUpdate({ xTickAngle: v === "auto" ? undefined : Number(v) })}
                            >
                                <SelectTrigger className="h-6 text-[11px] flex-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="auto" className="text-xs">Auto</SelectItem>
                                    <SelectItem value="0" className="text-xs">0°</SelectItem>
                                    <SelectItem value="-35" className="text-xs">-35°</SelectItem>
                                    <SelectItem value="-90" className="text-xs">-90°</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Reference / threshold lines */}
                    <div className="space-y-1 pt-1">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] text-muted-foreground">Reference Lines</span>
                            <button
                                type="button"
                                onClick={addReferenceLine}
                                className="text-[11px] text-primary hover:underline"
                            >
                                + Add
                            </button>
                        </div>
                        {refLines.map((ln, i) => (
                            <div key={i} className="flex items-center gap-1">
                                <Select
                                    value={ln.axis || "y"}
                                    onValueChange={(v) => updateReferenceLine(i, { axis: v as "x" | "y" })}
                                >
                                    <SelectTrigger className="h-6 text-[11px] w-[52px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="y" className="text-xs">Y</SelectItem>
                                        <SelectItem value="x" className="text-xs">X</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Input
                                    value={String(ln.value ?? "")}
                                    onChange={(e) => {
                                        const raw = e.target.value
                                        const num = Number(raw)
                                        updateReferenceLine(i, { value: raw !== "" && !Number.isNaN(num) ? num : raw })
                                    }}
                                    placeholder="value"
                                    className="h-6 text-[11px] w-[64px]"
                                />
                                <Input
                                    value={ln.label || ""}
                                    onChange={(e) => updateReferenceLine(i, { label: e.target.value || undefined })}
                                    placeholder="label"
                                    className="h-6 text-[11px] flex-1 min-w-0"
                                />
                                <button
                                    type="button"
                                    onClick={() => removeReferenceLine(i)}
                                    className="text-[11px] text-muted-foreground hover:text-destructive px-1"
                                    aria-label="Remove reference line"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Series Config for Compose Chart */}
            {showComposeConfig && chartData.dataKeys && chartData.dataKeys.length > 0 && (
                <div className="space-y-2">
                    <SectionLabel>Series Config</SectionLabel>
                    {chartData.dataKeys.map((key) => {
                        const sc = chartData.seriesConfig?.[key] || { type: 'bar' as const }
                        return (
                            <div key={key} className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground w-16 shrink-0 truncate" title={key}>{key}</span>
                                <Select
                                    value={sc.type}
                                    onValueChange={(value) => updateSeriesConfig(key, { type: value as SeriesConfig['type'] })}
                                >
                                    <SelectTrigger className="h-6 text-[11px] w-[72px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="bar" className="text-xs">Bar</SelectItem>
                                        <SelectItem value="line" className="text-xs">Line</SelectItem>
                                        <SelectItem value="area" className="text-xs">Area</SelectItem>
                                    </SelectContent>
                                </Select>
                                {(chartData.rightYAxis || sc.yAxisId === 'right') && (
                                    <Select
                                        value={sc.yAxisId || 'left'}
                                        onValueChange={(value) => updateSeriesConfig(key, { yAxisId: value as 'left' | 'right' })}
                                    >
                                        <SelectTrigger className="h-6 text-[11px] w-[72px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="left" className="text-xs">Left Y</SelectItem>
                                            <SelectItem value="right" className="text-xs">Right Y</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Layout */}
            <div className="space-y-2">
                <SectionLabel>Layout</SectionLabel>
                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Height</span>
                        <span className="text-[11px] tabular-nums text-muted-foreground/80">
                            {chartData.height || 300}px
                        </span>
                    </div>
                    <Slider
                        value={[chartData.height || 300]}
                        onValueChange={([value]) => onUpdate({ height: value })}
                        min={200}
                        max={600}
                        step={50}
                        className="w-full"
                    />
                </div>
                {showInnerRadius && (
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Inner Radius</span>
                            <span className="text-[11px] tabular-nums text-muted-foreground/80">
                                {chartData.innerRadius || 0}px
                            </span>
                        </div>
                        <Slider
                            value={[chartData.innerRadius || 0]}
                            onValueChange={([value]) => onUpdate({ innerRadius: value })}
                            min={0}
                            max={100}
                            step={10}
                            className="w-full"
                        />
                    </div>
                )}
            </div>

            {/* Color Scheme */}
            <div className="space-y-2">
                <SectionLabel>Color Scheme</SectionLabel>
                <Select
                    value={chartData.colorScheme || "default"}
                    onValueChange={(value) => onUpdate({ colorScheme: value === "default" ? undefined : value })}
                >
                    <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {COLOR_PALETTES.map((palette) => (
                            <SelectItem key={palette.key} value={palette.key} className="text-xs">
                                <div className="flex items-center gap-2">
                                    <div className="flex gap-0.5">
                                        {palette.colors.slice(0, 5).map((c, i) => (
                                            <span
                                                key={i}
                                                className="inline-block h-3 w-3 rounded-full border border-border/40"
                                                style={{ backgroundColor: isDark ? c.dark : c.light }}
                                            />
                                        ))}
                                    </div>
                                    <span>{palette.label}</span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {/* Preview of current scheme colors */}
                <div className="flex gap-1 flex-wrap">
                    {getPalette(chartData.colorScheme).colors.map((c, i) => (
                        <span
                            key={i}
                            className="inline-block h-4 w-4 rounded-sm border border-border/40"
                            style={{ backgroundColor: isDark ? c.dark : c.light }}
                            title={`${isDark ? c.dark : c.light}`}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}

/**
 * ChartView - ProseMirror NodeView for rendering charts
 *
 * In edit mode (editor.isEditable), displays a split layout:
 *   - Left panel: Tabs with Data (JSON editor) and Config (form controls)
 *   - Right panel: Chart preview
 * In view mode, displays the full-width chart.
 */
export const ChartView: React.FC<NodeViewProps> = (props) => {
    const rawData = props.node.attrs.data
    const isEditable = props.editor.isEditable
    const { theme } = useTheme()
    const isDark = theme === 'dark'

    // chartData derived from the ProseMirror node attribute
    const chartData: ChartData | null = useMemo(() => {
        if (!rawData) return null
        try {
            return typeof rawData === "string" ? JSON.parse(rawData) : rawData
        } catch {
            return null
        }
    }, [rawData])

    // In edit mode, localChartData is the source of truth for the UI.
    // It is updated immediately on user interaction so the preview reflects
    // changes without waiting for the ProseMirror node to update.
    const [localChartData, setLocalChartData] = useState<ChartData | null>(chartData)

    // Sync localChartData when the node attribute changes externally (e.g. agent update)
    useEffect(() => {
        setLocalChartData(chartData)
    }, [chartData])

    // activeChartData selects between local (edit) and node-derived (view) state
    const activeChartData = isEditable ? localChartData : chartData

    const chartConfig = useMemo(() => {
        if (!activeChartData) return {} as ChartConfig
        return buildChartConfig(activeChartData)
    }, [activeChartData])

    const height = activeChartData?.height || 300

    // --- Edit mode: JSON editor state ---
    const [editJson, setEditJson] = useState<string>(() => {
        if (!chartData) return ""
        try {
            return JSON.stringify(chartData, null, 2)
        } catch {
            return ""
        }
    })

    const [jsonError, setJsonError] = useState<string | null>(null)

    // Sync editJson when chartData changes externally
    useEffect(() => {
        if (!chartData) return
        try {
            setEditJson(JSON.stringify(chartData, null, 2))
            setJsonError(null)
        } catch {
            // ignore
        }
    }, [chartData])

    const debouncedJson = useDebounce(editJson, { wait: 600 })

    // Persist a ChartData object to the ProseMirror node via a direct transaction.
    // Using setNodeMarkup is more reliable than props.updateAttributes for atom NodeViews,
    // because tiptap's updateAttributes can sometimes be no-op'd when the editor is
    // not focused or when called rapidly from inside React event handlers.
    const persistToNode = useCallback((data: ChartData) => {
        const editor = props.editor
        const getPos = props.getPos
        if (!editor || typeof getPos !== "function") return
        try {
            const pos = getPos()
            if (typeof pos !== "number") return
            const tr = editor.state.tr
            const currNode = tr.doc.nodeAt(pos)
            if (!currNode) return
            const nextStr = JSON.stringify(data)
            const currStr = typeof currNode.attrs.data === "string"
                ? currNode.attrs.data
                : JSON.stringify(currNode.attrs.data)
            if (nextStr === currStr) return
            tr.setNodeMarkup(pos, undefined, {
                ...currNode.attrs,
                data: nextStr,
            })
            editor.view.dispatch(tr)
        } catch {
            // ignore transaction errors
        }
    }, [props.editor, props.getPos])

    // Apply debounced JSON changes back to the node
    useEffect(() => {
        if (!isEditable) return
        if (!debouncedJson) return

        try {
            const parsed = JSON.parse(debouncedJson) as ChartData
            setJsonError(null)
            setLocalChartData(parsed)
            persistToNode(parsed)
        } catch {
            setJsonError("Invalid JSON syntax")
        }
    }, [debouncedJson, isEditable, persistToNode])

    // Handle config panel updates: update local state immediately + persist
    const handleConfigUpdate = useCallback((updates: Partial<ChartData>) => {
        setLocalChartData((prev) => {
            const base = prev || chartData
            if (!base) return prev
            const merged = { ...base, ...updates }
            // Keep the JSON editor in sync
            try {
                setEditJson(JSON.stringify(merged, null, 2))
                setJsonError(null)
            } catch {
                // ignore
            }
            // Persist to the ProseMirror node
            persistToNode(merged)
            return merged
        })
    }, [chartData, persistToNode])

    const renderChart = () => {
        if (!hasRenderableData(activeChartData)) {
            return null
        }

        switch (activeChartData.type) {
            case "bar":
                return <BarChartRender chartData={activeChartData} config={chartConfig} height={height} isDark={isDark} />
            case "line":
                return <LineChartRender chartData={activeChartData} config={chartConfig} height={height} isDark={isDark} />
            case "area":
                return <AreaChartRender chartData={activeChartData} config={chartConfig} height={height} isDark={isDark} />
            case "pie":
                return <PieChartRender chartData={activeChartData} config={chartConfig} height={height} isDark={isDark} />
            case "radar":
                return <RadarChartRender chartData={activeChartData} config={chartConfig} height={height} isDark={isDark} />
            case "radialBar":
                return <RadialBarChartRender chartData={activeChartData} config={chartConfig} height={height} isDark={isDark} />
            case "scatter":
                return <ScatterChartRender chartData={activeChartData} config={chartConfig} height={height} isDark={isDark} />
            case "compose":
                return <ComposedChartRender chartData={activeChartData} config={chartConfig} height={height} isDark={isDark} />
            case "funnel":
                return <FunnelChartRender chartData={activeChartData} config={chartConfig} height={height} isDark={isDark} />
            case "treemap":
                return <TreemapChartRender chartData={activeChartData} config={chartConfig} height={height} isDark={isDark} />
            case "sankey":
                return <SankeyChartRender chartData={activeChartData} config={chartConfig} height={height} isDark={isDark} />
            default:
                // Default to bar chart for unknown types
                return <BarChartRender chartData={{ ...activeChartData, type: "bar" }} config={chartConfig} height={height} isDark={isDark} />
        }
    }

    // --- Edit mode: split layout ---
    if (isEditable) {
        // Stop ProseMirror from intercepting events on interactive controls
        // (Select, Switch, Slider, Input, Textarea) inside this atom node.
        const stopPmEvents = {
            onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
            onClick: (e: React.MouseEvent) => e.stopPropagation(),
            onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
            onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
        }
        return (
            <NodeViewWrapper className="h-auto">
                <Card
                    className="overflow-hidden"
                    contentEditable={false}
                    suppressContentEditableWarning
                    {...stopPmEvents}
                >
                    {/* Mobile: stack vertically (preview on top, editor below).
                        Tablet/Desktop: side-by-side 50/50 split. */}
                    <div className="flex flex-col md:flex-row gap-0">
                        {/* Left Panel: Data + Config */}
                        <div className="w-full md:w-2/5 border-b md:border-b-0 md:border-r min-w-0 order-2 md:order-none">
                            <Tabs defaultValue="table" className="h-full flex flex-col">
                                <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-11 md:h-9 px-1">
                                    <TabsTrigger value="table" className="text-xs gap-1 data-[state=active]:shadow-none">
                                        <Table2 className="h-3.5 w-3.5" />
                                        Table
                                    </TabsTrigger>
                                    <TabsTrigger value="data" className="text-xs gap-1 data-[state=active]:shadow-none">
                                        <Table2 className="h-3.5 w-3.5" />
                                        JSON
                                    </TabsTrigger>
                                    <TabsTrigger value="config" className="text-xs gap-1 data-[state=active]:shadow-none">
                                        <Settings2 className="h-3.5 w-3.5" />
                                        Config
                                    </TabsTrigger>
                                </TabsList>

                                <TabsContent value="table" className="flex-1 mt-0 p-0">
                                    {activeChartData ? (
                                        <DataTableView chartData={activeChartData} />
                                    ) : (
                                        <div className="p-4 text-xs text-muted-foreground text-center">
                                            No data to display
                                        </div>
                                    )}
                                </TabsContent>

                                <TabsContent value="data" className="flex-1 mt-0 p-0">
                                    <div className="relative">
                                        <Textarea
                                            value={editJson}
                                            onChange={(e) => setEditJson(e.target.value)}
                                            className="font-mono text-xs resize-none border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
                                            style={{ height: Math.max(height, 300) }}
                                            placeholder='Enter chart JSON data...'
                                        />
                                        {jsonError && (
                                            <div className="absolute bottom-0 left-0 right-0 bg-destructive/90 text-destructive-foreground text-xs px-2 py-1 flex items-center gap-1">
                                                <AlertCircle className="h-3 w-3" />
                                                {jsonError}
                                            </div>
                                        )}
                                    </div>
                                </TabsContent>

                                <TabsContent value="config" className="flex-1 mt-0 p-0 overflow-auto" style={{ maxHeight: Math.max(height, 300) }}>
                                    <ScrollArea className="h-full">
                                        {activeChartData ? (
                                            <ConfigPanel chartData={activeChartData} onUpdate={handleConfigUpdate} isDark={isDark} />
                                        ) : (
                                            <div className="p-4 text-xs text-muted-foreground text-center">
                                                No chart data to configure
                                            </div>
                                        )}
                                    </ScrollArea>
                                </TabsContent>
                            </Tabs>
                        </div>

                        {/* Right Panel: Chart Preview */}
                        <div className="w-full md:w-3/5 p-3 flex flex-col items-center justify-center order-1 md:order-none">
                            {(activeChartData?.title || activeChartData?.description) && (
                                <div className="w-full text-center mb-1">
                                    {activeChartData.title && <div className="text-sm font-medium">{activeChartData.title}</div>}
                                    {activeChartData.description && <div className="text-xs text-muted-foreground">{activeChartData.description}</div>}
                                </div>
                            )}
                            {hasRenderableData(activeChartData) ? (
                                renderChart()
                            ) : (
                                <EmptyState
                                    className="h-[200px] w-full hover:bg-accent/10 border-none rounded-md"
                                    title="Chart"
                                    description="Enter JSON data to preview your chart"
                                    icons={[BarChart3]}
                                />
                            )}
                        </div>
                    </div>
                </Card>
            </NodeViewWrapper>
        )
    }

    // --- View mode: full-width chart ---
    return (
        <NodeViewWrapper className="h-auto">
            <Card className="overflow-hidden">
                {(chartData?.title || chartData?.description) && (
                    <CardHeader className="pb-2 pt-3 px-4">
                        {chartData.title && <CardTitle className="text-sm font-medium">{chartData.title}</CardTitle>}
                        {chartData.description && <CardDescription className="text-xs">{chartData.description}</CardDescription>}
                    </CardHeader>
                )}
                <CardContent className="p-2">
                    {hasRenderableData(chartData) ? (
                        renderChart()
                    ) : (
                        <EmptyState
                            className="h-[200px] w-full hover:bg-accent/10 border-none rounded-md"
                            title="Chart"
                            description="Agent will generate chart data for you"
                            icons={[BarChart3]}
                        />
                    )}
                </CardContent>
            </Card>
        </NodeViewWrapper>
    )
}
