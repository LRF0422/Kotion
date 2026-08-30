import { useCallback, useMemo } from "react";
import { useTranslation } from "@kn/common";
import { parseISO, format, isValid } from "date-fns";
import { FieldConfig, RecordData, ViewConfig, ChartType, FieldType, YAxisConfig } from "../../types";
import { COLOR_SCHEMES } from "../../utils/chartColors";

/** 把日期值归并到指定时间粒度的桶标签（可按字典序排序，且语义清晰）。 */
function bucketDate(value: any, granularity: NonNullable<ViewConfig['chartConfig']>['dateAggregation']): string {
    let d: Date;
    try {
        d = typeof value === 'string' ? parseISO(value) : new Date(value);
    } catch {
        return String(value);
    }
    if (!isValid(d)) return String(value);
    switch (granularity) {
        case 'day': return format(d, 'yyyy-MM-dd');
        case 'week': return format(d, "yyyy-'W'II");
        case 'month': return format(d, 'yyyy-MM');
        case 'quarter': return format(d, "yyyy-'Q'Q");
        case 'year': return format(d, 'yyyy');
        default: return String(value);
    }
}

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
    chartError: { type: 'missing-x' | 'missing-y'; fieldId?: string } | null;
}

export const useChartData = (
    view: ViewConfig,
    fields: FieldConfig[],
    data: RecordData[]
): ChartDataResult => {
    const { t } = useTranslation();
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
    const isCountAggregation = chartConfig.aggregation === 'count';
    const requiresYAxis = !isCountAggregation;

    // 字段 id → 字段的查找表，避免在数据/配置循环里反复 fields.find（O(字段数)）
    const fieldMap = useMemo(() => new Map(fields.map(f => [f.id, f])), [fields]);

    // X 轴取值：日期字段且配置了时间粒度时归并到桶，否则取原始字符串
    const getXValue = useCallback((record: RecordData): string => {
        const raw = record[chartConfig.xAxisField];
        const xField = fieldMap.get(chartConfig.xAxisField);
        if (xField?.type === FieldType.DATE && chartConfig.dateAggregation && raw) {
            return bucketDate(raw, chartConfig.dateAggregation);
        }
        return String(raw ?? 'N/A');
    }, [fieldMap, chartConfig.xAxisField, chartConfig.dateAggregation]);

    // 日期粒度聚合时，默认按桶标签升序（时间顺序）
    const isDateBucketed = useMemo(() => {
        const xField = fieldMap.get(chartConfig.xAxisField);
        return xField?.type === FieldType.DATE && !!chartConfig.dateAggregation;
    }, [fieldMap, chartConfig.xAxisField, chartConfig.dateAggregation]);

    // 配置引用的字段被删除时给出明确错误，避免图表静默空白
    const chartError = useMemo<ChartDataResult['chartError']>(() => {
        if (chartConfig.xAxisField && !fieldMap.has(chartConfig.xAxisField)) {
            return { type: 'missing-x' };
        }
        if (requiresYAxis) {
            const missingY = chartConfig.yAxisFields.find(y => !fieldMap.has(y.fieldId));
            if (missingY) {
                return { type: 'missing-y', fieldId: missingY.fieldId };
            }
        }
        return null;
    }, [chartConfig.xAxisField, chartConfig.yAxisFields, fieldMap, requiresYAxis]);

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
        if (
            !chartConfig.xAxisField ||
            (requiresYAxis && chartConfig.yAxisFields.length === 0)
        ) {
            return [];
        }

        const xField = fieldMap.get(chartConfig.xAxisField);
        if (!xField) return [];

        let processedData: Record<string, any>[] = [];

        // 分组聚合数据
        if (chartConfig.aggregation && chartConfig.aggregation !== 'count') {
            const groupedData: Record<string, Record<string, number[]>> = {};

            data.forEach(record => {
                const xValue = getXValue(record);
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
                const xValue = getXValue(record);
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
                    [chartConfig.xAxisField]: getXValue(record),
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
        } else if (isDateBucketed) {
            // 未指定排序时，日期粒度按时间顺序（桶标签字典序即时间序）
            processedData.sort((a, b) =>
                String(a[chartConfig.xAxisField]).localeCompare(String(b[chartConfig.xAxisField]))
            );
        }

        // 应用 Top N 筛选
        if (chartConfig.topN && chartConfig.topN > 0 && processedData.length > chartConfig.topN) {
            processedData = processedData.slice(0, chartConfig.topN);
        }

        return processedData;
    }, [data, chartConfig, fieldMap, getXValue, isDateBucketed, requiresYAxis]);

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
                result.push({ name: t('bitable.chartView.others'), value: others, fill: '#9ca3af' });
            }
        }

        return result;
    }, [data, chartConfig, currentColors, getXValue]);

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
                const field = fieldMap.get(yConfig.fieldId);
                result[field?.title || yConfig.fieldId] = item[yConfig.fieldId];
            });
            return result;
        });
    }, [chartData, chartConfig, fieldMap]);

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

        const limit = chartConfig.topN && chartConfig.topN > 0 ? chartConfig.topN : 8;
        const items = chartData.map((item, index) => ({
            name: item[chartConfig.xAxisField],
            value: chartConfig.aggregation === 'count' ? item.count : item[yFieldId],
            fill: currentColors[index % currentColors.length],
        }));

        if (items.length <= limit) return items;

        // 超出上限的部分合并为“其他”，而不是直接丢弃
        const top = items.slice(0, limit);
        const othersValue = items.slice(limit).reduce((sum, it) => sum + (Number(it.value) || 0), 0);
        if (othersValue > 0) {
            top.push({ name: t('bitable.chartView.others'), value: othersValue, fill: '#9ca3af' });
        }
        return top;
    }, [chartData, chartConfig, currentColors, t]);

    // 生成图表配置
    const rechartsConfig = useMemo(() => {
        const config: Record<string, { label: string; color: string }> = {};

        if (chartConfig.aggregation === 'count') {
            config['count'] = {
                label: t('bitable.chartView.count'),
                color: currentColors[0],
            };
        } else {
            chartConfig.yAxisFields.forEach((yConfig, index) => {
                const field = fieldMap.get(yConfig.fieldId);
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
                const field = fieldMap.get(yConfig.fieldId);
                const label = field?.title || yConfig.fieldId;
                config[label] = {
                    label,
                    color: yConfig.color || currentColors[index % currentColors.length],
                };
            });
        }

        return config;
    }, [chartConfig, fieldMap, pieChartData, currentColors]);

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
        yAxisProps,
        chartError
    };
};