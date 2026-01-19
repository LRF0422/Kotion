import React, { useMemo, useState, useCallback } from "react";
import {
    Card,
    CardContent,
    CardHeader,
    CardDescription,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Button,
    Label,
    Input,
    Switch,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    ChartLegend,
    ChartLegendContent,
    Bar,
    BarChart,
    XAxis,
    Pie,
    PieChart,
    Area,
    AreaChart,
    CartesianGrid,
    cn,
    LineChart, Line, YAxis, Cell,
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    ScatterChart, Scatter, ZAxis,
    RadialBarChart, RadialBar,
    LabelList,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Slider,
    Badge,
    ScrollArea,
    Separator,
} from "@kn/ui";
import {
    Plus, Trash2, Settings, BarChart3,
    PieChart as PieChartIcon, LineChart as LineChartIcon, AreaChart as AreaChartIcon,
    CircleDot, Target, Layers, Maximize2, X,
    Activity,
    Circle,
    ChevronDown,
    ChevronUp
} from "@kn/icon";
import { useTranslation } from "@kn/common";
import { FieldConfig, RecordData, ViewConfig, ChartType, FieldType, YAxisConfig } from "../../types";

interface ChartViewProps {
    view: ViewConfig;
    fields: FieldConfig[];
    data: RecordData[];
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
    editable: boolean;
}

// 色彩方案
const COLOR_SCHEMES = {
    default: [
        "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
        "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#a855f7"
    ],
    warm: [
        "#ef4444", "#f97316", "#f59e0b", "#eab308", "#fbbf24",
        "#d97706", "#ea580c", "#dc2626", "#f43f5e", "#e11d48"
    ],
    cool: [
        "#3b82f6", "#06b6d4", "#14b8a6", "#22c55e", "#10b981",
        "#0ea5e9", "#6366f1", "#8b5cf6", "#a855f7", "#0891b2"
    ],
    monochrome: [
        "#1e293b", "#334155", "#475569", "#64748b", "#94a3b8",
        "#cbd5e1", "#e2e8f0", "#f1f5f9", "#0f172a", "#020617"
    ],
};

// 默认颜色配置
const DEFAULT_COLORS = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
];

const PRESET_COLORS = COLOR_SCHEMES.default;

export const ChartView: React.FC<ChartViewProps> = (props) => {
    const { view, fields, data, onUpdateView, editable } = props;
    const { t } = useTranslation();
    const [configOpen, setConfigOpen] = useState(false);
    const [activeConfigTab, setActiveConfigTab] = useState('basic');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [expandedYAxis, setExpandedYAxis] = useState<Record<string, boolean>>({});

    const chartConfig = view.chartConfig || {
        chartType: ChartType.BAR,
        xAxisField: '',
        yAxisFields: [],
        title: '',
        description: '',
        showLegend: true,
        showGrid: true,
        aggregation: 'sum',
        // Advanced defaults
        chartHeight: 300,
        isHorizontal: false,
        showDataLabels: false,
        showYAxis: true,
        enableAnimation: true,
        sortOrder: 'none' as const,
        topN: 0,
        innerRadius: 60,
        outerRadius: 100,
        colorScheme: 'default' as const,
        showTrendLine: false,
        smoothLine: true,
        // Y-axis config defaults
        yAxisConfig: {
            label: '',
            min: undefined,
            max: undefined,
            tickCount: 5,
            showAxisLine: true,
            tickFormatter: 'number' as const,
        },
    };

    // 获取当前配色方案的颜色
    const currentColors = useMemo(() => {
        return COLOR_SCHEMES[chartConfig.colorScheme || 'default'] || COLOR_SCHEMES.default;
    }, [chartConfig.colorScheme]);

    // 获取数值类型的字段
    const numericFields = useMemo(() => {
        return fields.filter(f =>
            f.type === FieldType.NUMBER ||
            f.type === FieldType.PROGRESS ||
            f.type === FieldType.RATING
        );
    }, [fields]);

    // 获取可作为X轴的字段（文本、选择、日期）
    const categoryFields = useMemo(() => {
        return fields.filter(f =>
            f.type === FieldType.TEXT ||
            f.type === FieldType.SELECT ||
            f.type === FieldType.DATE ||
            f.type === FieldType.ID ||
            f.type === FieldType.MULTI_SELECT
        );
    }, [fields]);

    // 计算数据统计
    const dataStats = useMemo(() => {
        if (!chartConfig.xAxisField || data.length === 0) {
            return { total: 0, categories: 0, min: 0, max: 0, avg: 0 };
        }

        const categories = new Set(data.map(r => r[chartConfig.xAxisField])).size;

        if (chartConfig.yAxisFields.length > 0) {
            const firstYField = chartConfig.yAxisFields[0].fieldId;
            const values = data.map(r => Number(r[firstYField]) || 0);
            const sum = values.reduce((a, b) => a + b, 0);
            return {
                total: data.length,
                categories,
                min: Math.min(...values),
                max: Math.max(...values),
                avg: Math.round((sum / values.length) * 100) / 100,
            };
        }

        return { total: data.length, categories, min: 0, max: 0, avg: 0 };
    }, [data, chartConfig]);

    // 处理图表数据
    const chartData = useMemo(() => {
        if (!chartConfig.xAxisField || chartConfig.yAxisFields.length === 0) {
            return [];
        }

        const xField = fields.find(f => f.id === chartConfig.xAxisField);
        if (!xField) return [];

        let processedData: Record<string, any>[] = [];

        // 分组聚合数据
        if (chartConfig.aggregation && chartConfig.aggregation !== 'count') {
            const groupedData: Record<string, Record<string, number[]>> = {};

            data.forEach(record => {
                const xValue = String(record[chartConfig.xAxisField] || 'N/A');
                if (!groupedData[xValue]) {
                    groupedData[xValue] = {};
                }

                chartConfig.yAxisFields.forEach(yConfig => {
                    if (!groupedData[xValue][yConfig.fieldId]) {
                        groupedData[xValue][yConfig.fieldId] = [];
                    }
                    const value = Number(record[yConfig.fieldId]) || 0;
                    groupedData[xValue][yConfig.fieldId].push(value);
                });
            });

            processedData = Object.entries(groupedData).map(([xValue, yValues]) => {
                const result: Record<string, any> = { [chartConfig.xAxisField]: xValue };

                chartConfig.yAxisFields.forEach(yConfig => {
                    const values = yValues[yConfig.fieldId] || [];
                    let aggregatedValue = 0;

                    switch (chartConfig.aggregation) {
                        case 'sum':
                            aggregatedValue = values.reduce((a, b) => a + b, 0);
                            break;
                        case 'avg':
                            aggregatedValue = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
                            break;
                        case 'min':
                            aggregatedValue = values.length > 0 ? Math.min(...values) : 0;
                            break;
                        case 'max':
                            aggregatedValue = values.length > 0 ? Math.max(...values) : 0;
                            break;
                    }

                    result[yConfig.fieldId] = Math.round(aggregatedValue * 100) / 100;
                });

                return result;
            });
        } else if (chartConfig.aggregation === 'count') {
            // 计数聚合
            const countMap: Record<string, number> = {};
            data.forEach(record => {
                const xValue = String(record[chartConfig.xAxisField] || 'N/A');
                countMap[xValue] = (countMap[xValue] || 0) + 1;
            });

            processedData = Object.entries(countMap).map(([xValue, count]) => ({
                [chartConfig.xAxisField]: xValue,
                count,
            }));
        } else {
            // 直接映射数据
            processedData = data.map(record => {
                const result: Record<string, any> = {
                    [chartConfig.xAxisField]: record[chartConfig.xAxisField] || 'N/A',
                };
                chartConfig.yAxisFields.forEach(yConfig => {
                    result[yConfig.fieldId] = Number(record[yConfig.fieldId]) || 0;
                });
                return result;
            });
        }

        // 排序数据
        if (chartConfig.sortOrder && chartConfig.sortOrder !== 'none') {
            const sortField = chartConfig.aggregation === 'count' ? 'count' : chartConfig.yAxisFields[0]?.fieldId;
            if (sortField) {
                processedData.sort((a, b) => {
                    const aVal = Number(a[sortField]) || 0;
                    const bVal = Number(b[sortField]) || 0;
                    return chartConfig.sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
                });
            }
        }

        // 应用 Top N 筛选
        if (chartConfig.topN && chartConfig.topN > 0 && processedData.length > chartConfig.topN) {
            processedData = processedData.slice(0, chartConfig.topN);
        }

        return processedData;
    }, [data, chartConfig, fields]);

    // 饼图数据（需要特殊处理）
    const pieChartData = useMemo(() => {
        if ((chartConfig.chartType !== ChartType.PIE && chartConfig.chartType !== ChartType.DONUT) || !chartConfig.xAxisField) {
            return [];
        }

        const yFieldId = chartConfig.yAxisFields[0]?.fieldId;
        if (!yFieldId && chartConfig.aggregation !== 'count') {
            return [];
        }

        const groupedData: Record<string, number> = {};

        data.forEach(record => {
            const xValue = String(record[chartConfig.xAxisField] || 'N/A');
            if (chartConfig.aggregation === 'count') {
                groupedData[xValue] = (groupedData[xValue] || 0) + 1;
            } else {
                const value = Number(record[yFieldId]) || 0;
                groupedData[xValue] = (groupedData[xValue] || 0) + value;
            }
        });

        let result = Object.entries(groupedData).map(([name, value], index) => ({
            name,
            value,
            fill: currentColors[index % currentColors.length],
        }));

        // 排序
        if (chartConfig.sortOrder && chartConfig.sortOrder !== 'none') {
            result.sort((a, b) => chartConfig.sortOrder === 'asc' ? a.value - b.value : b.value - a.value);
        }

        // Top N
        if (chartConfig.topN && chartConfig.topN > 0 && result.length > chartConfig.topN) {
            const others = result.slice(chartConfig.topN).reduce((sum, item) => sum + item.value, 0);
            result = result.slice(0, chartConfig.topN);
            if (others > 0) {
                result.push({ name: t('bitable.chartView.others'), value: others, fill: '#9ca3af' });
            }
        }

        return result;
    }, [data, chartConfig, currentColors, t]);

    // 雷达图数据
    const radarChartData = useMemo(() => {
        if (chartConfig.chartType !== ChartType.RADAR || !chartConfig.xAxisField) {
            return [];
        }

        return chartData.map(item => {
            const result: Record<string, any> = {
                subject: item[chartConfig.xAxisField],
            };
            chartConfig.yAxisFields.forEach(yConfig => {
                const field = fields.find(f => f.id === yConfig.fieldId);
                result[field?.title || yConfig.fieldId] = item[yConfig.fieldId];
            });
            return result;
        });
    }, [chartData, chartConfig, fields]);

    // 散点图数据
    const scatterChartData = useMemo(() => {
        if (chartConfig.chartType !== ChartType.SCATTER || chartConfig.yAxisFields.length < 2) {
            return [];
        }

        return data.map((record, index) => ({
            x: Number(record[chartConfig.yAxisFields[0]?.fieldId]) || 0,
            y: Number(record[chartConfig.yAxisFields[1]?.fieldId]) || 0,
            z: chartConfig.yAxisFields[2] ? Number(record[chartConfig.yAxisFields[2].fieldId]) || 10 : 10,
            name: record[chartConfig.xAxisField] || `Point ${index + 1}`,
        }));
    }, [data, chartConfig]);

    // 径向条形图数据
    const radialBarData = useMemo(() => {
        if (chartConfig.chartType !== ChartType.RADIAL_BAR || !chartConfig.xAxisField) {
            return [];
        }

        const yFieldId = chartConfig.yAxisFields[0]?.fieldId;
        if (!yFieldId && chartConfig.aggregation !== 'count') {
            return [];
        }

        return chartData.slice(0, 8).map((item, index) => ({
            name: item[chartConfig.xAxisField],
            value: chartConfig.aggregation === 'count' ? item.count : item[yFieldId],
            fill: currentColors[index % currentColors.length],
        }));
    }, [chartData, chartConfig, currentColors]);

    // 生成图表配置
    const rechartsConfig = useMemo(() => {
        const config: Record<string, { label: string; color: string }> = {};

        if (chartConfig.aggregation === 'count') {
            config['count'] = {
                label: t('bitable.chartView.count'),
                color: currentColors[0],
            };
        } else {
            chartConfig.yAxisFields.forEach((yConfig, index) => {
                const field = fields.find(f => f.id === yConfig.fieldId);
                config[yConfig.fieldId] = {
                    label: yConfig.label || field?.title || yConfig.fieldId,
                    color: yConfig.color || currentColors[index % currentColors.length],
                };
            });
        }

        // 饼图/甘圈图/径向条形图配置
        if (chartConfig.chartType === ChartType.PIE ||
            chartConfig.chartType === ChartType.DONUT ||
            chartConfig.chartType === ChartType.RADIAL_BAR) {
            pieChartData.forEach((item, index) => {
                config[item.name] = {
                    label: item.name,
                    color: currentColors[index % currentColors.length],
                };
            });
        }

        // 雷达图配置
        if (chartConfig.chartType === ChartType.RADAR) {
            chartConfig.yAxisFields.forEach((yConfig, index) => {
                const field = fields.find(f => f.id === yConfig.fieldId);
                const label = field?.title || yConfig.fieldId;
                config[label] = {
                    label,
                    color: yConfig.color || currentColors[index % currentColors.length],
                };
            });
        }

        return config;
    }, [chartConfig, fields, pieChartData, currentColors, t]);

    // 更新图表配置
    const updateChartConfig = (updates: Partial<typeof chartConfig>) => {
        onUpdateView(view.id, {
            chartConfig: { ...chartConfig, ...updates },
        });
    };

    // 添加Y轴字段
    const addYAxisField = () => {
        const availableFields = numericFields.filter(
            f => !chartConfig.yAxisFields.some(y => y.fieldId === f.id)
        );
        if (availableFields.length > 0) {
            updateChartConfig({
                yAxisFields: [
                    ...chartConfig.yAxisFields,
                    {
                        fieldId: availableFields[0].id,
                        color: currentColors[chartConfig.yAxisFields.length % currentColors.length],
                    },
                ],
            });
        }
    };

    // 移除Y轴字段
    const removeYAxisField = (fieldId: string) => {
        updateChartConfig({
            yAxisFields: chartConfig.yAxisFields.filter(y => y.fieldId !== fieldId),
        });
    };

    // 更新Y轴字段
    const updateYAxisField = (fieldId: string, updates: Partial<YAxisConfig>) => {
        updateChartConfig({
            yAxisFields: chartConfig.yAxisFields.map(y =>
                y.fieldId === fieldId ? { ...y, ...updates } : y
            ),
        });
    };

    // 获取图表类型图标
    const getChartTypeIcon = (type: ChartType) => {
        switch (type) {
            case ChartType.BAR:
            case ChartType.STACKED_BAR:
                return <BarChart3 className="h-4 w-4" />;
            case ChartType.LINE:
                return <LineChartIcon className="h-4 w-4" />;
            case ChartType.PIE:
            case ChartType.DONUT:
                return <PieChartIcon className="h-4 w-4" />;
            case ChartType.AREA:
            case ChartType.STACKED_AREA:
                return <AreaChartIcon className="h-4 w-4" />;
            case ChartType.RADAR:
                return <Target className="h-4 w-4" />;
            case ChartType.SCATTER:
                return <CircleDot className="h-4 w-4" />;
            case ChartType.RADIAL_BAR:
                return <Activity className="h-4 w-4" />;
            default:
                return <BarChart3 className="h-4 w-4" />;
        }
    };

    // 导出图表为图片
    const exportChart = useCallback(() => {
        // TODO: Implement chart export using html2canvas
        console.log('Export chart');
    }, []);

    // Y轴刻度格式化函数
    const formatYAxisTick = useCallback((value: number) => {
        const formatter = chartConfig.yAxisConfig?.tickFormatter || 'number';
        switch (formatter) {
            case 'percent':
                return `${value}%`;
            case 'currency':
                return `¥${value.toLocaleString()}`;
            case 'compact':
                if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
                return value.toString();
            case 'number':
            default:
                return value.toLocaleString();
        }
    }, [chartConfig.yAxisConfig?.tickFormatter]);

    // 获取Y轴配置属性
    const yAxisProps = useMemo(() => {
        const config = chartConfig.yAxisConfig || {};
        return {
            tickLine: false,
            axisLine: config.showAxisLine !== false,
            tickFormatter: formatYAxisTick,
            tickCount: config.tickCount || 5,
            domain: [
                config.min !== undefined ? config.min : 'auto',
                config.max !== undefined ? config.max : 'auto'
            ] as [number | 'auto', number | 'auto'],
            label: config.label ? {
                value: config.label,
                angle: -90,
                position: 'insideLeft',
                style: { textAnchor: 'middle' }
            } : undefined,
        };
    }, [chartConfig.yAxisConfig, formatYAxisTick]);

    // 渲染图表
    const renderChart = () => {
        if (!chartConfig.xAxisField) {
            return (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
                    <BarChart3 className="h-12 w-12 opacity-20" />
                    <span>{t('bitable.chartView.selectXAxis')}</span>
                </div>
            );
        }

        const isPieType = [ChartType.PIE, ChartType.DONUT, ChartType.RADIAL_BAR].includes(chartConfig.chartType);

        if (!isPieType &&
            chartConfig.chartType !== ChartType.RADAR &&
            chartConfig.yAxisFields.length === 0 &&
            chartConfig.aggregation !== 'count') {
            return (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
                    <BarChart3 className="h-12 w-12 opacity-20" />
                    <span>{t('bitable.chartView.selectYAxis')}</span>
                </div>
            );
        }

        const chartHeight = chartConfig.chartHeight || 300;
        const dataKeys = chartConfig.aggregation === 'count'
            ? ['count']
            : chartConfig.yAxisFields.map(y => y.fieldId);

        switch (chartConfig.chartType) {
            case ChartType.BAR:
            case ChartType.STACKED_BAR:
                const isStacked = chartConfig.chartType === ChartType.STACKED_BAR;
                return (
                    <ChartContainer config={rechartsConfig} className={`h-[${chartHeight}px] w-full`} style={{ height: chartHeight }}>
                        <BarChart
                            data={chartData}
                            accessibilityLayer
                            layout={chartConfig.isHorizontal ? 'vertical' : 'horizontal'}
                        >
                            {chartConfig.showGrid && <CartesianGrid vertical={false} strokeDasharray="3 3" />}
                            {chartConfig.isHorizontal ? (
                                <>
                                    <YAxis
                                        dataKey={chartConfig.xAxisField}
                                        type="category"
                                        tickLine={false}
                                        axisLine={false}
                                        width={100}
                                    />
                                    <XAxis
                                        type="number"
                                        hide={!chartConfig.showYAxis}
                                        tickFormatter={formatYAxisTick}
                                        domain={yAxisProps.domain}
                                        tickCount={yAxisProps.tickCount}
                                    />
                                </>
                            ) : (
                                <>
                                    <XAxis
                                        dataKey={chartConfig.xAxisField}
                                        tickLine={false}
                                        tickMargin={10}
                                        axisLine={false}
                                    />
                                    {chartConfig.showYAxis && (
                                        <YAxis
                                            {...yAxisProps}
                                        />
                                    )}
                                </>
                            )}
                            <ChartTooltip
                                cursor={false}
                                content={<ChartTooltipContent indicator="dashed" />}
                            />
                            {dataKeys.map((key, index) => (
                                <Bar
                                    key={key}
                                    dataKey={key}
                                    fill={chartConfig.yAxisFields[index]?.color || currentColors[index % currentColors.length]}
                                    radius={4}
                                    stackId={isStacked ? 'stack' : undefined}
                                    isAnimationActive={chartConfig.enableAnimation !== false}
                                >
                                    {chartConfig.showDataLabels && (
                                        <LabelList dataKey={key} position="top" className="fill-foreground text-xs" />
                                    )}
                                </Bar>
                            ))}
                            {chartConfig.showLegend && (
                                <ChartLegend content={<ChartLegendContent />} />
                            )}
                        </BarChart>
                    </ChartContainer>
                );

            case ChartType.LINE:
                return (
                    <ChartContainer config={rechartsConfig} className={`h-[${chartHeight}px] w-full`} style={{ height: chartHeight }}>
                        <LineChart data={chartData} accessibilityLayer>
                            {chartConfig.showGrid && <CartesianGrid strokeDasharray="3 3" />}
                            <XAxis
                                dataKey={chartConfig.xAxisField}
                                tickLine={false}
                                tickMargin={10}
                                axisLine={false}
                            />
                            {chartConfig.showYAxis && <YAxis {...yAxisProps} />}
                            <ChartTooltip
                                cursor={false}
                                content={<ChartTooltipContent />}
                            />
                            {dataKeys.map((key, index) => (
                                <Line
                                    key={key}
                                    type={chartConfig.smoothLine !== false ? "monotone" : "linear"}
                                    dataKey={key}
                                    stroke={chartConfig.yAxisFields[index]?.color || currentColors[index % currentColors.length]}
                                    strokeWidth={2}
                                    dot={{ r: 4 }}
                                    isAnimationActive={chartConfig.enableAnimation !== false}
                                >
                                    {chartConfig.showDataLabels && (
                                        <LabelList dataKey={key} position="top" className="fill-foreground text-xs" />
                                    )}
                                </Line>
                            ))}
                            {chartConfig.showLegend && (
                                <ChartLegend content={<ChartLegendContent />} />
                            )}
                        </LineChart>
                    </ChartContainer>
                );

            case ChartType.PIE:
                return (
                    <ChartContainer config={rechartsConfig} className={`h-[${chartHeight}px] w-full`} style={{ height: chartHeight }}>
                        <PieChart>
                            <ChartTooltip
                                cursor={false}
                                content={<ChartTooltipContent hideLabel />}
                            />
                            <Pie
                                data={pieChartData}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={0}
                                outerRadius={chartConfig.outerRadius || 100}
                                strokeWidth={2}
                                isAnimationActive={chartConfig.enableAnimation !== false}
                            >
                                {pieChartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                                {chartConfig.showDataLabels && (
                                    <LabelList dataKey="name" className="fill-foreground text-xs" />
                                )}
                            </Pie>
                            {chartConfig.showLegend && (
                                <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                            )}
                        </PieChart>
                    </ChartContainer>
                );

            case ChartType.DONUT:
                return (
                    <ChartContainer config={rechartsConfig} className={`h-[${chartHeight}px] w-full`} style={{ height: chartHeight }}>
                        <PieChart>
                            <ChartTooltip
                                cursor={false}
                                content={<ChartTooltipContent hideLabel />}
                            />
                            <Pie
                                data={pieChartData}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={chartConfig.innerRadius || 60}
                                outerRadius={chartConfig.outerRadius || 100}
                                strokeWidth={2}
                                isAnimationActive={chartConfig.enableAnimation !== false}
                            >
                                {pieChartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                            </Pie>
                            {chartConfig.showLegend && (
                                <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                            )}
                        </PieChart>
                    </ChartContainer>
                );

            case ChartType.AREA:
            case ChartType.STACKED_AREA:
                const isStackedArea = chartConfig.chartType === ChartType.STACKED_AREA;
                return (
                    <ChartContainer config={rechartsConfig} className={`h-[${chartHeight}px] w-full`} style={{ height: chartHeight }}>
                        <AreaChart data={chartData} accessibilityLayer>
                            {chartConfig.showGrid && <CartesianGrid vertical={false} strokeDasharray="3 3" />}
                            <XAxis
                                dataKey={chartConfig.xAxisField}
                                tickLine={false}
                                tickMargin={10}
                                axisLine={false}
                            />
                            {chartConfig.showYAxis && <YAxis {...yAxisProps} />}
                            <ChartTooltip
                                cursor={false}
                                content={<ChartTooltipContent indicator="dot" />}
                            />
                            {dataKeys.map((key, index) => (
                                <Area
                                    key={key}
                                    type={chartConfig.smoothLine !== false ? "monotone" : "linear"}
                                    dataKey={key}
                                    fill={chartConfig.yAxisFields[index]?.color || currentColors[index % currentColors.length]}
                                    fillOpacity={0.4}
                                    stroke={chartConfig.yAxisFields[index]?.color || currentColors[index % currentColors.length]}
                                    stackId={isStackedArea ? 'stack' : undefined}
                                    isAnimationActive={chartConfig.enableAnimation !== false}
                                />
                            ))}
                            {chartConfig.showLegend && (
                                <ChartLegend content={<ChartLegendContent />} />
                            )}
                        </AreaChart>
                    </ChartContainer>
                );

            case ChartType.RADAR:
                return (
                    <ChartContainer config={rechartsConfig} className={`h-[${chartHeight}px] w-full mx-auto aspect-square`} style={{ height: chartHeight }}>
                        <RadarChart data={radarChartData}>
                            <ChartTooltip
                                cursor={false}
                                content={<ChartTooltipContent hideLabel />}
                            />
                            <PolarGrid />
                            <PolarAngleAxis dataKey="subject" />
                            <PolarRadiusAxis />
                            {chartConfig.yAxisFields.map((yConfig, index) => {
                                const field = fields.find(f => f.id === yConfig.fieldId);
                                return (
                                    <Radar
                                        key={yConfig.fieldId}
                                        name={field?.title || yConfig.fieldId}
                                        dataKey={field?.title || yConfig.fieldId}
                                        stroke={yConfig.color || currentColors[index % currentColors.length]}
                                        fill={yConfig.color || currentColors[index % currentColors.length]}
                                        fillOpacity={0.3}
                                        isAnimationActive={chartConfig.enableAnimation !== false}
                                    />
                                );
                            })}
                            {chartConfig.showLegend && (
                                <ChartLegend content={<ChartLegendContent />} />
                            )}
                        </RadarChart>
                    </ChartContainer>
                );

            case ChartType.SCATTER:
                if (chartConfig.yAxisFields.length < 2) {
                    return (
                        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
                            <CircleDot className="h-12 w-12 opacity-20" />
                            <span>{t('bitable.chartView.scatterNeedsTwoFields')}</span>
                        </div>
                    );
                }
                const xField = fields.find(f => f.id === chartConfig.yAxisFields[0]?.fieldId);
                const yField = fields.find(f => f.id === chartConfig.yAxisFields[1]?.fieldId);
                return (
                    <ChartContainer config={rechartsConfig} className={`h-[${chartHeight}px] w-full`} style={{ height: chartHeight }}>
                        <ScatterChart>
                            {chartConfig.showGrid && <CartesianGrid strokeDasharray="3 3" />}
                            <XAxis
                                type="number"
                                dataKey="x"
                                name={xField?.title || 'X'}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                type="number"
                                dataKey="y"
                                name={yField?.title || 'Y'}
                                tickLine={false}
                                axisLine={false}
                            />
                            <ZAxis type="number" dataKey="z" range={[50, 400]} />
                            <ChartTooltip
                                cursor={{ strokeDasharray: '3 3' }}
                                content={<ChartTooltipContent />}
                            />
                            <Scatter
                                name="Data"
                                data={scatterChartData}
                                fill={currentColors[0]}
                                isAnimationActive={chartConfig.enableAnimation !== false}
                            />
                            {chartConfig.showLegend && (
                                <ChartLegend content={<ChartLegendContent />} />
                            )}
                        </ScatterChart>
                    </ChartContainer>
                );

            case ChartType.RADIAL_BAR:
                return (
                    <ChartContainer config={rechartsConfig} className={`h-[${chartHeight}px] w-full mx-auto`} style={{ height: chartHeight }}>
                        <RadialBarChart
                            data={radialBarData}
                            innerRadius={chartConfig.innerRadius || 30}
                            outerRadius={chartConfig.outerRadius || 100}
                            startAngle={180}
                            endAngle={0}
                        >
                            <ChartTooltip
                                cursor={false}
                                content={<ChartTooltipContent hideLabel />}
                            />
                            <RadialBar
                                dataKey="value"
                                background
                                isAnimationActive={chartConfig.enableAnimation !== false}
                            >
                                {radialBarData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                            </RadialBar>
                            {chartConfig.showLegend && (
                                <ChartLegend
                                    content={<ChartLegendContent nameKey="name" />}
                                    layout="vertical"
                                    verticalAlign="middle"
                                    align="right"
                                />
                            )}
                        </RadialBarChart>
                    </ChartContainer>
                );

            default:
                return null;
        }
    };

    return (
        <div className={cn("relative", isFullscreen && "fixed inset-0 z-50 bg-background p-4")}>
            <Card className={cn(isFullscreen && "h-full flex flex-col")}>
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <div className="flex-1">
                            {chartConfig.title ? (
                                <h3 className="text-lg font-semibold">{chartConfig.title}</h3>
                            ) : (
                                <div className="flex items-center gap-2">
                                    {getChartTypeIcon(chartConfig.chartType)}
                                    <span className="text-sm text-muted-foreground">
                                        {t(`bitable.chartView.${chartConfig.chartType}Chart`)}
                                    </span>
                                </div>
                            )}
                            {chartConfig.description && (
                                <CardDescription>{chartConfig.description}</CardDescription>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            {/* 数据统计徽章 */}
                            {dataStats.total > 0 && (
                                <div className="hidden sm:flex items-center gap-2 mr-2">
                                    <Badge variant="secondary" className="text-xs">
                                        {dataStats.total} {t('bitable.chartView.records')}
                                    </Badge>
                                    <Badge variant="secondary" className="text-xs">
                                        {dataStats.categories} {t('bitable.chartView.categories')}
                                    </Badge>
                                </div>
                            )}
                            {/* 全屏按钮 */}
                            <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setIsFullscreen(!isFullscreen)}
                            >
                                {isFullscreen ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                            </Button>
                            {editable && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setConfigOpen(!configOpen)}
                                >
                                    <Settings className="h-4 w-4 mr-1" />
                                    {t('bitable.chartView.configure')}
                                </Button>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className={cn(isFullscreen && "flex-1")}>
                    {renderChart()}
                </CardContent>
            </Card>

            {/* 配置面板 */}
            {configOpen && editable && (
                <div className="absolute top-0 right-0 w-96 bg-background border rounded-lg shadow-lg z-50 max-h-[600px] flex flex-col">
                    <div className="flex items-center justify-between p-4 border-b">
                        <h4 className="font-semibold">{t('bitable.chartView.chartConfig')}</h4>
                        <Button size="icon" variant="ghost" onClick={() => setConfigOpen(false)}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    <Tabs value={activeConfigTab} onValueChange={setActiveConfigTab} className="flex-1 flex flex-col">
                        <TabsList className="grid w-full grid-cols-3 px-4 pt-2">
                            <TabsTrigger value="basic">{t('bitable.chartView.basic')}</TabsTrigger>
                            <TabsTrigger value="data">{t('bitable.chartView.data')}</TabsTrigger>
                            <TabsTrigger value="style">{t('bitable.chartView.style')}</TabsTrigger>
                        </TabsList>

                        <ScrollArea className="flex-1 px-4 py-2">
                            {/* 基础配置选项卡 */}
                            <TabsContent value="basic" className="mt-0 space-y-4 p-1">
                                {/* 图表类型 */}
                                <div className="space-y-2">
                                    <Label>{t('bitable.chartView.chartType')}</Label>
                                    <Select
                                        value={chartConfig.chartType}
                                        onValueChange={(value: ChartType) => updateChartConfig({ chartType: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={ChartType.BAR}>
                                                <div className="flex items-center gap-2">
                                                    <BarChart3 className="h-4 w-4" />
                                                    {t('bitable.chartView.barChart')}
                                                </div>
                                            </SelectItem>
                                            <SelectItem value={ChartType.STACKED_BAR}>
                                                <div className="flex items-center gap-2">
                                                    <Layers className="h-4 w-4" />
                                                    {t('bitable.chartView.stackedBarChart')}
                                                </div>
                                            </SelectItem>
                                            <SelectItem value={ChartType.LINE}>
                                                <div className="flex items-center gap-2">
                                                    <LineChartIcon className="h-4 w-4" />
                                                    {t('bitable.chartView.lineChart')}
                                                </div>
                                            </SelectItem>
                                            <SelectItem value={ChartType.AREA}>
                                                <div className="flex items-center gap-2">
                                                    <AreaChartIcon className="h-4 w-4" />
                                                    {t('bitable.chartView.areaChart')}
                                                </div>
                                            </SelectItem>
                                            <SelectItem value={ChartType.STACKED_AREA}>
                                                <div className="flex items-center gap-2">
                                                    <Layers className="h-4 w-4" />
                                                    {t('bitable.chartView.stackedAreaChart')}
                                                </div>
                                            </SelectItem>
                                            <SelectItem value={ChartType.PIE}>
                                                <div className="flex items-center gap-2">
                                                    <PieChartIcon className="h-4 w-4" />
                                                    {t('bitable.chartView.pieChart')}
                                                </div>
                                            </SelectItem>
                                            <SelectItem value={ChartType.DONUT}>
                                                <div className="flex items-center gap-2">
                                                    <Circle className="h-4 w-4" />
                                                    {t('bitable.chartView.donutChart')}
                                                </div>
                                            </SelectItem>
                                            <SelectItem value={ChartType.RADAR}>
                                                <div className="flex items-center gap-2">
                                                    <Target className="h-4 w-4" />
                                                    {t('bitable.chartView.radarChart')}
                                                </div>
                                            </SelectItem>
                                            <SelectItem value={ChartType.SCATTER}>
                                                <div className="flex items-center gap-2">
                                                    <CircleDot className="h-4 w-4" />
                                                    {t('bitable.chartView.scatterChart')}
                                                </div>
                                            </SelectItem>
                                            <SelectItem value={ChartType.RADIAL_BAR}>
                                                <div className="flex items-center gap-2">
                                                    <Activity className="h-4 w-4" />
                                                    {t('bitable.chartView.radialBarChart')}
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* 标题 */}
                                <div className="space-y-2">
                                    <Label>{t('bitable.chartView.title')}</Label>
                                    <Input
                                        value={chartConfig.title || ''}
                                        onChange={(e) => updateChartConfig({ title: e.target.value })}
                                        placeholder={t('bitable.chartView.titlePlaceholder')}
                                    />
                                </div>

                                {/* 描述 */}
                                <div className="space-y-2">
                                    <Label>{t('bitable.chartView.description')}</Label>
                                    <Input
                                        value={chartConfig.description || ''}
                                        onChange={(e) => updateChartConfig({ description: e.target.value })}
                                        placeholder={t('bitable.chartView.descriptionPlaceholder')}
                                    />
                                </div>
                            </TabsContent>

                            {/* 数据配置选项卡 */}
                            <TabsContent value="data" className="mt-0 space-y-4">
                                <ScrollArea className="h-[400px] pr-3">
                                    {/* X轴字段 */}
                                    <div className="space-y-2">
                                        <Label>{t('bitable.chartView.xAxis')}</Label>
                                        <Select
                                            value={chartConfig.xAxisField}
                                            onValueChange={(value) => updateChartConfig({ xAxisField: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder={t('bitable.chartView.selectField')} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {categoryFields.map((field) => (
                                                    <SelectItem key={field.id} value={field.id}>
                                                        {field.title}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* 聚合方式 */}
                                    <div className="space-y-2">
                                        <Label>{t('bitable.chartView.aggregation')}</Label>
                                        <Select
                                            value={chartConfig.aggregation || 'sum'}
                                            onValueChange={(value: any) => updateChartConfig({ aggregation: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="sum">{t('bitable.chartView.sum')}</SelectItem>
                                                <SelectItem value="count">{t('bitable.chartView.count')}</SelectItem>
                                                <SelectItem value="avg">{t('bitable.chartView.average')}</SelectItem>
                                                <SelectItem value="min">{t('bitable.chartView.min')}</SelectItem>
                                                <SelectItem value="max">{t('bitable.chartView.max')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Y轴字段配置 */}
                                    {chartConfig.aggregation !== 'count' && (
                                        <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-sm font-medium">{t('bitable.chartView.yAxisConfig')}</Label>
                                                <Button size="sm" variant="outline" onClick={addYAxisField}>
                                                    <Plus className="h-3 w-3 mr-1" />
                                                    {t('bitable.actions.add')}
                                                </Button>
                                            </div>

                                            {chartConfig.yAxisFields.length === 0 ? (
                                                <div className="text-sm text-muted-foreground py-2">
                                                    {t('bitable.chartView.noYAxisField')}
                                                </div>
                                            ) : (
                                                <ScrollArea className="max-h-[400px] pr-3">
                                                    <div className="space-y-3">
                                                        {chartConfig.yAxisFields.map((yConfig, index) => {
                                                            const field = fields.find(f => f.id === yConfig.fieldId);
                                                            const isExpanded = expandedYAxis[yConfig.fieldId] ?? (index === 0);
                                                            return (
                                                                <div key={yConfig.fieldId} className="p-2 bg-background rounded border space-y-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <Button
                                                                            size="icon"
                                                                            variant="ghost"
                                                                            className="h-8 w-8 shrink-0"
                                                                            onClick={() => setExpandedYAxis(prev => ({
                                                                                ...prev,
                                                                                [yConfig.fieldId]: !isExpanded
                                                                            }))}
                                                                        >
                                                                            {isExpanded ? (
                                                                                <ChevronDown className="h-4 w-4" />
                                                                            ) : (
                                                                                <ChevronUp className="h-4 w-4" />
                                                                            )}
                                                                        </Button>
                                                                        <Select
                                                                            value={yConfig.fieldId}
                                                                            onValueChange={(value) => {
                                                                                const newYFields = [...chartConfig.yAxisFields];
                                                                                newYFields[index] = { ...newYFields[index], fieldId: value };
                                                                                updateChartConfig({ yAxisFields: newYFields });
                                                                            }}
                                                                        >
                                                                            <SelectTrigger className="flex-1 h-8">
                                                                                <SelectValue />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                {numericFields.map((field) => (
                                                                                    <SelectItem key={field.id} value={field.id}>
                                                                                        {field.title}
                                                                                    </SelectItem>
                                                                                ))}
                                                                            </SelectContent>
                                                                        </Select>
                                                                        <div className="relative">
                                                                            <Input
                                                                                type="color"
                                                                                value={yConfig.color || currentColors[index % currentColors.length]}
                                                                                onChange={(e) => updateYAxisField(yConfig.fieldId, { color: e.target.value })}
                                                                                className="w-10 h-8 p-0 border-2 cursor-pointer"
                                                                                title={t('bitable.chartView.selectColor') || 'Select color'}
                                                                            />
                                                                        </div>
                                                                        <Button
                                                                            size="icon"
                                                                            variant="ghost"
                                                                            className="h-8 w-8"
                                                                            onClick={() => removeYAxisField(yConfig.fieldId)}
                                                                        >
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    </div>

                                                                    {/* Y轴高级配置 - 仅显示第一个字段的详细配置 */}
                                                                    {index === 0 && isExpanded && (
                                                                        <div className="pt-2 border-t space-y-2">
                                                                            <div className="grid grid-cols-2 gap-2">
                                                                                <div className="space-y-1">
                                                                                    <Label className="text-xs text-muted-foreground">{t('bitable.chartView.yAxisMin')}</Label>
                                                                                    <Input
                                                                                        type="number"
                                                                                        value={chartConfig.yAxisConfig?.min ?? ''}
                                                                                        onChange={(e) => updateChartConfig({
                                                                                            yAxisConfig: {
                                                                                                ...chartConfig.yAxisConfig,
                                                                                                min: e.target.value ? Number(e.target.value) : undefined
                                                                                            }
                                                                                        })}
                                                                                        placeholder={t('bitable.chartView.auto')}
                                                                                        className="h-7 text-xs"
                                                                                    />
                                                                                </div>
                                                                                <div className="space-y-1">
                                                                                    <Label className="text-xs text-muted-foreground">{t('bitable.chartView.yAxisMax')}</Label>
                                                                                    <Input
                                                                                        type="number"
                                                                                        value={chartConfig.yAxisConfig?.max ?? ''}
                                                                                        onChange={(e) => updateChartConfig({
                                                                                            yAxisConfig: {
                                                                                                ...chartConfig.yAxisConfig,
                                                                                                max: e.target.value ? Number(e.target.value) : undefined
                                                                                            }
                                                                                        })}
                                                                                        placeholder={t('bitable.chartView.auto')}
                                                                                        className="h-7 text-xs"
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                            <div className="space-y-1">
                                                                                <Label className="text-xs text-muted-foreground">{t('bitable.chartView.tickFormatter')}</Label>
                                                                                <Select
                                                                                    value={chartConfig.yAxisConfig?.tickFormatter || 'number'}
                                                                                    onValueChange={(value: any) => updateChartConfig({
                                                                                        yAxisConfig: { ...chartConfig.yAxisConfig, tickFormatter: value }
                                                                                    })}
                                                                                >
                                                                                    <SelectTrigger className="h-7 text-xs">
                                                                                        <SelectValue />
                                                                                    </SelectTrigger>
                                                                                    <SelectContent>
                                                                                        <SelectItem value="number">{t('bitable.chartView.formatNumber')}</SelectItem>
                                                                                        <SelectItem value="percent">{t('bitable.chartView.formatPercent')}</SelectItem>
                                                                                        <SelectItem value="currency">{t('bitable.chartView.formatCurrency')}</SelectItem>
                                                                                        <SelectItem value="compact">{t('bitable.chartView.formatCompact')}</SelectItem>
                                                                                    </SelectContent>
                                                                                </Select>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </ScrollArea>
                                            )}
                                        </div>
                                    )}

                                    <Separator />

                                    {/* 排序方式 */}
                                    <div className="space-y-2">
                                        <Label>{t('bitable.chartView.sortOrder')}</Label>
                                        <Select
                                            value={chartConfig.sortOrder || 'none'}
                                            onValueChange={(value: any) => updateChartConfig({ sortOrder: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">{t('bitable.chartView.sortNone')}</SelectItem>
                                                <SelectItem value="asc">{t('bitable.chartView.sortAsc')}</SelectItem>
                                                <SelectItem value="desc">{t('bitable.chartView.sortDesc')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Top N */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label>{t('bitable.chartView.topN')}</Label>
                                            <span className="text-sm text-muted-foreground">
                                                {chartConfig.topN ? chartConfig.topN : t('bitable.chartView.all')}
                                            </span>
                                        </div>
                                        <Slider
                                            value={[chartConfig.topN || 0]}
                                            onValueChange={(value) => updateChartConfig({ topN: value[0] })}
                                            max={20}
                                            step={1}
                                            className="w-full"
                                        />
                                    </div>
                                </ScrollArea>
                            </TabsContent>

                            {/* 样式配置选项卡 */}
                            <TabsContent value="style" className="mt-0 space-y-4">
                                {/* 图表高度 */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label>{t('bitable.chartView.chartHeight')}</Label>
                                        <span className="text-sm text-muted-foreground">{chartConfig.chartHeight || 300}px</span>
                                    </div>
                                    <Slider
                                        value={[chartConfig.chartHeight || 300]}
                                        onValueChange={(value) => updateChartConfig({ chartHeight: value[0] })}
                                        min={200}
                                        max={600}
                                        step={50}
                                        className="w-full"
                                    />
                                </div>

                                {/* 配色方案 */}
                                <div className="space-y-2">
                                    <Label>{t('bitable.chartView.colorScheme')}</Label>
                                    <Select
                                        value={chartConfig.colorScheme || 'default'}
                                        onValueChange={(value: any) => updateChartConfig({ colorScheme: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="default">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex">
                                                        {COLOR_SCHEMES.default.slice(0, 4).map((c, i) => (
                                                            <div key={i} className="w-3 h-3" style={{ backgroundColor: c }} />
                                                        ))}
                                                    </div>
                                                    {t('bitable.chartView.colorDefault')}
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="warm">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex">
                                                        {COLOR_SCHEMES.warm.slice(0, 4).map((c, i) => (
                                                            <div key={i} className="w-3 h-3" style={{ backgroundColor: c }} />
                                                        ))}
                                                    </div>
                                                    {t('bitable.chartView.colorWarm')}
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="cool">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex">
                                                        {COLOR_SCHEMES.cool.slice(0, 4).map((c, i) => (
                                                            <div key={i} className="w-3 h-3" style={{ backgroundColor: c }} />
                                                        ))}
                                                    </div>
                                                    {t('bitable.chartView.colorCool')}
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="monochrome">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex">
                                                        {COLOR_SCHEMES.monochrome.slice(0, 4).map((c, i) => (
                                                            <div key={i} className="w-3 h-3" style={{ backgroundColor: c }} />
                                                        ))}
                                                    </div>
                                                    {t('bitable.chartView.colorMonochrome')}
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Separator />

                                {/* 显示选项 */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label>{t('bitable.chartView.showLegend')}</Label>
                                        <Switch
                                            checked={chartConfig.showLegend}
                                            onCheckedChange={(checked) => updateChartConfig({ showLegend: checked })}
                                        />
                                    </div>

                                    {![ChartType.PIE, ChartType.DONUT, ChartType.RADIAL_BAR, ChartType.RADAR].includes(chartConfig.chartType) && (
                                        <>
                                            <div className="flex items-center justify-between">
                                                <Label>{t('bitable.chartView.showGrid')}</Label>
                                                <Switch
                                                    checked={chartConfig.showGrid}
                                                    onCheckedChange={(checked) => updateChartConfig({ showGrid: checked })}
                                                />
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <Label>{t('bitable.chartView.showYAxis')}</Label>
                                                <Switch
                                                    checked={chartConfig.showYAxis !== false}
                                                    onCheckedChange={(checked) => updateChartConfig({ showYAxis: checked })}
                                                />
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <Label>{t('bitable.chartView.showDataLabels')}</Label>
                                                <Switch
                                                    checked={chartConfig.showDataLabels}
                                                    onCheckedChange={(checked) => updateChartConfig({ showDataLabels: checked })}
                                                />
                                            </div>
                                        </>
                                    )}

                                    <div className="flex items-center justify-between">
                                        <Label>{t('bitable.chartView.enableAnimation')}</Label>
                                        <Switch
                                            checked={chartConfig.enableAnimation !== false}
                                            onCheckedChange={(checked) => updateChartConfig({ enableAnimation: checked })}
                                        />
                                    </div>
                                </div>

                                {/* 条形图特有选项 */}
                                {[ChartType.BAR, ChartType.STACKED_BAR].includes(chartConfig.chartType) && (
                                    <>
                                        <Separator />
                                        <div className="flex items-center justify-between">
                                            <Label>{t('bitable.chartView.horizontalBar')}</Label>
                                            <Switch
                                                checked={chartConfig.isHorizontal}
                                                onCheckedChange={(checked) => updateChartConfig({ isHorizontal: checked })}
                                            />
                                        </div>
                                    </>
                                )}

                                {/* 折线图/面积图特有选项 */}
                                {[ChartType.LINE, ChartType.AREA, ChartType.STACKED_AREA].includes(chartConfig.chartType) && (
                                    <>
                                        <Separator />
                                        <div className="flex items-center justify-between">
                                            <Label>{t('bitable.chartView.smoothLine')}</Label>
                                            <Switch
                                                checked={chartConfig.smoothLine !== false}
                                                onCheckedChange={(checked) => updateChartConfig({ smoothLine: checked })}
                                            />
                                        </div>
                                    </>
                                )}

                                {/* 饼图/甘圈图特有选项 */}
                                {[ChartType.PIE, ChartType.DONUT, ChartType.RADIAL_BAR].includes(chartConfig.chartType) && (
                                    <>
                                        <Separator />
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label>{t('bitable.chartView.innerRadius')}</Label>
                                                <span className="text-sm text-muted-foreground">{chartConfig.innerRadius || 60}</span>
                                            </div>
                                            <Slider
                                                value={[chartConfig.innerRadius || 60]}
                                                onValueChange={(value) => updateChartConfig({ innerRadius: value[0] })}
                                                min={0}
                                                max={100}
                                                step={5}
                                                className="w-full"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label>{t('bitable.chartView.outerRadius')}</Label>
                                                <span className="text-sm text-muted-foreground">{chartConfig.outerRadius || 100}</span>
                                            </div>
                                            <Slider
                                                value={[chartConfig.outerRadius || 100]}
                                                onValueChange={(value) => updateChartConfig({ outerRadius: value[0] })}
                                                min={50}
                                                max={150}
                                                step={5}
                                                className="w-full"
                                            />
                                        </div>
                                    </>
                                )}
                            </TabsContent>
                        </ScrollArea>
                    </Tabs>
                </div>
            )}
        </div>
    );
};
