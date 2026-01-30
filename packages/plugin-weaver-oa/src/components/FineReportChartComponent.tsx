import { NodeViewWrapper, NodeViewProps } from "@kn/editor";
import React, { useState } from "react";
import {
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    Button,
    Badge,
    cn,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@kn/ui";
import {
    BarChart3,
    LineChart,
    PieChart,
    TrendingUp,
    Settings,
    RefreshCw,
    ExternalLink,
    Palette,
    Database,
    Save,
    Eye,
    Plus,
} from "@kn/icon";

// Mock chart types
const CHART_TYPES = [
    { id: "bar", name: "柱状图", icon: BarChart3 },
    { id: "line", name: "折线图", icon: LineChart },
    { id: "pie", name: "饼图", icon: PieChart },
    { id: "area", name: "面积图", icon: TrendingUp },
];

// Mock data sources
const MOCK_DATA_SOURCES = [
    { id: "ds-001", name: "销售数据汇总" },
    { id: "ds-002", name: "员工绩效数据" },
    { id: "ds-003", name: "财务报表数据" },
    { id: "ds-004", name: "库存动态数据" },
];

// Mock fields for selected data source
const MOCK_FIELDS = {
    "ds-001": [
        { name: "region", label: "区域", type: "dimension" },
        { name: "date", label: "日期", type: "dimension" },
        { name: "sales_amount", label: "销售额", type: "measure" },
        { name: "order_count", label: "订单数", type: "measure" },
        { name: "customer_count", label: "客户数", type: "measure" },
    ],
    "ds-002": [
        { name: "department", label: "部门", type: "dimension" },
        { name: "name", label: "姓名", type: "dimension" },
        { name: "kpi_score", label: "KPI得分", type: "measure" },
        { name: "attendance_rate", label: "出勤率", type: "measure" },
    ],
    "ds-003": [
        { name: "month", label: "月份", type: "dimension" },
        { name: "revenue", label: "收入", type: "measure" },
        { name: "expense", label: "支出", type: "measure" },
        { name: "profit", label: "利润", type: "measure" },
    ],
    "ds-004": [
        { name: "product_name", label: "商品名称", type: "dimension" },
        { name: "status", label: "状态", type: "dimension" },
        { name: "stock_qty", label: "库存数量", type: "measure" },
        { name: "turnover_days", label: "周转天数", type: "measure" },
    ],
};

// Mock chart configurations (saved charts)
const MOCK_SAVED_CHARTS = [
    {
        id: "chart-001",
        name: "区域销售对比",
        type: "bar",
        dataSource: "ds-001",
        dimension: "region",
        measure: "sales_amount",
        lastModified: "2024-01-15 10:30",
    },
    {
        id: "chart-002",
        name: "月度收入趋势",
        type: "line",
        dataSource: "ds-003",
        dimension: "month",
        measure: "revenue",
        lastModified: "2024-01-14 16:45",
    },
    {
        id: "chart-003",
        name: "部门KPI分布",
        type: "pie",
        dataSource: "ds-002",
        dimension: "department",
        measure: "kpi_score",
        lastModified: "2024-01-13 09:20",
    },
];

// Mock chart data for preview
const MOCK_CHART_DATA = {
    bar: [
        { name: "华东", value: 1250000 },
        { name: "华南", value: 980000 },
        { name: "华北", value: 860000 },
        { name: "西南", value: 720000 },
        { name: "西北", value: 450000 },
    ],
    line: [
        { name: "1月", value: 580 },
        { name: "2月", value: 620 },
        { name: "3月", value: 550 },
        { name: "4月", value: 510 },
        { name: "5月", value: 490 },
        { name: "6月", value: 530 },
    ],
    pie: [
        { name: "销售部", value: 35 },
        { name: "研发部", value: 28 },
        { name: "市场部", value: 20 },
        { name: "财务部", value: 10 },
        { name: "其他", value: 7 },
    ],
};

// Simple chart preview components
const BarChartPreview: React.FC<{ data: { name: string; value: number }[] }> = ({ data }) => {
    const maxValue = Math.max(...data.map((d) => d.value));
    return (
        <div className="space-y-2 py-4">
            {data.map((item) => (
                <div key={item.name} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-12 text-right">{item.name}</span>
                    <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                        <div
                            className="h-full bg-blue-500 rounded transition-all"
                            style={{ width: `${(item.value / maxValue) * 100}%` }}
                        />
                    </div>
                    <span className="text-xs font-medium w-20 text-right">
                        {item.value >= 10000 ? `${(item.value / 10000).toFixed(1)}万` : item.value}
                    </span>
                </div>
            ))}
        </div>
    );
};

const LineChartPreview: React.FC<{ data: { name: string; value: number }[] }> = ({ data }) => {
    const maxValue = Math.max(...data.map((d) => d.value));
    const minValue = Math.min(...data.map((d) => d.value));
    const range = maxValue - minValue || 1;

    return (
        <div className="py-4">
            <div className="relative h-32 flex items-end justify-between gap-1 border-b border-l border-muted">
                {data.map((item, idx) => {
                    const height = ((item.value - minValue) / range) * 100 + 10;
                    return (
                        <div key={item.name} className="flex-1 flex flex-col items-center">
                            <div
                                className="w-2 bg-green-500 rounded-t transition-all"
                                style={{ height: `${height}%` }}
                            />
                        </div>
                    );
                })}
            </div>
            <div className="flex justify-between mt-1">
                {data.map((item) => (
                    <span key={item.name} className="text-xs text-muted-foreground">
                        {item.name}
                    </span>
                ))}
            </div>
        </div>
    );
};

const PieChartPreview: React.FC<{ data: { name: string; value: number }[] }> = ({ data }) => {
    const total = data.reduce((sum, d) => sum + d.value, 0);
    const colors = ["bg-blue-500", "bg-green-500", "bg-yellow-500", "bg-purple-500", "bg-pink-500"];

    return (
        <div className="py-4 flex items-center gap-6">
            <div className="w-32 h-32 rounded-full overflow-hidden relative" style={{ background: `conic-gradient(${data.map((d, i) => `${colors[i % colors.length].replace('bg-', '')} ${data.slice(0, i).reduce((s, dd) => s + dd.value, 0) / total * 360}deg ${data.slice(0, i + 1).reduce((s, dd) => s + dd.value, 0) / total * 360}deg`).join(', ')})` }}>
                <div className="absolute inset-4 bg-background rounded-full" />
            </div>
            <div className="space-y-1.5">
                {data.map((item, idx) => (
                    <div key={item.name} className="flex items-center gap-2 text-sm">
                        <div className={cn("w-3 h-3 rounded", colors[idx % colors.length])} />
                        <span className="text-muted-foreground">{item.name}</span>
                        <span className="font-medium">{((item.value / total) * 100).toFixed(1)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const ChartPreview: React.FC<{ type: string; data: { name: string; value: number }[] }> = ({ type, data }) => {
    switch (type) {
        case "bar":
            return <BarChartPreview data={data} />;
        case "line":
        case "area":
            return <LineChartPreview data={data} />;
        case "pie":
            return <PieChartPreview data={data} />;
        default:
            return <BarChartPreview data={data} />;
    }
};

/**
 * FineReport BI Chart Configuration Component
 *
 * Allows configuring and previewing BI charts
 */
export const FineReportChartComponent: React.FC<NodeViewProps> = ({ node, updateAttributes, editor }) => {
    const { title } = node.attrs;
    const [activeTab, setActiveTab] = useState("config");
    const [chartType, setChartType] = useState("bar");
    const [dataSource, setDataSource] = useState("");
    const [dimension, setDimension] = useState("");
    const [measure, setMeasure] = useState("");
    const [chartTitle, setChartTitle] = useState("新建图表");
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => setIsRefreshing(false), 1000);
    };

    const availableFields = dataSource ? (MOCK_FIELDS as Record<string, any>)[dataSource] || [] : [];
    const dimensions = availableFields.filter((f: any) => f.type === "dimension");
    const measures = availableFields.filter((f: any) => f.type === "measure");

    const previewData = MOCK_CHART_DATA[chartType as keyof typeof MOCK_CHART_DATA] || MOCK_CHART_DATA.bar;

    return (
        <NodeViewWrapper>
            <Card className={cn(
                "my-4 transition-all duration-200",
                "border-2",
                editor.isEditable && "hover:border-primary/50",
                !editor.isEditable && "border-transparent"
            )}>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                                <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div>
                                <CardTitle className="text-lg">{title || "帆软BI - 图表配置"}</CardTitle>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    配置数据源和图表类型
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={handleRefresh}
                                disabled={isRefreshing}
                            >
                                <RefreshCw className={cn("h-4 w-4 mr-1.5", isRefreshing && "animate-spin")} />
                                刷新
                            </Button>
                            <Button size="sm" variant="outline">
                                <ExternalLink className="h-4 w-4 mr-1.5" />
                                在帆软中编辑
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="mb-4">
                            <TabsTrigger value="config">
                                <Settings className="h-4 w-4 mr-1.5" />
                                图表配置
                            </TabsTrigger>
                            <TabsTrigger value="saved">
                                <Database className="h-4 w-4 mr-1.5" />
                                已保存图表
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="config">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Configuration Panel */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-sm font-medium mb-2 block">图表标题</label>
                                        <Input
                                            value={chartTitle}
                                            onChange={(e) => setChartTitle(e.target.value)}
                                            placeholder="输入图表标题"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium mb-2 block">图表类型</label>
                                        <div className="grid grid-cols-4 gap-2">
                                            {CHART_TYPES.map((ct) => {
                                                const Icon = ct.icon;
                                                return (
                                                    <button
                                                        key={ct.id}
                                                        className={cn(
                                                            "p-3 rounded-lg border text-center transition-all",
                                                            chartType === ct.id
                                                                ? "border-primary bg-primary/10"
                                                                : "border-border hover:border-primary/50"
                                                        )}
                                                        onClick={() => setChartType(ct.id)}
                                                    >
                                                        <Icon className="h-5 w-5 mx-auto mb-1" />
                                                        <span className="text-xs">{ct.name}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium mb-2 block">数据源</label>
                                        <Select value={dataSource} onValueChange={setDataSource}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="选择数据源" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {MOCK_DATA_SOURCES.map((ds) => (
                                                    <SelectItem key={ds.id} value={ds.id}>
                                                        {ds.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {dataSource && (
                                        <>
                                            <div>
                                                <label className="text-sm font-medium mb-2 block">维度字段</label>
                                                <Select value={dimension} onValueChange={setDimension}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="选择维度" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {dimensions.map((f: any) => (
                                                            <SelectItem key={f.name} value={f.name}>
                                                                {f.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div>
                                                <label className="text-sm font-medium mb-2 block">度量字段</label>
                                                <Select value={measure} onValueChange={setMeasure}>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="选择度量" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {measures.map((f: any) => (
                                                            <SelectItem key={f.name} value={f.name}>
                                                                {f.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </>
                                    )}

                                    <div className="flex gap-2 pt-2">
                                        <Button className="flex-1">
                                            <Save className="h-4 w-4 mr-1.5" />
                                            保存图表
                                        </Button>
                                        <Button variant="outline" className="flex-1">
                                            <Eye className="h-4 w-4 mr-1.5" />
                                            预览
                                        </Button>
                                    </div>
                                </div>

                                {/* Chart Preview */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-medium">图表预览</label>
                                        <Badge variant="secondary" className="text-xs">
                                            Mock数据
                                        </Badge>
                                    </div>
                                    <div className="border rounded-lg p-4 bg-muted/20 min-h-[300px]">
                                        <h4 className="text-center font-medium mb-2">{chartTitle}</h4>
                                        <ChartPreview type={chartType} data={previewData} />
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="saved">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-medium">已保存的图表</h3>
                                    <Button size="sm">
                                        <Plus className="h-4 w-4 mr-1.5" />
                                        新建图表
                                    </Button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {MOCK_SAVED_CHARTS.map((chart) => {
                                        const ChartIcon = CHART_TYPES.find((t) => t.id === chart.type)?.icon || BarChart3;
                                        return (
                                            <div
                                                key={chart.id}
                                                className="p-4 border rounded-lg hover:border-primary/50 cursor-pointer transition-all"
                                            >
                                                <div className="flex items-center gap-2 mb-2">
                                                    <ChartIcon className="h-4 w-4 text-muted-foreground" />
                                                    <h4 className="font-medium text-sm">{chart.name}</h4>
                                                </div>
                                                <div className="space-y-1 text-xs text-muted-foreground">
                                                    <p>数据源: {MOCK_DATA_SOURCES.find((ds) => ds.id === chart.dataSource)?.name}</p>
                                                    <p>更新时间: {chart.lastModified}</p>
                                                </div>
                                                <div className="flex gap-2 mt-3">
                                                    <Button size="sm" variant="outline" className="flex-1 h-7 text-xs">
                                                        编辑
                                                    </Button>
                                                    <Button size="sm" className="flex-1 h-7 text-xs">
                                                        插入
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </NodeViewWrapper>
    );
};
