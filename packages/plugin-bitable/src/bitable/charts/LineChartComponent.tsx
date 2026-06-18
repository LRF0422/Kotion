import React from "react";
import {
    Line,
    LineChart,
    XAxis,
    YAxis,
    CartesianGrid,
    LabelList
} from "@kn/ui";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@kn/ui";
import { ViewConfig } from "../../types";

interface LineChartComponentProps {
    view: ViewConfig;
    data: any[];
    chartData: any[];
    rechartsConfig: any;
    currentColors: string[];
    yAxisProps: any;
    formatYAxisTick: (value: number) => string;
    height: number;
}

export const LineChartComponent: React.FC<LineChartComponentProps> = ({
    view,
    chartData,
    rechartsConfig,
    currentColors,
    yAxisProps,
    formatYAxisTick,
    height
}) => {
    const chartConfig = view.chartConfig || {
        chartType: 'line',
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

    const dataKeys = chartConfig.aggregation === 'count'
        ? ['count']
        : chartConfig.yAxisFields.map(y => y.fieldId);

    // 趋势线：对第一条系列做线性回归，注入 __trend 字段
    const primaryKey = dataKeys[0];
    const plotData = React.useMemo(() => {
        if (!chartConfig.showTrendLine || !primaryKey || chartData.length < 2) return chartData;
        const ys = chartData.map(d => Number(d[primaryKey]) || 0);
        const n = ys.length;
        let sx = 0, sy = 0, sxy = 0, sxx = 0;
        ys.forEach((y, x) => { sx += x; sy += y; sxy += x * y; sxx += x * x; });
        const denom = n * sxx - sx * sx;
        if (denom === 0) return chartData;
        const b = (n * sxy - sx * sy) / denom;
        const a = (sy - b * sx) / n;
        return chartData.map((d, x) => ({ ...d, __trend: Math.round((a + b * x) * 100) / 100 }));
    }, [chartData, chartConfig.showTrendLine, primaryKey]);

    return (
        <ChartContainer config={rechartsConfig} className={`h-[${height}px] w-full`} style={{ height }}>
            <LineChart data={plotData} accessibilityLayer>
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
                {chartConfig.showTrendLine && primaryKey && (
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
            </LineChart>
        </ChartContainer>
    );
};