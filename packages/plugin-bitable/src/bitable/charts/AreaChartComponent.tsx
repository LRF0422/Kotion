import React from "react";
import {
    Area,
    AreaChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid
} from "@kn/ui";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@kn/ui";
import { ViewConfig } from "../../types";

interface AreaChartComponentProps {
    view: ViewConfig;
    chartData: any[];
    rechartsConfig: any;
    currentColors: string[];
    yAxisProps: any;
    formatYAxisTick: (value: number) => string;
    height: number;
}

export const AreaChartComponent: React.FC<AreaChartComponentProps> = ({
    view,
    chartData,
    rechartsConfig,
    currentColors,
    yAxisProps,
    formatYAxisTick,
    height
}) => {
    const chartConfig = view.chartConfig || {
        chartType: 'area',
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

    const isStacked = chartConfig.chartType === 'stacked_area';
    const dataKeys = chartConfig.aggregation === 'count'
        ? ['count']
        : chartConfig.yAxisFields.map(y => y.fieldId);

    // 趋势线：对第一条系列做线性回归（堆叠图不显示，避免误读）
    const primaryKey = dataKeys[0];
    const showTrend = chartConfig.showTrendLine && !isStacked && !!primaryKey;
    const plotData = React.useMemo(() => {
        if (!showTrend || chartData.length < 2) return chartData;
        const ys = chartData.map(d => Number(d[primaryKey]) || 0);
        const n = ys.length;
        let sx = 0, sy = 0, sxy = 0, sxx = 0;
        ys.forEach((y, x) => { sx += x; sy += y; sxy += x * y; sxx += x * x; });
        const denom = n * sxx - sx * sx;
        if (denom === 0) return chartData;
        const b = (n * sxy - sx * sy) / denom;
        const a = (sy - b * sx) / n;
        return chartData.map((d, x) => ({ ...d, __trend: Math.round((a + b * x) * 100) / 100 }));
    }, [chartData, showTrend, primaryKey]);

    return (
        <ChartContainer config={rechartsConfig} className={`h-[${height}px] w-full`} style={{ height }}>
            <AreaChart data={plotData} accessibilityLayer>
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
                        stackId={isStacked ? 'stack' : undefined}
                        isAnimationActive={chartConfig.enableAnimation !== false}
                    />
                ))}
                {showTrend && (
                    <Line
                        type="linear"
                        dataKey="__trend"
                        stroke="#9ca3af"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        dot={false}
                        isAnimationActive={false}
                        legendType="none"
                    />
                )}
                {chartConfig.showLegend && (
                    <ChartLegend content={<ChartLegendContent />} />
                )}
            </AreaChart>
        </ChartContainer>
    );
};