import React, { useState } from "react";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Button,
    Label,
    Input,
    Switch,
    Slider,
    ScrollArea,
    Separator,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    cn
} from "@kn/ui";
import {
    BarChart3,
    PieChart as PieChartIcon,
    LineChart as LineChartIcon,
    AreaChart as AreaChartIcon,
    CircleDot,
    Target,
    Layers,
    Activity,
    Circle,
    X,
    ChevronDown,
    ChevronUp,
    Plus,
    Trash2
} from "@kn/icon";
import { useTranslation } from "@kn/common";
import { FieldConfig, ViewConfig, ChartType, FieldType, YAxisConfig } from "../../../types";

interface ChartConfigPanelProps {
    view: ViewConfig;
    fields: FieldConfig[];
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
    onClose: () => void;
    activeTab?: string;
    onTabChange?: (tab: string) => void;
}

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

export const ChartConfigPanel: React.FC<ChartConfigPanelProps> = ({
    view,
    fields,
    onUpdateView,
    onClose,
    activeTab = 'basic',
    onTabChange
}) => {
    const { t } = useTranslation();
    const [expandedYAxis, setExpandedYAxis] = useState<Record<string, boolean>>({});

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

    // 获取数值类型的字段
    const numericFields = React.useMemo(() => {
        return fields.filter(f =>
            f.type === FieldType.NUMBER ||
            f.type === FieldType.PROGRESS ||
            f.type === FieldType.RATING
        );
    }, [fields]);

    // 获取可作为X轴的字段（文本、选择、日期）
    const categoryFields = React.useMemo(() => {
        return fields.filter(f =>
            f.type === FieldType.TEXT ||
            f.type === FieldType.SELECT ||
            f.type === FieldType.DATE ||
            f.type === FieldType.ID ||
            f.type === FieldType.MULTI_SELECT
        );
    }, [fields]);

    // 更新图表配置
    const updateChartConfig = (updates: Partial<typeof chartConfig>) => {
        onUpdateView(view.id, {
            chartConfig: { ...chartConfig, ...updates },
        });
    };

    // 添加Y轴字段
    const addYAxisField = () => {
        const availableFields = numericFields.filter(
            f => !chartConfig.yAxisFields.some(y => y.fieldId === f.id)
        );
        if (availableFields.length > 0) {
            updateChartConfig({
                yAxisFields: [
                    ...chartConfig.yAxisFields,
                    {
                        fieldId: availableFields[0].id,
                        color: COLOR_SCHEMES.default[chartConfig.yAxisFields.length % COLOR_SCHEMES.default.length],
                    },
                ],
            });
        }
    };

    // 移除Y轴字段
    const removeYAxisField = (fieldId: string) => {
        updateChartConfig({
            yAxisFields: chartConfig.yAxisFields.filter(y => y.fieldId !== fieldId),
        });
    };

    // 更新Y轴字段
    const updateYAxisField = (fieldId: string, updates: Partial<YAxisConfig>) => {
        updateChartConfig({
            yAxisFields: chartConfig.yAxisFields.map(y =>
                y.fieldId === fieldId ? { ...y, ...updates } : y
            ),
        });
    };

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

    return (
        <div className="w-96 bg-background border rounded-lg shadow-lg z-50 max-h-[600px] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
                <h4 className="font-semibold">{t('bitable.chartView.chartConfig')}</h4>
                <Button size="icon" variant="ghost" onClick={onClose}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            <Tabs
                value={activeTab}
                onValueChange={onTabChange}
                className="flex-1 flex flex-col"
            >
                <TabsList className="grid w-full grid-cols-3 px-4 pt-2">
                    <TabsTrigger value="basic">{t('bitable.chartView.basic')}</TabsTrigger>
                    <TabsTrigger value="data">{t('bitable.chartView.data')}</TabsTrigger>
                    <TabsTrigger value="style">{t('bitable.chartView.style')}</TabsTrigger>
                </TabsList>

                <ScrollArea className="flex-1 px-4 py-2">
                    {/* 基础配置选项卡 */}
                    <TabsContent value="basic" className="mt-0 space-y-4 p-1">
                        {/* 图表类型 */}
                        <div className="space-y-2">
                            <Label>{t('bitable.chartView.chartType')}</Label>
                            <Select
                                value={chartConfig.chartType}
                                onValueChange={(value: ChartType) => updateChartConfig({ chartType: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ChartType.BAR}>
                                        <div className="flex items-center gap-2">
                                            {getChartTypeIcon(ChartType.BAR)}
                                            {t('bitable.chartView.barChart')}
                                        </div>
                                    </SelectItem>
                                    <SelectItem value={ChartType.STACKED_BAR}>
                                        <div className="flex items-center gap-2">
                                            <Layers className="h-4 w-4" />
                                            {t('bitable.chartView.stackedBarChart')}
                                        </div>
                                    </SelectItem>
                                    <SelectItem value={ChartType.LINE}>
                                        <div className="flex items-center gap-2">
                                            {getChartTypeIcon(ChartType.LINE)}
                                            {t('bitable.chartView.lineChart')}
                                        </div>
                                    </SelectItem>
                                    <SelectItem value={ChartType.AREA}>
                                        <div className="flex items-center gap-2">
                                            {getChartTypeIcon(ChartType.AREA)}
                                            {t('bitable.chartView.areaChart')}
                                        </div>
                                    </SelectItem>
                                    <SelectItem value={ChartType.STACKED_AREA}>
                                        <div className="flex items-center gap-2">
                                            <Layers className="h-4 w-4" />
                                            {t('bitable.chartView.stackedAreaChart')}
                                        </div>
                                    </SelectItem>
                                    <SelectItem value={ChartType.PIE}>
                                        <div className="flex items-center gap-2">
                                            {getChartTypeIcon(ChartType.PIE)}
                                            {t('bitable.chartView.pieChart')}
                                        </div>
                                    </SelectItem>
                                    <SelectItem value={ChartType.DONUT}>
                                        <div className="flex items-center gap-2">
                                            <Circle className="h-4 w-4" />
                                            {t('bitable.chartView.donutChart')}
                                        </div>
                                    </SelectItem>
                                    <SelectItem value={ChartType.RADAR}>
                                        <div className="flex items-center gap-2">
                                            <Target className="h-4 w-4" />
                                            {t('bitable.chartView.radarChart')}
                                        </div>
                                    </SelectItem>
                                    <SelectItem value={ChartType.SCATTER}>
                                        <div className="flex items-center gap-2">
                                            <CircleDot className="h-4 w-4" />
                                            {t('bitable.chartView.scatterChart')}
                                        </div>
                                    </SelectItem>
                                    <SelectItem value={ChartType.RADIAL_BAR}>
                                        <div className="flex items-center gap-2">
                                            <Activity className="h-4 w-4" />
                                            {t('bitable.chartView.radialBarChart')}
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* 标题 */}
                        <div className="space-y-2">
                            <Label>{t('bitable.chartView.title')}</Label>
                            <Input
                                value={chartConfig.title || ''}
                                onChange={(e) => updateChartConfig({ title: e.target.value })}
                                placeholder={t('bitable.chartView.titlePlaceholder')}
                            />
                        </div>

                        {/* 描述 */}
                        <div className="space-y-2">
                            <Label>{t('bitable.chartView.description')}</Label>
                            <Input
                                value={chartConfig.description || ''}
                                onChange={(e) => updateChartConfig({ description: e.target.value })}
                                placeholder={t('bitable.chartView.descriptionPlaceholder')}
                            />
                        </div>
                    </TabsContent>

                    {/* 数据配置选项卡 */}
                    <TabsContent value="data" className="mt-0 space-y-4">
                        <ScrollArea className="h-[400px] pr-3">
                            {/* X轴字段 */}
                            <div className="space-y-2">
                                <Label>{t('bitable.chartView.xAxis')}</Label>
                                <Select
                                    value={chartConfig.xAxisField}
                                    onValueChange={(value) => updateChartConfig({ xAxisField: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('bitable.chartView.selectField')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {categoryFields.map((field) => (
                                            <SelectItem key={field.id} value={field.id}>
                                                {field.title}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* 聚合方式 */}
                            <div className="space-y-2">
                                <Label>{t('bitable.chartView.aggregation')}</Label>
                                <Select
                                    value={chartConfig.aggregation || 'sum'}
                                    onValueChange={(value: any) => updateChartConfig({ aggregation: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="sum">{t('bitable.chartView.sum')}</SelectItem>
                                        <SelectItem value="count">{t('bitable.chartView.count')}</SelectItem>
                                        <SelectItem value="avg">{t('bitable.chartView.average')}</SelectItem>
                                        <SelectItem value="min">{t('bitable.chartView.min')}</SelectItem>
                                        <SelectItem value="max">{t('bitable.chartView.max')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Y轴字段配置 */}
                            {chartConfig.aggregation !== 'count' && (
                                <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm font-medium">{t('bitable.chartView.yAxisConfig')}</Label>
                                        <Button size="sm" variant="outline" onClick={addYAxisField}>
                                            <Plus className="h-3 w-3 mr-1" />
                                            {t('bitable.actions.add')}
                                        </Button>
                                    </div>

                                    {chartConfig.yAxisFields.length === 0 ? (
                                        <div className="text-sm text-muted-foreground py-2">
                                            {t('bitable.chartView.noYAxisField')}
                                        </div>
                                    ) : (
                                        <ScrollArea className="max-h-[400px] pr-3">
                                            <div className="space-y-3">
                                                {chartConfig.yAxisFields.map((yConfig, index) => {
                                                    const field = fields.find(f => f.id === yConfig.fieldId);
                                                    const isExpanded = expandedYAxis[yConfig.fieldId] ?? (index === 0);
                                                    return (
                                                        <div key={yConfig.fieldId} className="p-2 bg-background rounded border space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <Button
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    className="h-8 w-8 shrink-0"
                                                                    onClick={() => setExpandedYAxis(prev => ({
                                                                        ...prev,
                                                                        [yConfig.fieldId]: !isExpanded
                                                                    }))}
                                                                >
                                                                    {isExpanded ? (
                                                                        <ChevronDown className="h-4 w-4" />
                                                                    ) : (
                                                                        <ChevronUp className="h-4 w-4" />
                                                                    )}
                                                                </Button>
                                                                <Select
                                                                    value={yConfig.fieldId}
                                                                    onValueChange={(value) => {
                                                                        const newYFields = [...chartConfig.yAxisFields];
                                                                        newYFields[index] = { ...newYFields[index], fieldId: value };
                                                                        updateChartConfig({ yAxisFields: newYFields });
                                                                    }}
                                                                >
                                                                    <SelectTrigger className="flex-1 h-8">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        {numericFields.map((field) => (
                                                                            <SelectItem key={field.id} value={field.id}>
                                                                                {field.title}
                                                                            </SelectItem>
                                                                        ))}
                                                                    </SelectContent>
                                                                </Select>
                                                                <div className="relative">
                                                                    <Input
                                                                        type="color"
                                                                        value={yConfig.color || COLOR_SCHEMES.default[index % COLOR_SCHEMES.default.length]}
                                                                        onChange={(e) => updateYAxisField(yConfig.fieldId, { color: e.target.value })}
                                                                        className="w-10 h-8 p-0 border-2 cursor-pointer"
                                                                        title={t('bitable.chartView.selectColor') || 'Select color'}
                                                                    />
                                                                </div>
                                                                <Button
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    className="h-8 w-8"
                                                                    onClick={() => removeYAxisField(yConfig.fieldId)}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </div>

                                                            {/* Y轴高级配置 - 仅显示第一个字段的详细配置 */}
                                                            {index === 0 && isExpanded && (
                                                                <div className="pt-2 border-t space-y-2">
                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <div className="space-y-1">
                                                                            <Label className="text-xs text-muted-foreground">{t('bitable.chartView.yAxisMin')}</Label>
                                                                            <Input
                                                                                type="number"
                                                                                value={chartConfig.yAxisConfig?.min ?? ''}
                                                                                onChange={(e) => updateChartConfig({
                                                                                    yAxisConfig: {
                                                                                        ...chartConfig.yAxisConfig,
                                                                                        min: e.target.value ? Number(e.target.value) : undefined
                                                                                    }
                                                                                })}
                                                                                placeholder={t('bitable.chartView.auto')}
                                                                                className="h-7 text-xs"
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-1">
                                                                            <Label className="text-xs text-muted-foreground">{t('bitable.chartView.yAxisMax')}</Label>
                                                                            <Input
                                                                                type="number"
                                                                                value={chartConfig.yAxisConfig?.max ?? ''}
                                                                                onChange={(e) => updateChartConfig({
                                                                                    yAxisConfig: {
                                                                                        ...chartConfig.yAxisConfig,
                                                                                        max: e.target.value ? Number(e.target.value) : undefined
                                                                                    }
                                                                                })}
                                                                                placeholder={t('bitable.chartView.auto')}
                                                                                className="h-7 text-xs"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="space-y-1">
                                                                        <Label className="text-xs text-muted-foreground">{t('bitable.chartView.tickFormatter')}</Label>
                                                                        <Select
                                                                            value={chartConfig.yAxisConfig?.tickFormatter || 'number'}
                                                                            onValueChange={(value: any) => updateChartConfig({
                                                                                yAxisConfig: { ...chartConfig.yAxisConfig, tickFormatter: value }
                                                                            })}
                                                                        >
                                                                            <SelectTrigger className="h-7 text-xs">
                                                                                <SelectValue />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                <SelectItem value="number">{t('bitable.chartView.formatNumber')}</SelectItem>
                                                                                <SelectItem value="percent">{t('bitable.chartView.formatPercent')}</SelectItem>
                                                                                <SelectItem value="currency">{t('bitable.chartView.formatCurrency')}</SelectItem>
                                                                                <SelectItem value="compact">{t('bitable.chartView.formatCompact')}</SelectItem>
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </ScrollArea>
                                    )}
                                </div>
                            )}

                            <Separator />

                            {/* 排序方式 */}
                            <div className="space-y-2">
                                <Label>{t('bitable.chartView.sortOrder')}</Label>
                                <Select
                                    value={chartConfig.sortOrder || 'none'}
                                    onValueChange={(value: any) => updateChartConfig({ sortOrder: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">{t('bitable.chartView.sortNone')}</SelectItem>
                                        <SelectItem value="asc">{t('bitable.chartView.sortAsc')}</SelectItem>
                                        <SelectItem value="desc">{t('bitable.chartView.sortDesc')}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Top N */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label>{t('bitable.chartView.topN')}</Label>
                                    <span className="text-sm text-muted-foreground">
                                        {chartConfig.topN ? chartConfig.topN : t('bitable.chartView.all')}
                                    </span>
                                </div>
                                <Slider
                                    value={[chartConfig.topN || 0]}
                                    onValueChange={(value) => updateChartConfig({ topN: value[0] })}
                                    max={20}
                                    step={1}
                                    className="w-full"
                                />
                            </div>
                        </ScrollArea>
                    </TabsContent>

                    {/* 样式配置选项卡 */}
                    <TabsContent value="style" className="mt-0 space-y-4">
                        {/* 图表高度 */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>{t('bitable.chartView.chartHeight')}</Label>
                                <span className="text-sm text-muted-foreground">{chartConfig.chartHeight || 300}px</span>
                            </div>
                            <Slider
                                value={[chartConfig.chartHeight || 300]}
                                onValueChange={(value) => updateChartConfig({ chartHeight: value[0] })}
                                min={200}
                                max={600}
                                step={50}
                                className="w-full"
                            />
                        </div>

                        {/* 配色方案 */}
                        <div className="space-y-2">
                            <Label>{t('bitable.chartView.colorScheme')}</Label>
                            <Select
                                value={chartConfig.colorScheme || 'default'}
                                onValueChange={(value: any) => updateChartConfig({ colorScheme: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="default">
                                        <div className="flex items-center gap-2">
                                            <div className="flex">
                                                {COLOR_SCHEMES.default.slice(0, 4).map((c, i) => (
                                                    <div key={i} className="w-3 h-3" style={{ backgroundColor: c }} />
                                                ))}
                                            </div>
                                            {t('bitable.chartView.colorDefault')}
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="warm">
                                        <div className="flex items-center gap-2">
                                            <div className="flex">
                                                {COLOR_SCHEMES.warm.slice(0, 4).map((c, i) => (
                                                    <div key={i} className="w-3 h-3" style={{ backgroundColor: c }} />
                                                ))}
                                            </div>
                                            {t('bitable.chartView.colorWarm')}
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="cool">
                                        <div className="flex items-center gap-2">
                                            <div className="flex">
                                                {COLOR_SCHEMES.cool.slice(0, 4).map((c, i) => (
                                                    <div key={i} className="w-3 h-3" style={{ backgroundColor: c }} />
                                                ))}
                                            </div>
                                            {t('bitable.chartView.colorCool')}
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="monochrome">
                                        <div className="flex items-center gap-2">
                                            <div className="flex">
                                                {COLOR_SCHEMES.monochrome.slice(0, 4).map((c, i) => (
                                                    <div key={i} className="w-3 h-3" style={{ backgroundColor: c }} />
                                                ))}
                                            </div>
                                            {t('bitable.chartView.colorMonochrome')}
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <Separator />

                        {/* 显示选项 */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label>{t('bitable.chartView.showLegend')}</Label>
                                <Switch
                                    checked={chartConfig.showLegend}
                                    onCheckedChange={(checked) => updateChartConfig({ showLegend: checked })}
                                />
                            </div>

                            {![ChartType.PIE, ChartType.DONUT, ChartType.RADIAL_BAR, ChartType.RADAR].includes(chartConfig.chartType) && (
                                <>
                                    <div className="flex items-center justify-between">
                                        <Label>{t('bitable.chartView.showGrid')}</Label>
                                        <Switch
                                            checked={chartConfig.showGrid}
                                            onCheckedChange={(checked) => updateChartConfig({ showGrid: checked })}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <Label>{t('bitable.chartView.showYAxis')}</Label>
                                        <Switch
                                            checked={chartConfig.showYAxis !== false}
                                            onCheckedChange={(checked) => updateChartConfig({ showYAxis: checked })}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <Label>{t('bitable.chartView.showDataLabels')}</Label>
                                        <Switch
                                            checked={chartConfig.showDataLabels}
                                            onCheckedChange={(checked) => updateChartConfig({ showDataLabels: checked })}
                                        />
                                    </div>
                                </>
                            )}

                            <div className="flex items-center justify-between">
                                <Label>{t('bitable.chartView.enableAnimation')}</Label>
                                <Switch
                                    checked={chartConfig.enableAnimation !== false}
                                    onCheckedChange={(checked) => updateChartConfig({ enableAnimation: checked })}
                                />
                            </div>
                        </div>

                        {/* 条形图特有选项 */}
                        {[ChartType.BAR, ChartType.STACKED_BAR].includes(chartConfig.chartType) && (
                            <>
                                <Separator />
                                <div className="flex items-center justify-between">
                                    <Label>{t('bitable.chartView.horizontalBar')}</Label>
                                    <Switch
                                        checked={chartConfig.isHorizontal}
                                        onCheckedChange={(checked) => updateChartConfig({ isHorizontal: checked })}
                                    />
                                </div>
                            </>
                        )}

                        {/* 折线图/面积图特有选项 */}
                        {[ChartType.LINE, ChartType.AREA, ChartType.STACKED_AREA].includes(chartConfig.chartType) && (
                            <>
                                <Separator />
                                <div className="flex items-center justify-between">
                                    <Label>{t('bitable.chartView.smoothLine')}</Label>
                                    <Switch
                                        checked={chartConfig.smoothLine !== false}
                                        onCheckedChange={(checked) => updateChartConfig({ smoothLine: checked })}
                                    />
                                </div>
                            </>
                        )}

                        {/* 饼图/甘圈图特有选项 */}
                        {[ChartType.PIE, ChartType.DONUT, ChartType.RADIAL_BAR].includes(chartConfig.chartType) && (
                            <>
                                <Separator />
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label>{t('bitable.chartView.innerRadius')}</Label>
                                        <span className="text-sm text-muted-foreground">{chartConfig.innerRadius || 60}</span>
                                    </div>
                                    <Slider
                                        value={[chartConfig.innerRadius || 60]}
                                        onValueChange={(value) => updateChartConfig({ innerRadius: value[0] })}
                                        min={0}
                                        max={100}
                                        step={5}
                                        className="w-full"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label>{t('bitable.chartView.outerRadius')}</Label>
                                        <span className="text-sm text-muted-foreground">{chartConfig.outerRadius || 100}</span>
                                    </div>
                                    <Slider
                                        value={[chartConfig.outerRadius || 100]}
                                        onValueChange={(value) => updateChartConfig({ outerRadius: value[0] })}
                                        min={50}
                                        max={150}
                                        step={5}
                                        className="w-full"
                                    />
                                </div>
                            </>
                        )}
                    </TabsContent>
                </ScrollArea>
            </Tabs>
        </div>
    );
};