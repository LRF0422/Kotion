import React, { useMemo } from "react"
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
    // Icons
} from "@kn/ui"
import { BarChart3 } from "@kn/icon"
import type { ChartData } from "./chart"

/** Default color palette for chart series */
const DEFAULT_COLORS = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
]

/** Pie chart color palette */
const PIE_COLORS = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
    "hsl(220 70% 50%)",
    "hsl(160 60% 45%)",
    "hsl(30 80% 55%)",
    "hsl(280 65% 60%)",
    "hsl(340 75% 55%)",
]

/**
 * Build a ChartConfig from ChartData for shadcn ChartContainer
 */
function buildChartConfig(chartData: ChartData): ChartConfig {
    const config: ChartConfig = {}
    const dataKeys = chartData.dataKeys || []

    dataKeys.forEach((key, index) => {
        const customColor = chartData.colors?.[key]
        config[key] = {
            label: key,
            color: customColor || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
        }
    })

    return config
}

/**
 * Render a Bar Chart
 */
const BarChartRender: React.FC<{ chartData: ChartData; config: ChartConfig; height: number }> = ({
    chartData, config, height
}) => {
    const dataKeys = chartData.dataKeys || []
    const categoryKey = chartData.categoryKey || "name"

    return (
        <ChartContainer config={config} className="w-full" style={{ height }}>
            <BarChart
                data={chartData.data}
                layout={chartData.horizontal ? "vertical" : "horizontal"}
                accessibilityLayer
            >
                {chartData.showGrid !== false && <CartesianGrid vertical={false} strokeDasharray="3 3" />}
                {chartData.horizontal ? (
                    <>
                        <YAxis dataKey={categoryKey} type="category" tickLine={false} axisLine={false} width={100} />
                        <XAxis type="number" hide={false} />
                    </>
                ) : (
                    <>
                        <XAxis dataKey={categoryKey} tickLine={false} tickMargin={10} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} />
                    </>
                )}
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                {dataKeys.map((key, index) => (
                    <Bar
                        key={key}
                        dataKey={key}
                        fill={`var(--color-${key})`}
                        stackId={chartData.stacked ? "stack" : undefined}
                        radius={chartData.stacked ? undefined : [4, 4, 0, 0]}
                    >
                        {chartData.showDataLabels && (
                            <LabelList dataKey={key} position="top" className="fill-foreground text-xs" />
                        )}
                    </Bar>
                ))}
                {chartData.showLegend !== false && <ChartLegend content={<ChartLegendContent />} />}
            </BarChart>
        </ChartContainer>
    )
}

/**
 * Render a Line Chart
 */
const LineChartRender: React.FC<{ chartData: ChartData; config: ChartConfig; height: number }> = ({
    chartData, config, height
}) => {
    const dataKeys = chartData.dataKeys || []
    const categoryKey = chartData.categoryKey || "name"

    return (
        <ChartContainer config={config} className="w-full" style={{ height }}>
            <LineChart data={chartData.data} accessibilityLayer>
                {chartData.showGrid !== false && <CartesianGrid strokeDasharray="3 3" />}
                <XAxis dataKey={categoryKey} tickLine={false} tickMargin={10} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                {dataKeys.map((key, index) => (
                    <Line
                        key={key}
                        type={chartData.smoothLine !== false ? "monotone" : "linear"}
                        dataKey={key}
                        stroke={`var(--color-${key})`}
                        strokeWidth={2}
                        dot={{ r: 4 }}
                    >
                        {chartData.showDataLabels && (
                            <LabelList dataKey={key} position="top" className="fill-foreground text-xs" />
                        )}
                    </Line>
                ))}
                {chartData.showLegend !== false && <ChartLegend content={<ChartLegendContent />} />}
            </LineChart>
        </ChartContainer>
    )
}

/**
 * Render an Area Chart
 */
const AreaChartRender: React.FC<{ chartData: ChartData; config: ChartConfig; height: number }> = ({
    chartData, config, height
}) => {
    const dataKeys = chartData.dataKeys || []
    const categoryKey = chartData.categoryKey || "name"

    return (
        <ChartContainer config={config} className="w-full" style={{ height }}>
            <AreaChart data={chartData.data} accessibilityLayer>
                {chartData.showGrid !== false && <CartesianGrid vertical={false} strokeDasharray="3 3" />}
                <XAxis dataKey={categoryKey} tickLine={false} tickMargin={10} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                {dataKeys.map((key, index) => (
                    <Area
                        key={key}
                        type={chartData.smoothLine !== false ? "monotone" : "linear"}
                        dataKey={key}
                        fill={`var(--color-${key})`}
                        fillOpacity={0.4}
                        stroke={`var(--color-${key})`}
                        stackId={chartData.stacked ? "stack" : undefined}
                    />
                ))}
                {chartData.showLegend !== false && <ChartLegend content={<ChartLegendContent />} />}
            </AreaChart>
        </ChartContainer>
    )
}

/**
 * Render a Pie Chart
 */
const PieChartRender: React.FC<{ chartData: ChartData; config: ChartConfig; height: number }> = ({
    chartData, config, height
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
                    {chartData.data.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
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
const RadarChartRender: React.FC<{ chartData: ChartData; config: ChartConfig; height: number }> = ({
    chartData, config, height
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
                        stroke={`var(--color-${key})`}
                        fill={`var(--color-${key})`}
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
const RadialBarChartRender: React.FC<{ chartData: ChartData; config: ChartConfig; height: number }> = ({
    chartData, config, height
}) => {
    const dataKeys = chartData.dataKeys || []
    const dataKey = dataKeys[0] || "value"
    const categoryKey = chartData.categoryKey || "name"

    return (
        <ChartContainer config={config} className="w-full" style={{ height }}>
            <RadialBarChart data={chartData.data} cx="50%" cy="50%" innerRadius="20%" outerRadius="90%">
                <ChartTooltip content={<ChartTooltipContent />} />
                <PolarAngleAxis dataKey={dataKey} domain={[0, 100]} tick={false} />
                <RadialBar dataKey={dataKey} background cornerRadius={10} />
                {chartData.showLegend !== false && <ChartLegend content={<ChartLegendContent nameKey={categoryKey} />} />}
            </RadialBarChart>
        </ChartContainer>
    )
}

/**
 * Render a Scatter Chart
 */
const ScatterChartRender: React.FC<{ chartData: ChartData; config: ChartConfig; height: number }> = ({
    chartData, config, height
}) => {
    const dataKeys = chartData.dataKeys || []

    return (
        <ChartContainer config={config} className="w-full" style={{ height }}>
            <ScatterChart>
                {chartData.showGrid !== false && <CartesianGrid strokeDasharray="3 3" />}
                <XAxis type="number" dataKey={dataKeys[0] || "x"} name={dataKeys[0] || "X"} tickLine={false} axisLine={false} />
                <YAxis type="number" dataKey={dataKeys[1] || "y"} name={dataKeys[1] || "Y"} tickLine={false} axisLine={false} />
                <ZAxis type="number" dataKey={dataKeys[2]} range={[50, 400]} />
                <ChartTooltip cursor={{ strokeDasharray: "3 3" }} content={<ChartTooltipContent />} />
                <Scatter data={chartData.data} fill={`var(--color-${dataKeys[0]})`} />
                {chartData.showLegend !== false && <ChartLegend content={<ChartLegendContent />} />}
            </ScatterChart>
        </ChartContainer>
    )
}

/**
 * ChartView - ProseMirror NodeView for rendering charts
 */
export const ChartView: React.FC<NodeViewProps> = (props) => {
    const rawData = props.node.attrs.data

    const chartData: ChartData | null = useMemo(() => {
        if (!rawData) return null
        try {
            return typeof rawData === "string" ? JSON.parse(rawData) : rawData
        } catch {
            return null
        }
    }, [rawData])

    const chartConfig = useMemo(() => {
        if (!chartData) return {} as ChartConfig
        return buildChartConfig(chartData)
    }, [chartData])

    const height = chartData?.height || 300

    const renderChart = () => {
        if (!chartData || !chartData.data || chartData.data.length === 0) {
            return null
        }

        switch (chartData.type) {
            case "bar":
                return <BarChartRender chartData={chartData} config={chartConfig} height={height} />
            case "line":
                return <LineChartRender chartData={chartData} config={chartConfig} height={height} />
            case "area":
                return <AreaChartRender chartData={chartData} config={chartConfig} height={height} />
            case "pie":
                return <PieChartRender chartData={chartData} config={chartConfig} height={height} />
            case "radar":
                return <RadarChartRender chartData={chartData} config={chartConfig} height={height} />
            case "radialBar":
                return <RadialBarChartRender chartData={chartData} config={chartConfig} height={height} />
            case "scatter":
                return <ScatterChartRender chartData={chartData} config={chartConfig} height={height} />
            default:
                // Default to bar chart for unknown types
                return <BarChartRender chartData={{ ...chartData, type: "bar" }} config={chartConfig} height={height} />
        }
    }

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
                    {chartData && chartData.data && chartData.data.length > 0 ? (
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
