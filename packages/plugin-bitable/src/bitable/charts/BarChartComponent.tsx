import React from "react";
import {
    Bar,
    BarChart,
    XAxis,
    YAxis,
    CartesianGrid,
    LabelList
} from "@kn/ui";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@kn/ui";
import { useTranslation } from "@kn/common";
import { ViewConfig, FieldConfig, RecordData } from "../../types";

interface BarChartComponentProps {
    view: ViewConfig;
    fields: FieldConfig[];
    data: RecordData[];
    chartData: any[];
    rechartsConfig: any;
    currentColors: string[];
    yAxisProps: any;
    formatYAxisTick: (value: number) => string;
    height: number;
}

export const BarChartComponent: React.FC<BarChartComponentProps> = ({
    view,
    fields,
    data,
    chartData,
    rechartsConfig,
    currentColors,
    yAxisProps,
    formatYAxisTick,
    height
}) => {
    const { t } = useTranslation();
    const chartConfig = view.chartConfig || {
        chartType: 'bar',
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

    const isStacked = chartConfig.chartType === 'stacked_bar';
    const dataKeys = chartConfig.aggregation === 'count'
        ? ['count']
        : chartConfig.yAxisFields.map(y => y.fieldId);

    return (
        <ChartContainer config={rechartsConfig} className={`h-[${height}px] w-full`} style={{ height }}>
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
};