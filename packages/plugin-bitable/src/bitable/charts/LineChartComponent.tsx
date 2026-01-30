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

    return (
        <ChartContainer config={rechartsConfig} className={`h-[${height}px] w-full`} style={{ height }}>
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
};