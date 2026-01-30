import React from "react";
import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis
} from "@kn/ui";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@kn/ui";
import { ViewConfig, FieldConfig } from "../../types";

interface RadarChartComponentProps {
    view: ViewConfig;
    fields: FieldConfig[];
    radarChartData: any[];
    rechartsConfig: any;
    currentColors: string[];
    height: number;
}

export const RadarChartComponent: React.FC<RadarChartComponentProps> = ({
    view,
    fields,
    radarChartData,
    rechartsConfig,
    currentColors,
    height
}) => {
    const chartConfig = view.chartConfig || {
        chartType: 'radar',
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
        <ChartContainer config={rechartsConfig} className={`h-[${height}px] w-full mx-auto aspect-square`} style={{ height }}>
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
};