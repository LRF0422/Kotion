import React from "react";
import {
    Pie,
    PieChart,
    Cell,
    LabelList
} from "@kn/ui";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@kn/ui";
import { ViewConfig } from "../../types";

interface PieChartComponentProps {
    view: ViewConfig;
    pieChartData: any[];
    rechartsConfig: any;
    currentColors: string[];
    height: number;
    isDonut?: boolean;
}

export const PieChartComponent: React.FC<PieChartComponentProps> = ({
    view,
    pieChartData,
    rechartsConfig,
    currentColors,
    height,
    isDonut = false
}) => {
    const chartConfig = view.chartConfig || {
        chartType: 'pie',
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

    return (
        <ChartContainer config={rechartsConfig} className={`h-[${height}px] w-full`} style={{ height }}>
            <PieChart>
                <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel />}
                />
                <Pie
                    data={pieChartData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={isDonut ? (chartConfig.innerRadius || 60) : 0}
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
};