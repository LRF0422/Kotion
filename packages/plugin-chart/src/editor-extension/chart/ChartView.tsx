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
} from "@kn/ui"
import {
    BarChart3,
    Table2,
    Settings2,
    AlertCircle,
} from "@kn/icon"
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
                    {chartData.data.map((row, index) => {
                        const name = String(row?.[categoryKey] ?? "")
                        const customColor = chartData.colors?.[name]
                        const fill = customColor || PIE_COLORS[index % PIE_COLORS.length]
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
 * Chart type options for the config selector
 */
const CHART_TYPE_OPTIONS = [
    { value: "bar", label: "Bar Chart" },
    { value: "line", label: "Line Chart" },
    { value: "area", label: "Area Chart" },
    { value: "pie", label: "Pie Chart" },
    { value: "radar", label: "Radar Chart" },
    { value: "radialBar", label: "Radial Bar Chart" },
    { value: "scatter", label: "Scatter Chart" },
] as const

/** Returns true if the value is a 6-digit hex color string */
const isHexColor = (v?: string): v is string => !!v && /^#[0-9a-fA-F]{6}$/.test(v)

/**
 * ColorList - Per-series color editor.
 * - For non-pie/radialBar charts: edits colors keyed by dataKey
 * - For pie/radialBar charts: edits colors keyed by category value
 */
const ColorList: React.FC<{
    chartData: ChartData
    onUpdate: (updates: Partial<ChartData>) => void
}> = ({ chartData, onUpdate }) => {
    const isCategoryColored = chartData.type === "pie" || chartData.type === "radialBar"
    const categoryKey = chartData.categoryKey || "name"

    const items = useMemo(() => {
        if (isCategoryColored) {
            const seen = new Set<string>()
            const list: string[] = []
            for (const row of chartData.data || []) {
                const v = String(row?.[categoryKey] ?? "")
                if (v && !seen.has(v)) {
                    seen.add(v)
                    list.push(v)
                }
            }
            return list.map((name, i) => ({
                key: name,
                fallback: PIE_COLORS[i % PIE_COLORS.length],
            }))
        }
        return (chartData.dataKeys || []).map((key, i) => ({
            key,
            fallback: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
        }))
    }, [chartData.data, chartData.dataKeys, chartData.type, categoryKey, isCategoryColored])

    const setColor = (key: string, value: string | undefined) => {
        const next = { ...(chartData.colors || {}) }
        if (value === undefined || value === "") {
            delete next[key]
        } else {
            next[key] = value
        }
        onUpdate({ colors: next })
    }

    if (items.length === 0) {
        return <div className="text-xs text-muted-foreground">No series defined</div>
    }

    return (
        <div className="space-y-1.5">
            {items.map((item) => {
                const customColor = chartData.colors?.[item.key]
                const displayColor = customColor || item.fallback
                const colorInputValue = isHexColor(customColor) ? customColor : "#888888"
                return (
                    <div key={item.key} className="flex items-center gap-2 group">
                        <label
                            className="relative h-5 w-5 rounded border border-border/60 shrink-0 cursor-pointer overflow-hidden ring-offset-background hover:ring-2 hover:ring-ring/40 transition-shadow"
                            style={{ backgroundColor: displayColor }}
                            title={displayColor}
                        >
                            <input
                                type="color"
                                value={colorInputValue}
                                onChange={(e) => setColor(item.key, e.target.value)}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                        </label>
                        <span className="text-xs flex-1 min-w-0 truncate text-foreground/90" title={item.key}>{item.key}</span>
                        {customColor && (
                            <button
                                type="button"
                                onClick={() => setColor(item.key, undefined)}
                                className="text-[10px] text-muted-foreground/60 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Reset to default"
                            >
                                Reset
                            </button>
                        )}
                        <Input
                            value={customColor || ""}
                            onChange={(e) => setColor(item.key, e.target.value || undefined)}
                            placeholder="default"
                            className="h-6 text-[11px] w-20 font-mono shrink-0 px-1.5"
                        />
                    </div>
                )
            })}
        </div>
    )
}

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
 * ConfigPanel - Form controls for editing chart configuration
 */
const ConfigPanel: React.FC<{
    chartData: ChartData
    onUpdate: (updates: Partial<ChartData>) => void
}> = ({ chartData, onUpdate }) => {
    const showSmoothLine = chartData.type === "line" || chartData.type === "area"
    const showStacked = chartData.type === "bar" || chartData.type === "area"
    const showHorizontal = chartData.type === "bar"
    const showInnerRadius = chartData.type === "pie"

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
                </div>
            </div>

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

            {/* Colors */}
            <div className="space-y-2">
                <SectionLabel>Colors</SectionLabel>
                <ColorList chartData={chartData} onUpdate={onUpdate} />
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
        if (!activeChartData || !activeChartData.data || activeChartData.data.length === 0) {
            return null
        }

        switch (activeChartData.type) {
            case "bar":
                return <BarChartRender chartData={activeChartData} config={chartConfig} height={height} />
            case "line":
                return <LineChartRender chartData={activeChartData} config={chartConfig} height={height} />
            case "area":
                return <AreaChartRender chartData={activeChartData} config={chartConfig} height={height} />
            case "pie":
                return <PieChartRender chartData={activeChartData} config={chartConfig} height={height} />
            case "radar":
                return <RadarChartRender chartData={activeChartData} config={chartConfig} height={height} />
            case "radialBar":
                return <RadialBarChartRender chartData={activeChartData} config={chartConfig} height={height} />
            case "scatter":
                return <ScatterChartRender chartData={activeChartData} config={chartConfig} height={height} />
            default:
                // Default to bar chart for unknown types
                return <BarChartRender chartData={{ ...activeChartData, type: "bar" }} config={chartConfig} height={height} />
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
                    <div className="flex gap-0">
                        {/* Left Panel: Data + Config */}
                        <div className="w-1/2 border-r min-w-0">
                            <Tabs defaultValue="data" className="h-full flex flex-col">
                                <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-9 px-1">
                                    <TabsTrigger value="data" className="text-xs gap-1 data-[state=active]:shadow-none">
                                        <Table2 className="h-3.5 w-3.5" />
                                        Data
                                    </TabsTrigger>
                                    <TabsTrigger value="config" className="text-xs gap-1 data-[state=active]:shadow-none">
                                        <Settings2 className="h-3.5 w-3.5" />
                                        Config
                                    </TabsTrigger>
                                </TabsList>

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
                                            <ConfigPanel chartData={activeChartData} onUpdate={handleConfigUpdate} />
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
                        <div className="w-1/2 p-2 flex flex-col items-center justify-center">
                            {(activeChartData?.title || activeChartData?.description) && (
                                <div className="w-full text-center mb-1">
                                    {activeChartData.title && <div className="text-sm font-medium">{activeChartData.title}</div>}
                                    {activeChartData.description && <div className="text-xs text-muted-foreground">{activeChartData.description}</div>}
                                </div>
                            )}
                            {activeChartData && activeChartData.data && activeChartData.data.length > 0 ? (
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
