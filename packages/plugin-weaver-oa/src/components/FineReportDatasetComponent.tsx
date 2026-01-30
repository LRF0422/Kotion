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
} from "@kn/ui";
import {
    Database,
    Table,
    Search,
    RefreshCw,
    ExternalLink,
    ChevronRight,
    Filter,
    Download,
    Eye,
    BarChart3,
    Calendar,
    Hash,
    Type,
} from "@kn/icon";

// Mock datasets
const MOCK_DATASETS = [
    {
        id: "ds-001",
        name: "销售数据汇总",
        description: "包含各区域销售额、订单量、客户数等核心指标",
        category: "销售分析",
        rowCount: 15680,
        columnCount: 12,
        lastUpdated: "2024-01-15 14:30",
        status: "active",
        columns: [
            { name: "region", type: "string", label: "区域" },
            { name: "sales_amount", type: "number", label: "销售额" },
            { name: "order_count", type: "number", label: "订单数" },
            { name: "customer_count", type: "number", label: "客户数" },
            { name: "avg_order_value", type: "number", label: "客单价" },
            { name: "date", type: "date", label: "日期" },
        ],
        previewData: [
            { region: "华东", sales_amount: 1250000, order_count: 3420, customer_count: 1890, avg_order_value: 365, date: "2024-01" },
            { region: "华南", sales_amount: 980000, order_count: 2850, customer_count: 1560, avg_order_value: 344, date: "2024-01" },
            { region: "华北", sales_amount: 860000, order_count: 2340, customer_count: 1280, avg_order_value: 367, date: "2024-01" },
            { region: "西南", sales_amount: 720000, order_count: 1980, customer_count: 1050, avg_order_value: 364, date: "2024-01" },
            { region: "西北", sales_amount: 450000, order_count: 1250, customer_count: 680, avg_order_value: 360, date: "2024-01" },
        ],
    },
    {
        id: "ds-002",
        name: "员工绩效数据",
        description: "员工KPI完成情况、考勤记录、培训进度等",
        category: "人力资源",
        rowCount: 2340,
        columnCount: 15,
        lastUpdated: "2024-01-15 09:00",
        status: "active",
        columns: [
            { name: "employee_id", type: "string", label: "员工ID" },
            { name: "name", type: "string", label: "姓名" },
            { name: "department", type: "string", label: "部门" },
            { name: "kpi_score", type: "number", label: "KPI得分" },
            { name: "attendance_rate", type: "number", label: "出勤率" },
            { name: "training_hours", type: "number", label: "培训时长" },
        ],
        previewData: [
            { employee_id: "E001", name: "张三", department: "销售部", kpi_score: 95, attendance_rate: 98.5, training_hours: 24 },
            { employee_id: "E002", name: "李四", department: "研发部", kpi_score: 88, attendance_rate: 99.2, training_hours: 32 },
            { employee_id: "E003", name: "王五", department: "市场部", kpi_score: 92, attendance_rate: 97.8, training_hours: 18 },
            { employee_id: "E004", name: "赵六", department: "财务部", kpi_score: 90, attendance_rate: 100, training_hours: 16 },
            { employee_id: "E005", name: "钱七", department: "人事部", kpi_score: 87, attendance_rate: 98.0, training_hours: 20 },
        ],
    },
    {
        id: "ds-003",
        name: "财务报表数据",
        description: "收入、支出、利润、现金流等财务核心数据",
        category: "财务分析",
        rowCount: 8920,
        columnCount: 18,
        lastUpdated: "2024-01-14 18:00",
        status: "active",
        columns: [
            { name: "month", type: "date", label: "月份" },
            { name: "revenue", type: "number", label: "收入" },
            { name: "expense", type: "number", label: "支出" },
            { name: "profit", type: "number", label: "利润" },
            { name: "profit_rate", type: "number", label: "利润率" },
            { name: "cash_flow", type: "number", label: "现金流" },
        ],
        previewData: [
            { month: "2024-01", revenue: 5800000, expense: 4200000, profit: 1600000, profit_rate: 27.6, cash_flow: 1450000 },
            { month: "2023-12", revenue: 6200000, expense: 4500000, profit: 1700000, profit_rate: 27.4, cash_flow: 1580000 },
            { month: "2023-11", revenue: 5500000, expense: 4000000, profit: 1500000, profit_rate: 27.3, cash_flow: 1320000 },
            { month: "2023-10", revenue: 5100000, expense: 3800000, profit: 1300000, profit_rate: 25.5, cash_flow: 1180000 },
            { month: "2023-09", revenue: 4900000, expense: 3600000, profit: 1300000, profit_rate: 26.5, cash_flow: 1150000 },
        ],
    },
    {
        id: "ds-004",
        name: "库存动态数据",
        description: "商品库存量、周转率、预警信息等",
        category: "供应链",
        rowCount: 4560,
        columnCount: 10,
        lastUpdated: "2024-01-15 12:00",
        status: "warning",
        columns: [
            { name: "sku", type: "string", label: "SKU编码" },
            { name: "product_name", type: "string", label: "商品名称" },
            { name: "stock_qty", type: "number", label: "库存数量" },
            { name: "turnover_days", type: "number", label: "周转天数" },
            { name: "status", type: "string", label: "状态" },
        ],
        previewData: [
            { sku: "SKU-001", product_name: "产品A", stock_qty: 1500, turnover_days: 15, status: "正常" },
            { sku: "SKU-002", product_name: "产品B", stock_qty: 320, turnover_days: 8, status: "预警" },
            { sku: "SKU-003", product_name: "产品C", stock_qty: 2800, turnover_days: 25, status: "正常" },
            { sku: "SKU-004", product_name: "产品D", stock_qty: 50, turnover_days: 3, status: "紧急" },
            { sku: "SKU-005", product_name: "产品E", stock_qty: 890, turnover_days: 12, status: "正常" },
        ],
    },
];

const MOCK_CATEGORIES = ["全部", "销售分析", "人力资源", "财务分析", "供应链"];

interface Dataset {
    id: string;
    name: string;
    description: string;
    category: string;
    rowCount: number;
    columnCount: number;
    lastUpdated: string;
    status: string;
    columns: { name: string; type: string; label: string }[];
    previewData: Record<string, any>[];
}

const TypeIcon: React.FC<{ type: string }> = ({ type }) => {
    switch (type) {
        case "number":
            return <Hash className="h-3 w-3" />;
        case "date":
            return <Calendar className="h-3 w-3" />;
        default:
            return <Type className="h-3 w-3" />;
    }
};

const DatasetCard: React.FC<{
    dataset: Dataset;
    onSelect: (ds: Dataset) => void;
    isSelected: boolean;
}> = ({ dataset, onSelect, isSelected }) => {
    return (
        <div
            className={cn(
                "p-3 rounded-lg border cursor-pointer transition-all",
                isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 bg-background"
            )}
            onClick={() => onSelect(dataset)}
        >
            <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                    <Table className="h-4 w-4 text-blue-600" />
                    <h4 className="text-sm font-medium">{dataset.name}</h4>
                </div>
                <Badge
                    variant={dataset.status === "active" ? "secondary" : "destructive"}
                    className="text-xs"
                >
                    {dataset.status === "active" ? "正常" : "预警"}
                </Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-2 line-clamp-1">
                {dataset.description}
            </p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{dataset.rowCount.toLocaleString()} 行</span>
                <span>{dataset.columnCount} 列</span>
                <span>{dataset.lastUpdated}</span>
            </div>
        </div>
    );
};

const DataPreviewTable: React.FC<{ dataset: Dataset }> = ({ dataset }) => {
    return (
        <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            {dataset.columns.map((col) => (
                                <th
                                    key={col.name}
                                    className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap"
                                >
                                    <div className="flex items-center gap-1.5">
                                        <TypeIcon type={col.type} />
                                        {col.label}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {dataset.previewData.map((row, idx) => (
                            <tr key={idx} className="border-t border-border hover:bg-muted/30">
                                {dataset.columns.map((col) => (
                                    <td key={col.name} className="px-3 py-2 whitespace-nowrap">
                                        {typeof row[col.name] === "number"
                                            ? row[col.name].toLocaleString()
                                            : row[col.name]}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="px-3 py-2 bg-muted/30 text-xs text-muted-foreground border-t">
                显示前 {dataset.previewData.length} 条数据，共 {dataset.rowCount.toLocaleString()} 条
            </div>
        </div>
    );
};

/**
 * FineReport BI Dataset Viewer Component
 *
 * Displays available datasets and allows previewing data
 */
export const FineReportDatasetComponent: React.FC<NodeViewProps> = ({ node, updateAttributes, editor }) => {
    const { title } = node.attrs;
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("全部");
    const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => setIsRefreshing(false), 1000);
    };

    const filteredDatasets = MOCK_DATASETS.filter((ds) => {
        const matchesSearch =
            ds.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            ds.description.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = selectedCategory === "全部" || ds.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

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
                            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                                <Database className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div>
                                <CardTitle className="text-lg">{title || "帆软BI - 数据集"}</CardTitle>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    浏览和查看可用的数据集
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
                                在帆软中打开
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Filters */}
                    <div className="flex gap-3 mb-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="搜索数据集..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                            <SelectTrigger className="w-[140px]">
                                <Filter className="h-4 w-4 mr-2" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {MOCK_CATEGORIES.map((cat) => (
                                    <SelectItem key={cat} value={cat}>
                                        {cat}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* Dataset List */}
                        <div className="lg:col-span-1 space-y-2">
                            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                                <Table className="h-4 w-4" />
                                数据集列表 ({filteredDatasets.length})
                            </h3>
                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                                {filteredDatasets.map((ds) => (
                                    <DatasetCard
                                        key={ds.id}
                                        dataset={ds}
                                        onSelect={setSelectedDataset}
                                        isSelected={selectedDataset?.id === ds.id}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Data Preview */}
                        <div className="lg:col-span-2">
                            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                                <Eye className="h-4 w-4" />
                                数据预览
                            </h3>
                            {selectedDataset ? (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="font-medium">{selectedDataset.name}</h4>
                                            <p className="text-sm text-muted-foreground">
                                                {selectedDataset.description}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button size="sm" variant="outline">
                                                <Download className="h-4 w-4 mr-1.5" />
                                                导出
                                            </Button>
                                            <Button size="sm">
                                                <BarChart3 className="h-4 w-4 mr-1.5" />
                                                创建图表
                                            </Button>
                                        </div>
                                    </div>
                                    <DataPreviewTable dataset={selectedDataset} />
                                </div>
                            ) : (
                                <div className="h-[300px] flex items-center justify-center border rounded-lg bg-muted/30">
                                    <div className="text-center text-muted-foreground">
                                        <Table className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                        <p>选择左侧数据集查看预览</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </NodeViewWrapper>
    );
};
