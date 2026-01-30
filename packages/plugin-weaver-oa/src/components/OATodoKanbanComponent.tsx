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
    ScrollArea,
} from "@kn/ui";
import {
    Clock,
    CheckCircle2,
    AlertCircle,
    User,
    Calendar,
    ExternalLink,
    RefreshCw,
    ChevronRight,
    FileText,
} from "@kn/icon";

// Mock data for OA todo items
const MOCK_TODO_DATA = {
    pending: [
        {
            id: "WF-2024-001",
            title: "年度预算审批申请",
            type: "财务审批",
            applicant: "张三",
            department: "财务部",
            submitTime: "2024-01-15 09:30",
            urgency: "high",
            currentNode: "部门经理审批",
        },
        {
            id: "WF-2024-002",
            title: "新员工入职流程",
            type: "人事流程",
            applicant: "李四",
            department: "人力资源部",
            submitTime: "2024-01-15 10:15",
            urgency: "normal",
            currentNode: "IT设备申请",
        },
        {
            id: "WF-2024-003",
            title: "项目立项申请",
            type: "项目管理",
            applicant: "王五",
            department: "研发部",
            submitTime: "2024-01-14 16:45",
            urgency: "high",
            currentNode: "技术评审",
        },
    ],
    inProgress: [
        {
            id: "WF-2024-004",
            title: "合同签署审批",
            type: "合同管理",
            applicant: "赵六",
            department: "销售部",
            submitTime: "2024-01-13 14:20",
            urgency: "normal",
            currentNode: "法务审核",
            progress: 60,
        },
        {
            id: "WF-2024-005",
            title: "出差报销申请",
            type: "费用报销",
            applicant: "钱七",
            department: "市场部",
            submitTime: "2024-01-12 11:00",
            urgency: "low",
            currentNode: "财务复核",
            progress: 80,
        },
    ],
    completed: [
        {
            id: "WF-2024-006",
            title: "办公用品采购",
            type: "采购流程",
            applicant: "孙八",
            department: "行政部",
            submitTime: "2024-01-10 09:00",
            completedTime: "2024-01-12 16:30",
            urgency: "low",
        },
        {
            id: "WF-2024-007",
            title: "会议室预定申请",
            type: "行政事务",
            applicant: "周九",
            department: "研发部",
            submitTime: "2024-01-11 13:45",
            completedTime: "2024-01-11 14:00",
            urgency: "normal",
        },
    ],
};

interface TodoItem {
    id: string;
    title: string;
    type: string;
    applicant: string;
    department: string;
    submitTime: string;
    urgency: string;
    currentNode?: string;
    progress?: number;
    completedTime?: string;
}

const UrgencyBadge: React.FC<{ urgency: string }> = ({ urgency }) => {
    const variants: Record<string, { className: string; label: string }> = {
        high: { className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", label: "紧急" },
        normal: { className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", label: "普通" },
        low: { className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", label: "低" },
    };
    const variant = variants[urgency] || variants.normal;
    return <Badge className={cn("text-xs", variant.className)}>{variant.label}</Badge>;
};

const TodoCard: React.FC<{ item: TodoItem; status: string }> = ({ item, status }) => {
    return (
        <div className="p-3 bg-background rounded-lg border border-border hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer mb-2">
            <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className="text-sm font-medium line-clamp-1 flex-1">{item.title}</h4>
                <UrgencyBadge urgency={item.urgency} />
            </div>
            <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                    <FileText className="h-3 w-3" />
                    <span>{item.type}</span>
                    <span className="text-muted-foreground/50">|</span>
                    <span>{item.id}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <User className="h-3 w-3" />
                    <span>{item.applicant}</span>
                    <span className="text-muted-foreground/50">·</span>
                    <span>{item.department}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    <span>{item.submitTime}</span>
                </div>
                {item.currentNode && (
                    <div className="flex items-center gap-1.5 text-primary">
                        <ChevronRight className="h-3 w-3" />
                        <span>当前节点: {item.currentNode}</span>
                    </div>
                )}
                {item.progress !== undefined && (
                    <div className="mt-2">
                        <div className="flex items-center justify-between mb-1">
                            <span>进度</span>
                            <span>{item.progress}%</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ width: `${item.progress}%` }}
                            />
                        </div>
                    </div>
                )}
                {item.completedTime && (
                    <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>完成于: {item.completedTime}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

const KanbanColumn: React.FC<{
    title: string;
    icon: React.ReactNode;
    items: TodoItem[];
    status: string;
    count: number;
    headerColor: string;
}> = ({ title, icon, items, status, count, headerColor }) => {
    return (
        <div className="flex-1 min-w-[280px] max-w-[320px] bg-muted/30 rounded-lg flex flex-col">
            <div className={cn("p-3 rounded-t-lg flex items-center justify-between", headerColor)}>
                <div className="flex items-center gap-2">
                    {icon}
                    <span className="font-medium text-sm">{title}</span>
                </div>
                <Badge variant="secondary" className="text-xs">
                    {count}
                </Badge>
            </div>
            <ScrollArea className="flex-1 p-2" style={{ maxHeight: "400px" }}>
                {items.map((item) => (
                    <TodoCard key={item.id} item={item} status={status} />
                ))}
                {items.length === 0 && (
                    <div className="text-center text-muted-foreground text-sm py-8">
                        暂无待办事项
                    </div>
                )}
            </ScrollArea>
        </div>
    );
};

/**
 * OA Todo Kanban Component
 *
 * Displays OA workflow todos in a kanban board format
 * Shows pending, in-progress, and completed items
 */
export const OATodoKanbanComponent: React.FC<NodeViewProps> = ({ node, updateAttributes, editor }) => {
    const { title } = node.attrs;
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [todoData, setTodoData] = useState(MOCK_TODO_DATA);

    const handleRefresh = () => {
        setIsRefreshing(true);
        // Simulate API refresh
        setTimeout(() => {
            setIsRefreshing(false);
        }, 1000);
    };

    const totalPending = todoData.pending.length;
    const totalInProgress = todoData.inProgress.length;
    const totalCompleted = todoData.completed.length;

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
                            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                                <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                                <CardTitle className="text-lg">{title || "OA流程待办看板"}</CardTitle>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    共 {totalPending + totalInProgress + totalCompleted} 项 · 待处理 {totalPending} 项
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
                                在OA中查看
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4 overflow-x-auto pb-2">
                        <KanbanColumn
                            title="待处理"
                            icon={<AlertCircle className="h-4 w-4 text-orange-600" />}
                            items={todoData.pending}
                            status="pending"
                            count={totalPending}
                            headerColor="bg-orange-100 dark:bg-orange-900/30"
                        />
                        <KanbanColumn
                            title="处理中"
                            icon={<Clock className="h-4 w-4 text-blue-600" />}
                            items={todoData.inProgress}
                            status="inProgress"
                            count={totalInProgress}
                            headerColor="bg-blue-100 dark:bg-blue-900/30"
                        />
                        <KanbanColumn
                            title="已完成"
                            icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
                            items={todoData.completed}
                            status="completed"
                            count={totalCompleted}
                            headerColor="bg-green-100 dark:bg-green-900/30"
                        />
                    </div>
                </CardContent>
            </Card>
        </NodeViewWrapper>
    );
};
