import React from "react";
import {
    Scatter,
    ScatterChart,
    XAxis,
    YAxis,
    ZAxis,
    CartesianGrid,
    Tooltip,
} from "@kn/ui";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@kn/ui";
import { ViewConfig, FieldConfig } from "../../types";

interface ScatterChartComponentProps {
    view: ViewConfig;
    fields: FieldConfig[];
    scatterChartData: any[];
    rechartsConfig: any;
    currentColors: string[];
    height: number;
}

export const ScatterChartComponent: React.FC<ScatterChartComponentProps> = ({
    view,
    fields,
    scatterChartData,
    rechartsConfig,
    currentColors,
    height
}) => {
    const chartConfig = view.chartConfig || {
        chartType: 'scatter',
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

    const xField = fields.find(f => f.id === chartConfig.yAxisFields[0]?.fieldId);
    const yField = fields.find(f => f.id === chartConfig.yAxisFields[1]?.fieldId);

    return (
        <ChartContainer config={rechartsConfig} className={`h-[${height}px] w-full`} style={{ height }}>
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
};