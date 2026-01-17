import React, { useMemo, useState } from "react";
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
    LineChart, Line, YAxis, Cell
} from "@kn/ui";
import { Plus, Trash2, Settings, BarChart3, PieChart as PieChartIcon, LineChart as LineChartIcon, AreaChart as AreaChartIcon } from "@kn/icon";
import { useTranslation } from "@kn/common";
import { FieldConfig, RecordData, ViewConfig, ChartType, FieldType, YAxisConfig } from "../../types";

interface ChartViewProps {
    view: ViewConfig;
    fields: FieldConfig[];
    data: RecordData[];
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
    editable: boolean;
}

// 默认颜色配置
const DEFAULT_COLORS = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
];

const PRESET_COLORS = [
    "#3b82f6", // blue
    "#22c55e", // green
    "#f59e0b", // amber
    "#ef4444", // red
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#06b6d4", // cyan
    "#f97316", // orange
];

export const ChartView: React.FC<ChartViewProps> = (props) => {
    const { view, fields, data, onUpdateView, editable } = props;
    const { t } = useTranslation();
    const [configOpen, setConfigOpen] = useState(false);

    const chartConfig = view.chartConfig || {
        chartType: ChartType.BAR,
        xAxisField: '',
        yAxisFields: [],
        title: '',
        description: '',
        showLegend: true,
        showGrid: true,
        aggregation: 'sum',
    };

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
            f.type === FieldType.ID
        );
    }, [fields]);

    // 处理图表数据
    const chartData = useMemo(() => {
        if (!chartConfig.xAxisField || chartConfig.yAxisFields.length === 0) {
            return [];
        }

        const xField = fields.find(f => f.id === chartConfig.xAxisField);
        if (!xField) return [];

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

            return Object.entries(groupedData).map(([xValue, yValues]) => {
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
        }

        // 计数聚合
        if (chartConfig.aggregation === 'count') {
            const countMap: Record<string, number> = {};
            data.forEach(record => {
                const xValue = String(record[chartConfig.xAxisField] || 'N/A');
                countMap[xValue] = (countMap[xValue] || 0) + 1;
            });

            return Object.entries(countMap).map(([xValue, count]) => ({
                [chartConfig.xAxisField]: xValue,
                count,
            }));
        }

        // 直接映射数据
        return data.map(record => {
            const result: Record<string, any> = {
                [chartConfig.xAxisField]: record[chartConfig.xAxisField] || 'N/A',
            };
            chartConfig.yAxisFields.forEach(yConfig => {
                result[yConfig.fieldId] = Number(record[yConfig.fieldId]) || 0;
            });
            return result;
        });
    }, [data, chartConfig, fields]);

    // 饼图数据（需要特殊处理）
    const pieChartData = useMemo(() => {
        if (chartConfig.chartType !== ChartType.PIE || !chartConfig.xAxisField) {
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

        return Object.entries(groupedData).map(([name, value], index) => ({
            name,
            value,
            fill: PRESET_COLORS[index % PRESET_COLORS.length],
        }));
    }, [data, chartConfig]);

    // 生成图表配置
    const rechartsConfig = useMemo(() => {
        const config: Record<string, { label: string; color: string }> = {};

        if (chartConfig.aggregation === 'count') {
            config['count'] = {
                label: t('bitable.chartView.count'),
                color: PRESET_COLORS[0],
            };
        } else {
            chartConfig.yAxisFields.forEach((yConfig, index) => {
                const field = fields.find(f => f.id === yConfig.fieldId);
                config[yConfig.fieldId] = {
                    label: yConfig.label || field?.title || yConfig.fieldId,
                    color: yConfig.color || PRESET_COLORS[index % PRESET_COLORS.length],
                };
            });
        }

        // 饼图配置
        if (chartConfig.chartType === ChartType.PIE) {
            pieChartData.forEach((item, index) => {
                config[item.name] = {
                    label: item.name,
                    color: PRESET_COLORS[index % PRESET_COLORS.length],
                };
            });
        }

        return config;
    }, [chartConfig, fields, pieChartData, t]);

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
                        color: PRESET_COLORS[chartConfig.yAxisFields.length % PRESET_COLORS.length],
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
                return <BarChart3 className="h-4 w-4" />;
            case ChartType.LINE:
                return <LineChartIcon className="h-4 w-4" />;
            case ChartType.PIE:
                return <PieChartIcon className="h-4 w-4" />;
            case ChartType.AREA:
                return <AreaChartIcon className="h-4 w-4" />;
            default:
                return <BarChart3 className="h-4 w-4" />;
        }
    };

    // 渲染图表
    const renderChart = () => {
        if (!chartConfig.xAxisField) {
            return (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                    {t('bitable.chartView.selectXAxis')}
                </div>
            );
        }

        if (chartConfig.chartType !== ChartType.PIE &&
            chartConfig.yAxisFields.length === 0 &&
            chartConfig.aggregation !== 'count') {
            return (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                    {t('bitable.chartView.selectYAxis')}
                </div>
            );
        }

        const dataKeys = chartConfig.aggregation === 'count'
            ? ['count']
            : chartConfig.yAxisFields.map(y => y.fieldId);

        switch (chartConfig.chartType) {
            case ChartType.BAR:
                return (
                    <ChartContainer config={rechartsConfig} className="h-[300px] w-full">
                        <BarChart data={chartData} accessibilityLayer>
                            {chartConfig.showGrid && <CartesianGrid vertical={false} />}
                            <XAxis
                                dataKey={chartConfig.xAxisField}
                                tickLine={false}
                                tickMargin={10}
                                axisLine={false}
                            />
                            <ChartTooltip
                                cursor={false}
                                content={<ChartTooltipContent indicator="dashed" />}
                            />
                            {dataKeys.map((key, index) => (
                                <Bar
                                    key={key}
                                    dataKey={key}
                                    fill={chartConfig.yAxisFields[index]?.color || PRESET_COLORS[index % PRESET_COLORS.length]}
                                    radius={4}
                                />
                            ))}
                            {chartConfig.showLegend && (
                                <ChartLegend content={<ChartLegendContent />} />
                            )}
                        </BarChart>
                    </ChartContainer>
                );

            case ChartType.LINE:
                return (
                    <ChartContainer config={rechartsConfig} className="h-[300px] w-full">
                        <LineChart data={chartData} accessibilityLayer>
                            {chartConfig.showGrid && <CartesianGrid strokeDasharray="3 3" />}
                            <XAxis
                                dataKey={chartConfig.xAxisField}
                                tickLine={false}
                                tickMargin={10}
                                axisLine={false}
                            />
                            <YAxis />
                            <ChartTooltip
                                cursor={false}
                                content={<ChartTooltipContent />}
                            />
                            {dataKeys.map((key, index) => (
                                <Line
                                    key={key}
                                    type="monotone"
                                    dataKey={key}
                                    stroke={chartConfig.yAxisFields[index]?.color || PRESET_COLORS[index % PRESET_COLORS.length]}
                                    strokeWidth={2}
                                    dot={{ r: 4 }}
                                />
                            ))}
                            {chartConfig.showLegend && (
                                <ChartLegend content={<ChartLegendContent />} />
                            )}
                        </LineChart>
                    </ChartContainer>
                );

            case ChartType.PIE:
                return (
                    <ChartContainer config={rechartsConfig} className="h-[300px] w-full">
                        <PieChart>
                            <ChartTooltip
                                cursor={false}
                                content={<ChartTooltipContent hideLabel />}
                            />
                            <Pie
                                data={pieChartData}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={60}
                                outerRadius={100}
                                strokeWidth={2}
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
                return (
                    <ChartContainer config={rechartsConfig} className="h-[300px] w-full">
                        <AreaChart data={chartData} accessibilityLayer>
                            {chartConfig.showGrid && <CartesianGrid vertical={false} />}
                            <XAxis
                                dataKey={chartConfig.xAxisField}
                                tickLine={false}
                                tickMargin={10}
                                axisLine={false}
                            />
                            <ChartTooltip
                                cursor={false}
                                content={<ChartTooltipContent indicator="dot" />}
                            />
                            {dataKeys.map((key, index) => (
                                <Area
                                    key={key}
                                    type="monotone"
                                    dataKey={key}
                                    fill={chartConfig.yAxisFields[index]?.color || PRESET_COLORS[index % PRESET_COLORS.length]}
                                    fillOpacity={0.4}
                                    stroke={chartConfig.yAxisFields[index]?.color || PRESET_COLORS[index % PRESET_COLORS.length]}
                                />
                            ))}
                            {chartConfig.showLegend && (
                                <ChartLegend content={<ChartLegendContent />} />
                            )}
                        </AreaChart>
                    </ChartContainer>
                );

            default:
                return null;
        }
    };

    return (
        <div className="relative">
            <Card>
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <div>
                            {chartConfig.title && (
                                <h3 className="text-lg font-semibold">{chartConfig.title}</h3>
                            )}
                            {chartConfig.description && (
                                <CardDescription>{chartConfig.description}</CardDescription>
                            )}
                        </div>
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
                </CardHeader>
                <CardContent>
                    {renderChart()}
                </CardContent>
            </Card>

            {/* 配置面板 */}
            {configOpen && editable && (
                <div className="absolute top-0 right-0 w-80 bg-background border rounded-lg shadow-lg p-4 z-50 max-h-[500px] overflow-y-auto">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="font-semibold">{t('bitable.chartView.chartConfig')}</h4>
                        <Button size="icon" variant="ghost" onClick={() => setConfigOpen(false)}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="space-y-4">
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
                                    <SelectItem value={ChartType.LINE}>
                                        <div className="flex items-center gap-2">
                                            <LineChartIcon className="h-4 w-4" />
                                            {t('bitable.chartView.lineChart')}
                                        </div>
                                    </SelectItem>
                                    <SelectItem value={ChartType.PIE}>
                                        <div className="flex items-center gap-2">
                                            <PieChartIcon className="h-4 w-4" />
                                            {t('bitable.chartView.pieChart')}
                                        </div>
                                    </SelectItem>
                                    <SelectItem value={ChartType.AREA}>
                                        <div className="flex items-center gap-2">
                                            <AreaChartIcon className="h-4 w-4" />
                                            {t('bitable.chartView.areaChart')}
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

                        {/* Y轴字段 (非饼图且非count聚合时显示) */}
                        {chartConfig.chartType !== ChartType.PIE && chartConfig.aggregation !== 'count' && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label>{t('bitable.chartView.yAxis')}</Label>
                                    <Button size="sm" variant="outline" onClick={addYAxisField}>
                                        <Plus className="h-3 w-3 mr-1" />
                                        {t('bitable.actions.add')}
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {chartConfig.yAxisFields.map((yConfig, index) => (
                                        <div key={yConfig.fieldId} className="flex items-center gap-2">
                                            <Select
                                                value={yConfig.fieldId}
                                                onValueChange={(value) => {
                                                    const newYFields = [...chartConfig.yAxisFields];
                                                    newYFields[index] = { ...newYFields[index], fieldId: value };
                                                    updateChartConfig({ yAxisFields: newYFields });
                                                }}
                                            >
                                                <SelectTrigger className="flex-1">
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
                                            <Input
                                                type="color"
                                                value={yConfig.color}
                                                onChange={(e) => updateYAxisField(yConfig.fieldId, { color: e.target.value })}
                                                className="w-10 h-8 p-1"
                                            />
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => removeYAxisField(yConfig.fieldId)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 饼图的值字段 */}
                        {chartConfig.chartType === ChartType.PIE && chartConfig.aggregation !== 'count' && (
                            <div className="space-y-2">
                                <Label>{t('bitable.chartView.valueField')}</Label>
                                <Select
                                    value={chartConfig.yAxisFields[0]?.fieldId || ''}
                                    onValueChange={(value) => {
                                        updateChartConfig({
                                            yAxisFields: [{
                                                fieldId: value,
                                                color: PRESET_COLORS[0],
                                            }],
                                        });
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('bitable.chartView.selectField')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {numericFields.map((field) => (
                                            <SelectItem key={field.id} value={field.id}>
                                                {field.title}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {/* 显示选项 */}
                        <div className="space-y-3 pt-2 border-t">
                            <div className="flex items-center justify-between">
                                <Label>{t('bitable.chartView.showLegend')}</Label>
                                <Switch
                                    checked={chartConfig.showLegend}
                                    onCheckedChange={(checked) => updateChartConfig({ showLegend: checked })}
                                />
                            </div>
                            {chartConfig.chartType !== ChartType.PIE && (
                                <div className="flex items-center justify-between">
                                    <Label>{t('bitable.chartView.showGrid')}</Label>
                                    <Switch
                                        checked={chartConfig.showGrid}
                                        onCheckedChange={(checked) => updateChartConfig({ showGrid: checked })}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
