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
} from "@kn/ui";
import {
    Play,
    FileText,
    DollarSign,
    Users,
    Briefcase,
    ShoppingCart,
    Building,
    Calendar,
    Search,
    Star,
    Clock,
    ChevronRight,
    Plus,
} from "@kn/icon";

// Mock data for workflow categories and templates
const MOCK_WORKFLOW_CATEGORIES = [
    {
        id: "finance",
        name: "财务审批",
        icon: DollarSign,
        color: "text-green-600 dark:text-green-400",
        bgColor: "bg-green-100 dark:bg-green-900/30",
        workflows: [
            { id: "fin-001", name: "费用报销申请", description: "日常费用报销流程", popular: true, avgTime: "2-3天" },
            { id: "fin-002", name: "借款申请", description: "个人或项目借款", popular: false, avgTime: "1-2天" },
            { id: "fin-003", name: "预算申请", description: "部门预算申请流程", popular: true, avgTime: "3-5天" },
            { id: "fin-004", name: "付款申请", description: "对外付款审批", popular: false, avgTime: "2-3天" },
        ],
    },
    {
        id: "hr",
        name: "人事流程",
        icon: Users,
        color: "text-blue-600 dark:text-blue-400",
        bgColor: "bg-blue-100 dark:bg-blue-900/30",
        workflows: [
            { id: "hr-001", name: "请假申请", description: "年假、事假、病假等", popular: true, avgTime: "1天" },
            { id: "hr-002", name: "加班申请", description: "加班审批流程", popular: true, avgTime: "1天" },
            { id: "hr-003", name: "出差申请", description: "出差审批及预算", popular: false, avgTime: "1-2天" },
            { id: "hr-004", name: "离职申请", description: "员工离职流程", popular: false, avgTime: "5-7天" },
            { id: "hr-005", name: "转正申请", description: "试用期转正", popular: false, avgTime: "3-5天" },
        ],
    },
    {
        id: "project",
        name: "项目管理",
        icon: Briefcase,
        color: "text-purple-600 dark:text-purple-400",
        bgColor: "bg-purple-100 dark:bg-purple-900/30",
        workflows: [
            { id: "proj-001", name: "项目立项申请", description: "新项目立项审批", popular: true, avgTime: "3-5天" },
            { id: "proj-002", name: "项目变更申请", description: "项目范围或预算变更", popular: false, avgTime: "2-3天" },
            { id: "proj-003", name: "项目结项申请", description: "项目结束归档", popular: false, avgTime: "3-5天" },
        ],
    },
    {
        id: "procurement",
        name: "采购流程",
        icon: ShoppingCart,
        color: "text-orange-600 dark:text-orange-400",
        bgColor: "bg-orange-100 dark:bg-orange-900/30",
        workflows: [
            { id: "proc-001", name: "采购申请", description: "物资设备采购", popular: true, avgTime: "3-5天" },
            { id: "proc-002", name: "供应商入库", description: "新供应商审批", popular: false, avgTime: "5-7天" },
            { id: "proc-003", name: "合同审批", description: "采购合同签署", popular: true, avgTime: "2-3天" },
        ],
    },
    {
        id: "admin",
        name: "行政事务",
        icon: Building,
        color: "text-gray-600 dark:text-gray-400",
        bgColor: "bg-gray-100 dark:bg-gray-900/30",
        workflows: [
            { id: "admin-001", name: "会议室预定", description: "会议室使用申请", popular: true, avgTime: "即时" },
            { id: "admin-002", name: "车辆使用申请", description: "公司车辆预约", popular: false, avgTime: "1天" },
            { id: "admin-003", name: "办公用品申请", description: "办公用品领用", popular: false, avgTime: "1-2天" },
            { id: "admin-004", name: "印章使用申请", description: "公章使用审批", popular: true, avgTime: "1天" },
        ],
    },
];

// Recently used workflows (mock)
const MOCK_RECENT_WORKFLOWS = [
    { id: "hr-001", name: "请假申请", category: "人事流程", lastUsed: "2024-01-15" },
    { id: "fin-001", name: "费用报销申请", category: "财务审批", lastUsed: "2024-01-14" },
    { id: "admin-001", name: "会议室预定", category: "行政事务", lastUsed: "2024-01-13" },
];

interface WorkflowTemplate {
    id: string;
    name: string;
    description: string;
    popular: boolean;
    avgTime: string;
}

interface WorkflowCategory {
    id: string;
    name: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgColor: string;
    workflows: WorkflowTemplate[];
}

const WorkflowCard: React.FC<{
    workflow: WorkflowTemplate;
    onStart: (id: string) => void;
}> = ({ workflow, onStart }) => {
    return (
        <div
            className="p-3 bg-background rounded-lg border border-border hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer group"
            onClick={() => onStart(workflow.id)}
        >
            <div className="flex items-start justify-between gap-2 mb-1.5">
                <h4 className="text-sm font-medium flex items-center gap-1.5">
                    {workflow.name}
                    {workflow.popular && (
                        <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                    )}
                </h4>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-xs text-muted-foreground mb-2">{workflow.description}</p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>预计耗时: {workflow.avgTime}</span>
            </div>
        </div>
    );
};

const CategorySection: React.FC<{
    category: WorkflowCategory;
    onStartWorkflow: (id: string) => void;
    isExpanded: boolean;
    onToggle: () => void;
}> = ({ category, onStartWorkflow, isExpanded, onToggle }) => {
    const IconComponent = category.icon;
    const displayedWorkflows = isExpanded ? category.workflows : category.workflows.slice(0, 3);

    return (
        <div className="mb-4">
            <div
                className="flex items-center gap-2 mb-3 cursor-pointer"
                onClick={onToggle}
            >
                <div className={cn("p-1.5 rounded-md", category.bgColor)}>
                    <IconComponent className={cn("h-4 w-4", category.color)} />
                </div>
                <h3 className="font-medium text-sm">{category.name}</h3>
                <Badge variant="secondary" className="text-xs">
                    {category.workflows.length}
                </Badge>
                <ChevronRight
                    className={cn(
                        "h-4 w-4 text-muted-foreground ml-auto transition-transform",
                        isExpanded && "rotate-90"
                    )}
                />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {displayedWorkflows.map((workflow) => (
                    <WorkflowCard
                        key={workflow.id}
                        workflow={workflow}
                        onStart={onStartWorkflow}
                    />
                ))}
            </div>
            {!isExpanded && category.workflows.length > 3 && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-xs"
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggle();
                    }}
                >
                    展开更多 ({category.workflows.length - 3})
                </Button>
            )}
        </div>
    );
};

/**
 * OA Process Initiation Component
 *
 * Provides a panel to browse and initiate OA workflows
 * Displays workflow categories and templates
 */
export const OAProcessInitComponent: React.FC<NodeViewProps> = ({ node, updateAttributes, editor }) => {
    const { title } = node.attrs;
    const [searchTerm, setSearchTerm] = useState("");
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    const handleStartWorkflow = (workflowId: string) => {
        // In real implementation, this would open the workflow form
        console.log("Starting workflow:", workflowId);
        // Mock: show alert for demo
        alert(`即将发起流程: ${workflowId}\n(这里会打开OA流程表单)`);
    };

    const toggleCategory = (categoryId: string) => {
        const newExpanded = new Set(expandedCategories);
        if (newExpanded.has(categoryId)) {
            newExpanded.delete(categoryId);
        } else {
            newExpanded.add(categoryId);
        }
        setExpandedCategories(newExpanded);
    };

    const filteredCategories = MOCK_WORKFLOW_CATEGORIES.map((cat) => ({
        ...cat,
        workflows: cat.workflows.filter(
            (wf) =>
                wf.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                wf.description.toLowerCase().includes(searchTerm.toLowerCase())
        ),
    })).filter((cat) => cat.workflows.length > 0);

    const popularWorkflows = MOCK_WORKFLOW_CATEGORIES.flatMap((cat) =>
        cat.workflows.filter((wf) => wf.popular).map((wf) => ({ ...wf, category: cat.name }))
    );

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
                            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                                <Play className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                                <CardTitle className="text-lg">{title || "OA流程发起"}</CardTitle>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    选择流程模板发起新的OA流程
                                </p>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Search Bar */}
                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="搜索流程模板..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>

                    {/* Quick Access - Recent & Popular */}
                    {!searchTerm && (
                        <div className="mb-6">
                            <div className="flex items-center gap-4 mb-3">
                                <h3 className="text-sm font-medium flex items-center gap-1.5">
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                    最近使用
                                </h3>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                {MOCK_RECENT_WORKFLOWS.map((wf) => (
                                    <Button
                                        key={wf.id}
                                        variant="outline"
                                        size="sm"
                                        className="text-xs"
                                        onClick={() => handleStartWorkflow(wf.id)}
                                    >
                                        <Plus className="h-3 w-3 mr-1" />
                                        {wf.name}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Popular Workflows */}
                    {!searchTerm && (
                        <div className="mb-6">
                            <div className="flex items-center gap-4 mb-3">
                                <h3 className="text-sm font-medium flex items-center gap-1.5">
                                    <Star className="h-4 w-4 text-yellow-500" />
                                    热门流程
                                </h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                                {popularWorkflows.slice(0, 4).map((wf) => (
                                    <div
                                        key={wf.id}
                                        className="p-2.5 bg-muted/50 rounded-lg border border-transparent hover:border-primary/50 hover:bg-background cursor-pointer transition-all"
                                        onClick={() => handleStartWorkflow(wf.id)}
                                    >
                                        <div className="text-sm font-medium">{wf.name}</div>
                                        <div className="text-xs text-muted-foreground">{wf.category}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Category Sections */}
                    <div className="border-t pt-4">
                        <h3 className="text-sm font-medium mb-4">全部流程分类</h3>
                        {filteredCategories.map((category) => (
                            <CategorySection
                                key={category.id}
                                category={category}
                                onStartWorkflow={handleStartWorkflow}
                                isExpanded={expandedCategories.has(category.id)}
                                onToggle={() => toggleCategory(category.id)}
                            />
                        ))}
                        {filteredCategories.length === 0 && (
                            <div className="text-center text-muted-foreground py-8">
                                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>未找到匹配的流程模板</p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </NodeViewWrapper>
    );
};
