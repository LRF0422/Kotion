import React from "react";
import {
    RadialBar,
    RadialBarChart,
    Cell
} from "@kn/ui";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@kn/ui";
import { ViewConfig } from "../../types";

interface RadialBarChartComponentProps {
    view: ViewConfig;
    radialBarData: any[];
    rechartsConfig: any;
    currentColors: string[];
    height: number;
}

export const RadialBarChartComponent: React.FC<RadialBarChartComponentProps> = ({
    view,
    radialBarData,
    rechartsConfig,
    currentColors,
    height
}) => {
    const chartConfig = view.chartConfig || {
        chartType: 'radial-bar',
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
        <ChartContainer config={rechartsConfig} className={`h-[${height}px] w-full mx-auto`} style={{ height }}>
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
};