import React from "react";
import {
    Area,
    AreaChart,
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

    return (
        <ChartContainer config={rechartsConfig} className={`h-[${height}px] w-full`} style={{ height }}>
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
                        stackId={isStacked ? 'stack' : undefined}
                        isAnimationActive={chartConfig.enableAnimation !== false}
                    />
                ))}
                {chartConfig.showLegend && (
                    <ChartLegend content={<ChartLegendContent />} />
                )}
            </AreaChart>
        </ChartContainer>
    );
};