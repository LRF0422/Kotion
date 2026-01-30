import React, { useState } from "react";
import {
    Card,
    CardContent,
    CardHeader,
    CardDescription,
    Button,
    ChartContainer,
    cn,
    Badge,
    Separator,
} from "@kn/ui";
import {
    Settings, BarChart3,
    PieChart as PieChartIcon, LineChart as LineChartIcon, AreaChart as AreaChartIcon,
    CircleDot, Target, Layers, Maximize2, X,
    Activity,
    Circle,
} from "@kn/icon";
import { useTranslation } from "@kn/common";
import { FieldConfig, RecordData, ViewConfig, ChartType, YAxisConfig } from "../../types";
import { useChartData } from "../hooks/useChartData";
import { ChartConfigPanel } from "./config-panel/ChartConfigPanel";
import { BarChartComponent } from "../charts/BarChartComponent";
import { LineChartComponent } from "../charts/LineChartComponent";
import { PieChartComponent } from "../charts/PieChartComponent";
import { AreaChartComponent } from "../charts/AreaChartComponent";
import { RadarChartComponent } from "../charts/RadarChartComponent";
import { ScatterChartComponent } from "../charts/ScatterChartComponent";
import { RadialBarChartComponent } from "../charts/RadialBarChartComponent";

interface ChartViewProps {
    view: ViewConfig;
    fields: FieldConfig[];
    data: RecordData[];
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
    editable: boolean;
}

export const ChartView: React.FC<ChartViewProps> = (props) => {
    const { view, fields, data, onUpdateView, editable } = props;
    const { t } = useTranslation();
    const [configOpen, setConfigOpen] = useState(false);
    const [activeConfigTab, setActiveConfigTab] = useState('basic');
    const [isFullscreen, setIsFullscreen] = useState(false);

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

    // 使用自定义钩子获取处理后的数据
    const {
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
    } = useChartData(view, fields, data);

    // 获取图表类型图标
    const getChartTypeIcon = (type: ChartType) => {
        switch (type) {
            case ChartType.BAR:
            case ChartType.STACKED_BAR:
                return <BarChart3 className="h-4 w-4" />;
            case ChartType.LINE:
                return <LineChartIcon className="h-4 w-4" />;
            case ChartType.PIE:
            case ChartType.DONUT:
                return <PieChartIcon className="h-4 w-4" />;
            case ChartType.AREA:
            case ChartType.STACKED_AREA:
                return <AreaChartIcon className="h-4 w-4" />;
            case ChartType.RADAR:
                return <Target className="h-4 w-4" />;
            case ChartType.SCATTER:
                return <CircleDot className="h-4 w-4" />;
            case ChartType.RADIAL_BAR:
                return <Activity className="h-4 w-4" />;
            default:
                return <BarChart3 className="h-4 w-4" />;
        }
    };

    // 更新图表配置
    const updateChartConfig = (updates: Partial<typeof chartConfig>) => {
        onUpdateView(view.id, {
            chartConfig: { ...chartConfig, ...updates },
        });
    };







    // 渲染图表
    const renderChart = () => {
        if (!chartConfig.xAxisField) {
            return (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
                    <BarChart3 className="h-12 w-12 opacity-20" />
                    <span>{t('bitable.chartView.selectXAxis')}</span>
                </div>
            );
        }

        const isPieType = [ChartType.PIE, ChartType.DONUT, ChartType.RADIAL_BAR].includes(chartConfig.chartType);

        if (!isPieType &&
            chartConfig.chartType !== ChartType.RADAR &&
            chartConfig.yAxisFields.length === 0 &&
            chartConfig.aggregation !== 'count') {
            return (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
                    <BarChart3 className="h-12 w-12 opacity-20" />
                    <span>{t('bitable.chartView.selectYAxis')}</span>
                </div>
            );
        }

        const chartHeight = chartConfig.chartHeight || 300;

        switch (chartConfig.chartType) {
            case ChartType.BAR:
            case ChartType.STACKED_BAR:
                return (
                    <BarChartComponent
                        view={view}
                        fields={fields}
                        data={data}
                        chartData={chartData}
                        rechartsConfig={rechartsConfig}
                        currentColors={currentColors}
                        yAxisProps={yAxisProps}
                        formatYAxisTick={formatYAxisTick}
                        height={chartHeight}
                    />
                );

            case ChartType.LINE:
                return (
                    <LineChartComponent
                        view={view}
                        data={data}
                        chartData={chartData}
                        rechartsConfig={rechartsConfig}
                        currentColors={currentColors}
                        yAxisProps={yAxisProps}
                        formatYAxisTick={formatYAxisTick}
                        height={chartHeight}
                    />
                );

            case ChartType.PIE:
                return (
                    <PieChartComponent
                        view={view}
                        pieChartData={pieChartData}
                        rechartsConfig={rechartsConfig}
                        currentColors={currentColors}
                        height={chartHeight}
                        isDonut={false}
                    />
                );

            case ChartType.DONUT:
                return (
                    <PieChartComponent
                        view={view}
                        pieChartData={pieChartData}
                        rechartsConfig={rechartsConfig}
                        currentColors={currentColors}
                        height={chartHeight}
                        isDonut={true}
                    />
                );

            case ChartType.AREA:
            case ChartType.STACKED_AREA:
                return (
                    <AreaChartComponent
                        view={view}
                        chartData={chartData}
                        rechartsConfig={rechartsConfig}
                        currentColors={currentColors}
                        yAxisProps={yAxisProps}
                        formatYAxisTick={formatYAxisTick}
                        height={chartHeight}
                    />
                );

            case ChartType.RADAR:
                return (
                    <RadarChartComponent
                        view={view}
                        fields={fields}
                        radarChartData={radarChartData}
                        rechartsConfig={rechartsConfig}
                        currentColors={currentColors}
                        height={chartHeight}
                    />
                );

            case ChartType.SCATTER:
                if (chartConfig.yAxisFields.length < 2) {
                    return (
                        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
                            <CircleDot className="h-12 w-12 opacity-20" />
                            <span>{t('bitable.chartView.scatterNeedsTwoFields')}</span>
                        </div>
                    );
                }
                return (
                    <ScatterChartComponent
                        view={view}
                        fields={fields}
                        scatterChartData={scatterChartData}
                        rechartsConfig={rechartsConfig}
                        currentColors={currentColors}
                        height={chartHeight}
                    />
                );

            case ChartType.RADIAL_BAR:
                return (
                    <RadialBarChartComponent
                        view={view}
                        radialBarData={radialBarData}
                        rechartsConfig={rechartsConfig}
                        currentColors={currentColors}
                        height={chartHeight}
                    />
                );

            default:
                return null;
        }
    };

    return (
        <div className={cn("relative", isFullscreen && "fixed inset-0 z-50 bg-background p-4")}>
            <Card className={cn(isFullscreen && "h-full flex flex-col")}>
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <div className="flex-1">
                            {chartConfig.title ? (
                                <h3 className="text-lg font-semibold">{chartConfig.title}</h3>
                            ) : (
                                <div className="flex items-center gap-2">
                                    {getChartTypeIcon(chartConfig.chartType)}
                                    <span className="text-sm text-muted-foreground">
                                        {t(`bitable.chartView.${chartConfig.chartType}Chart`)}
                                    </span>
                                </div>
                            )}
                            {chartConfig.description && (
                                <CardDescription>{chartConfig.description}</CardDescription>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            {/* 数据统计徽章 */}
                            {dataStats.total > 0 && (
                                <div className="hidden sm:flex items-center gap-2 mr-2">
                                    <Badge variant="secondary" className="text-xs">
                                        {dataStats.total} {t('bitable.chartView.records')}
                                    </Badge>
                                    <Badge variant="secondary" className="text-xs">
                                        {dataStats.categories} {t('bitable.chartView.categories')}
                                    </Badge>
                                </div>
                            )}
                            {/* 全屏按钮 */}
                            <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setIsFullscreen(!isFullscreen)}
                            >
                                {isFullscreen ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                            </Button>
                            {editable && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setConfigOpen(!configOpen)}
                                >
                                    <Settings className="h-4 w-4 mr-1" />
                                    {t('bitable.chartView.configure')}
                                </Button>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className={cn(isFullscreen && "flex-1")}>
                    {renderChart()}
                </CardContent>
            </Card>

            {/* 配置面板 */}
            {configOpen && editable && (
                <ChartConfigPanel
                    view={view}
                    fields={fields}
                    onUpdateView={onUpdateView}
                    onClose={() => setConfigOpen(false)}
                    activeTab={activeConfigTab}
                    onTabChange={setActiveConfigTab}
                />
            )}
        </div>
    );
};
