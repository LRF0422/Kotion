import { useMemo } from "react";
import { FieldConfig, RecordData, ViewConfig, ChartType, FieldType, YAxisConfig } from "../../types";

// 色彩方案
const COLOR_SCHEMES = {
    default: [
        "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
        "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#a855f7"
    ],
    warm: [
        "#ef4444", "#f97316", "#f59e0b", "#eab308", "#fbbf24",
        "#d97706", "#ea580c", "#dc2626", "#f43f5e", "#e11d48"
    ],
    cool: [
        "#3b82f6", "#06b6d4", "#14b8a6", "#22c55e", "#10b981",
        "#0ea5e9", "#6366f1", "#8b5cf6", "#a855f7", "#0891b2"
    ],
    monochrome: [
        "#1e293b", "#334155", "#475569", "#64748b", "#94a3b8",
        "#cbd5e1", "#e2e8f0", "#f1f5f9", "#0f172a", "#020617"
    ],
};

interface ChartDataResult {
    chartData: Record<string, any>[];
    pieChartData: Array<{ name: string; value: number; fill: string }>;
    radarChartData: Record<string, any>[];
    scatterChartData: Array<{ x: number; y: number; z: number; name: string }>;
    radialBarData: Array<{ name: string; value: number; fill: string }>;
    dataStats: {
        total: number;
        categories: number;
        min: number;
        max: number;
        avg: number;
    };
    rechartsConfig: Record<string, { label: string; color: string }>;
    currentColors: string[];
    formatYAxisTick: (value: number) => string;
    yAxisProps: any;
}

export const useChartData = (
    view: ViewConfig,
    fields: FieldConfig[],
    data: RecordData[]
): ChartDataResult => {
    const chartConfig = view.chartConfig || {
        chartType: ChartType.BAR,
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

    // 获取当前配色方案的颜色
    const currentColors = useMemo(() => {
        return COLOR_SCHEMES[chartConfig.colorScheme || 'default'] || COLOR_SCHEMES.default;
    }, [chartConfig.colorScheme]);

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
            f.type === FieldType.ID ||
            f.type === FieldType.MULTI_SELECT
        );
    }, [fields]);

    // 计算数据统计
    const dataStats = useMemo(() => {
        if (!chartConfig.xAxisField || data.length === 0) {
            return { total: 0, categories: 0, min: 0, max: 0, avg: 0 };
        }

        const categories = new Set(data.map(r => r[chartConfig.xAxisField])).size;

        if (chartConfig.yAxisFields.length > 0) {
            const firstYField = chartConfig.yAxisFields[0].fieldId;
            const values = data.map(r => Number(r[firstYField]) || 0);
            const sum = values.reduce((a, b) => a + b, 0);
            return {
                total: data.length,
                categories,
                min: Math.min(...values),
                max: Math.max(...values),
                avg: Math.round((sum / values.length) * 100) / 100,
            };
        }

        return { total: data.length, categories, min: 0, max: 0, avg: 0 };
    }, [data, chartConfig]);

    // 处理图表数据
    const chartData = useMemo(() => {
        if (!chartConfig.xAxisField || chartConfig.yAxisFields.length === 0) {
            return [];
        }

        const xField = fields.find(f => f.id === chartConfig.xAxisField);
        if (!xField) return [];

        let processedData: Record<string, any>[] = [];

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

            processedData = Object.entries(groupedData).map(([xValue, yValues]) => {
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
        } else if (chartConfig.aggregation === 'count') {
            // 计数聚合
            const countMap: Record<string, number> = {};
            data.forEach(record => {
                const xValue = String(record[chartConfig.xAxisField] || 'N/A');
                countMap[xValue] = (countMap[xValue] || 0) + 1;
            });

            processedData = Object.entries(countMap).map(([xValue, count]) => ({
                [chartConfig.xAxisField]: xValue,
                count,
            }));
        } else {
            // 直接映射数据
            processedData = data.map(record => {
                const result: Record<string, any> = {
                    [chartConfig.xAxisField]: record[chartConfig.xAxisField] || 'N/A',
                };
                chartConfig.yAxisFields.forEach(yConfig => {
                    result[yConfig.fieldId] = Number(record[yConfig.fieldId]) || 0;
                });
                return result;
            });
        }

        // 排序数据
        if (chartConfig.sortOrder && chartConfig.sortOrder !== 'none') {
            const sortField = chartConfig.aggregation === 'count' ? 'count' : chartConfig.yAxisFields[0]?.fieldId;
            if (sortField) {
                processedData.sort((a, b) => {
                    const aVal = Number(a[sortField]) || 0;
                    const bVal = Number(b[sortField]) || 0;
                    return chartConfig.sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
                });
            }
        }

        // 应用 Top N 筛选
        if (chartConfig.topN && chartConfig.topN > 0 && processedData.length > chartConfig.topN) {
            processedData = processedData.slice(0, chartConfig.topN);
        }

        return processedData;
    }, [data, chartConfig, fields]);

    // 饼图数据（需要特殊处理）
    const pieChartData = useMemo(() => {
        if ((chartConfig.chartType !== ChartType.PIE && chartConfig.chartType !== ChartType.DONUT) || !chartConfig.xAxisField) {
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

        let result = Object.entries(groupedData).map(([name, value], index) => ({
            name,
            value,
            fill: currentColors[index % currentColors.length],
        }));

        // 排序
        if (chartConfig.sortOrder && chartConfig.sortOrder !== 'none') {
            result.sort((a, b) => chartConfig.sortOrder === 'asc' ? a.value - b.value : b.value - a.value);
        }

        // Top N
        if (chartConfig.topN && chartConfig.topN > 0 && result.length > chartConfig.topN) {
            const others = result.slice(chartConfig.topN).reduce((sum, item) => sum + item.value, 0);
            result = result.slice(0, chartConfig.topN);
            if (others > 0) {
                result.push({ name: 'Others', value: others, fill: '#9ca3af' }); // TODO: Use translation
            }
        }

        return result;
    }, [data, chartConfig, currentColors]);

    // 雷达图数据
    const radarChartData = useMemo(() => {
        if (chartConfig.chartType !== ChartType.RADAR || !chartConfig.xAxisField) {
            return [];
        }

        return chartData.map(item => {
            const result: Record<string, any> = {
                subject: item[chartConfig.xAxisField],
            };
            chartConfig.yAxisFields.forEach(yConfig => {
                const field = fields.find(f => f.id === yConfig.fieldId);
                result[field?.title || yConfig.fieldId] = item[yConfig.fieldId];
            });
            return result;
        });
    }, [chartData, chartConfig, fields]);

    // 散点图数据
    const scatterChartData = useMemo(() => {
        if (chartConfig.chartType !== ChartType.SCATTER || chartConfig.yAxisFields.length < 2) {
            return [];
        }

        return data.map((record, index) => ({
            x: Number(record[chartConfig.yAxisFields[0]?.fieldId]) || 0,
            y: Number(record[chartConfig.yAxisFields[1]?.fieldId]) || 0,
            z: chartConfig.yAxisFields[2] ? Number(record[chartConfig.yAxisFields[2].fieldId]) || 10 : 10,
            name: record[chartConfig.xAxisField] || `Point ${index + 1}`,
        }));
    }, [data, chartConfig]);

    // 径向条形图数据
    const radialBarData = useMemo(() => {
        if (chartConfig.chartType !== ChartType.RADIAL_BAR || !chartConfig.xAxisField) {
            return [];
        }

        const yFieldId = chartConfig.yAxisFields[0]?.fieldId;
        if (!yFieldId && chartConfig.aggregation !== 'count') {
            return [];
        }

        return chartData.slice(0, 8).map((item, index) => ({
            name: item[chartConfig.xAxisField],
            value: chartConfig.aggregation === 'count' ? item.count : item[yFieldId],
            fill: currentColors[index % currentColors.length],
        }));
    }, [chartData, chartConfig, currentColors]);

    // 生成图表配置
    const rechartsConfig = useMemo(() => {
        const config: Record<string, { label: string; color: string }> = {};

        if (chartConfig.aggregation === 'count') {
            config['count'] = {
                label: 'Count', // TODO: Use translation
                color: currentColors[0],
            };
        } else {
            chartConfig.yAxisFields.forEach((yConfig, index) => {
                const field = fields.find(f => f.id === yConfig.fieldId);
                config[yConfig.fieldId] = {
                    label: yConfig.label || field?.title || yConfig.fieldId,
                    color: yConfig.color || currentColors[index % currentColors.length],
                };
            });
        }

        // 饼图/甘圈图/径向条形图配置
        if (chartConfig.chartType === ChartType.PIE ||
            chartConfig.chartType === ChartType.DONUT ||
            chartConfig.chartType === ChartType.RADIAL_BAR) {
            pieChartData.forEach((item, index) => {
                config[item.name] = {
                    label: item.name,
                    color: currentColors[index % currentColors.length],
                };
            });
        }

        // 雷达图配置
        if (chartConfig.chartType === ChartType.RADAR) {
            chartConfig.yAxisFields.forEach((yConfig, index) => {
                const field = fields.find(f => f.id === yConfig.fieldId);
                const label = field?.title || yConfig.fieldId;
                config[label] = {
                    label,
                    color: yConfig.color || currentColors[index % currentColors.length],
                };
            });
        }

        return config;
    }, [chartConfig, fields, pieChartData, currentColors]);

    // Y轴刻度格式化函数
    const formatYAxisTick = (value: number) => {
        const formatter = chartConfig.yAxisConfig?.tickFormatter || 'number';
        switch (formatter) {
            case 'percent':
                return `${value}%`;
            case 'currency':
                return `¥${value.toLocaleString()}`;
            case 'compact':
                if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
                return value.toString();
            case 'number':
            default:
                return value.toLocaleString();
        }
    };

    // 获取Y轴配置属性
    const yAxisProps = useMemo(() => {
        const config = chartConfig.yAxisConfig || {};
        return {
            tickLine: false,
            axisLine: config.showAxisLine !== false,
            tickFormatter: formatYAxisTick,
            tickCount: config.tickCount || 5,
            domain: [
                config.min !== undefined ? config.min : 'auto',
                config.max !== undefined ? config.max : 'auto'
            ] as [number | 'auto', number | 'auto'],
            label: config.label ? {
                value: config.label,
                angle: -90,
                position: 'insideLeft',
                style: { textAnchor: 'middle' }
            } : undefined,
        };
    }, [chartConfig.yAxisConfig, formatYAxisTick]);

    return {
        chartData,
        pieChartData,
        radarChartData,
        scatterChartData,
        radialBarData,
        dataStats,
        rechartsConfig,
        currentColors,
        formatYAxisTick,
        yAxisProps
    };
};