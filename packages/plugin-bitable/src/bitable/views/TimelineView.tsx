import React, { useMemo, useState, useRef, useCallback } from "react";
import {
    Button,
    Badge,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@kn/ui";
import { ChevronLeft, ChevronRight, Settings, X } from "@kn/icon";
import { FieldConfig, RecordData, ViewConfig, SelectOption } from "../../types";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, addMonths, subMonths, differenceInDays, isWithinInterval, parseISO, addDays } from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "@kn/ui";

interface TimelineViewProps {
    view: ViewConfig;
    fields: FieldConfig[];
    data: RecordData[];
    onUpdateRecord: (recordId: string, updates: Partial<RecordData>) => void;
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
    editable: boolean;
}

// Drag state type
type DragType = 'move' | 'resize-left' | 'resize-right' | null;

interface DragState {
    recordId: string;
    type: DragType;
    startX: number;
    originalLeft: number;
    originalWidth: number;
    originalStartDate: Date;
    originalEndDate: Date;
}

export const TimelineView: React.FC<TimelineViewProps> = (props) => {
    const { view, fields, data, onUpdateRecord, onUpdateView, editable } = props;

    // Get available field types for configuration
    const dateFields = useMemo(() => fields.filter(f => f.type === 'date'), [fields]);
    const textFields = useMemo(() => fields.filter(f => f.type === 'text'), [fields]);
    const selectFields = useMemo(() => fields.filter(f => f.type === 'select'), [fields]);
    const progressFields = useMemo(() => fields.filter(f => f.type === 'progress'), [fields]);

    // Auto-detect fields if not configured
    const autoDetectedConfig = useMemo(() => {
        return {
            startDateField: dateFields[0]?.id || '',
            endDateField: dateFields[1]?.id || undefined,
            titleField: textFields[0]?.id || undefined,
            progressField: progressFields[0]?.id || undefined,
            groupByField: selectFields[0]?.id || undefined,
            scaleUnit: 'day' as const,
        };
    }, [dateFields, textFields, selectFields, progressFields]);

    const config = useMemo(() => ({
        ...autoDetectedConfig,
        ...view.timelineConfig,
    }), [view.timelineConfig, autoDetectedConfig]);

    const [currentDate, setCurrentDate] = useState(new Date());
    const [scaleUnit, setScaleUnit] = useState<'day' | 'week' | 'month'>(config.scaleUnit || 'day');
    const [showSettings, setShowSettings] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Drag state
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [dragPreview, setDragPreview] = useState<{ left: number; width: number } | null>(null);

    // Enhanced features state
    const milestoneField = useMemo(() => config.milestoneField ? fields.find(f => f.id === config.milestoneField) : null, [config.milestoneField, fields]);
    const dependencyField = useMemo(() => config.dependencyField ? fields.find(f => f.id === config.dependencyField) : null, [config.dependencyField, fields]);

    // Handle config change
    const handleConfigChange = (key: string, value: string | boolean) => {
        const newConfig = {
            ...config,
            [key]: typeof value === 'string' && (value === 'null' || value === '') ? undefined : value
        };
        onUpdateView(view.id, { timelineConfig: newConfig });
    };

    // 获取配置的字段
    const startDateField = fields.find(f => f.id === config.startDateField);
    const endDateField = config.endDateField ? fields.find(f => f.id === config.endDateField) : null;
    const titleField = config.titleField ? fields.find(f => f.id === config.titleField) : textFields[0];
    const progressField = config.progressField ? fields.find(f => f.id === config.progressField) : progressFields[0];
    const groupByField = config.groupByField ? fields.find(f => f.id === config.groupByField) : null;

    // 计算时间范围
    const timeRange = useMemo(() => {
        const start = startOfMonth(subMonths(currentDate, 1));
        const end = endOfMonth(addMonths(currentDate, 2));
        return { start, end };
    }, [currentDate]);

    // 生成时间刻度
    const timeScale = useMemo(() => {
        const { start, end } = timeRange;

        switch (scaleUnit) {
            case 'week':
                return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
            case 'month':
                return eachMonthOfInterval({ start, end });
            default:
                return eachDayOfInterval({ start, end });
        }
    }, [timeRange, scaleUnit]);

    // 计算列宽
    const columnWidth = useMemo(() => {
        switch (scaleUnit) {
            case 'week':
                return 100;
            case 'month':
                return 120;
            default:
                return 40;
        }
    }, [scaleUnit]);

    // 计算每个像素代表的天数
    const daysPerPixel = useMemo(() => {
        switch (scaleUnit) {
            case 'week':
                return 7 / columnWidth;  // 7 days per column
            case 'month':
                return 30 / columnWidth; // ~30 days per column
            default:
                return 1 / columnWidth;  // 1 day per column
        }
    }, [scaleUnit, columnWidth]);

    // 格式化时间刻度标签
    const formatScaleLabel = (date: Date) => {
        switch (scaleUnit) {
            case 'week':
                return format(date, 'M/d', { locale: zhCN });
            case 'month':
                return format(date, 'yyyy-MM', { locale: zhCN });
            default:
                return format(date, 'd', { locale: zhCN });
        }
    };

    // 过滤有日期的记录
    const validRecords = useMemo(() => {
        return data.filter(record => {
            const startDate = record[config.startDateField];
            return startDate && startDate !== null;
        });
    }, [data, config.startDateField]);

    // 按分组字段分组
    const groupedRecords = useMemo(() => {
        if (!groupByField || groupByField.type !== 'select') {
            return { 'default': validRecords };
        }

        const groups: Record<string, RecordData[]> = {};

        (groupByField.options || []).forEach((option: SelectOption) => {
            groups[option.id] = [];
        });
        groups['unassigned'] = [];

        validRecords.forEach(record => {
            const groupValue = record[groupByField.id];
            if (groupValue && groups[groupValue]) {
                groups[groupValue].push(record);
            } else {
                groups['unassigned']?.push(record);
            }
        });

        return groups;
    }, [validRecords, groupByField]);

    // 计算任务条的位置和宽度
    const calculateBarPosition = (record: RecordData) => {
        try {
            const startDateStr = record[config.startDateField];
            if (!startDateStr) return null;

            const startDate = parseISO(startDateStr);
            const endDateStr = endDateField ? record[endDateField.id] : null;
            const endDate = endDateStr ? parseISO(endDateStr) : startDate;

            const daysSinceStart = differenceInDays(startDate, timeRange.start);
            const duration = differenceInDays(endDate, startDate) + 1;

            const left = (daysSinceStart * columnWidth);
            const width = Math.max(duration * columnWidth, columnWidth);

            return { left, width, startDate, endDate };
        } catch (error) {
            return null;
        }
    };

    // 计算里程碑位置
    const calculateMilestonePosition = (record: RecordData) => {
        try {
            const dateStr = record[config.startDateField];
            if (!dateStr) return null;

            const date = parseISO(dateStr);
            const daysSinceStart = differenceInDays(date, timeRange.start);

            const left = daysSinceStart * columnWidth;

            return { left, date };
        } catch (error) {
            return null;
        }
    };

    // 获取分组标签
    const getGroupLabel = (groupId: string) => {
        if (groupId === 'default') return '所有任务';
        if (groupId === 'unassigned') return '未分组';
        const option = (groupByField?.options || []).find((o: SelectOption) => o.id === groupId);
        return option?.label || groupId;
    };

    // 获取分组颜色
    const getGroupColor = (groupId: string) => {
        if (groupId === 'default' || groupId === 'unassigned') return '#6b7280';
        const option = (groupByField?.options || []).find((o: SelectOption) => o.id === groupId);
        return option?.color || '#6b7280';
    };

    // 获取任务条颜色（支持自定义颜色）
    const getTaskColor = (record: RecordData, groupId: string) => {
        if (config.customColorsEnabled) {
            // 如果启用了自定义颜色，尝试从记录中获取颜色字段
            const colorField = fields.find(f => f.type === 'text' && f.title.toLowerCase().includes('color'));
            if (colorField && record[colorField.id]) {
                return record[colorField.id];
            }
        }

        // 否则使用分组颜色
        return getGroupColor(record[groupByField?.id || 'default']);
    };

    // 获取依赖关系
    const getDependencies = () => {
        if (!dependencyField) return [];

        const dependencies: any[] = [];

        Object.values(groupedRecords).forEach(records => {
            records.forEach(record => {
                const dependencyValue = record[dependencyField.id];
                if (dependencyValue) {
                    // Assuming dependencyValue contains IDs of dependent tasks
                    const depIds = Array.isArray(dependencyValue) ? dependencyValue : [dependencyValue];

                    depIds.forEach(depId => {
                        const dependentRecord = data.find(r => r.id === depId);
                        if (dependentRecord) {
                            dependencies.push({
                                from: dependentRecord.id,
                                to: record.id
                            });
                        }
                    });
                }
            });
        });

        return dependencies;
    };

    // 计算依赖线路径
    const calculateDependencyPath = (fromRecordId: string, toRecordId: string) => {
        // Find positions of both tasks
        const fromRecord = data.find(r => r.id === fromRecordId);
        const toRecord = data.find(r => r.id === toRecordId);

        if (!fromRecord || !toRecord) return null;

        const fromPosition = calculateBarPosition(fromRecord);
        const toPosition = calculateBarPosition(toRecord);

        if (!fromPosition || !toPosition) return null;

        // Calculate positions for the dependency line
        const fromX = fromPosition.left + fromPosition.width; // End of the from task
        const toX = toPosition.left; // Beginning of the to task

        // Calculate Y positions based on which row each task is in
        let fromY = 0;
        let toY = 0;

        // Find the row indices for both tasks
        let rowIndex = 0;
        let foundFrom = false;
        let foundTo = false;

        for (const [groupId, records] of Object.entries(groupedRecords)) {
            for (const record of records) {
                if (record.id === fromRecordId) {
                    fromY = rowIndex * 48 + 36; // 48px per row, 36px offset for the middle of the task bar
                    foundFrom = true;
                }
                if (record.id === toRecordId) {
                    toY = rowIndex * 48 + 36; // 48px per row, 36px offset for the middle of the task bar
                    foundTo = true;
                }
                rowIndex++;

                if (foundFrom && foundTo) break;
            }
            if (foundFrom && foundTo) break;
        }

        // Create a curved path for the dependency line
        const midX = (fromX + toX) / 2;

        return `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
    };

    // 计算关键路径
    const calculateCriticalPath = (): string[] => {
        if (!config.criticalPathEnabled || !dependencyField) return [];

        // This is a simplified critical path algorithm
        // In a real implementation, you would need to compute earliest start/end times and latest start/end times
        // For now, we'll highlight tasks that have no successors (potential end tasks) and are late or have dependencies

        // Get all tasks that have dependencies
        const dependentTasks = new Set<string>();
        const dependencies = getDependencies();

        dependencies.forEach(dep => {
            dependentTasks.add(dep.to);
        });

        // For simplicity, just return tasks that are dependencies of other tasks
        // In a real critical path algorithm, we'd compute the longest path through the project
        const criticalTasks = new Set<string>();

        // Add all tasks that are dependencies of other tasks
        dependencies.forEach(dep => {
            criticalTasks.add(dep.from);
            criticalTasks.add(dep.to);
        });

        return Array.from(criticalTasks);
    };

    // Check if a task is on the critical path
    const isCriticalPathTask = (taskId: string): boolean => {
        if (!config.criticalPathEnabled) return false;
        const criticalTasks = calculateCriticalPath();
        return criticalTasks.includes(taskId);
    };

    // 导航函数
    const goToPrevious = () => {
        setCurrentDate(prev => subMonths(prev, 1));
    };

    const goToNext = () => {
        setCurrentDate(prev => addMonths(prev, 1));
    };

    const goToToday = () => {
        setCurrentDate(new Date());
    };

    // Snap to grid function
    const snapToGrid = (position: number) => {
        // Snap to nearest column width to align with day boundaries
        return Math.round(position / columnWidth) * columnWidth;
    };

    // Drag handlers
    const handleDragStart = useCallback((e: React.MouseEvent, record: RecordData, type: DragType, position: { left: number; width: number; startDate: Date; endDate: Date }) => {
        if (!editable || !type) return;
        e.preventDefault();
        e.stopPropagation();

        setDragState({
            recordId: record.id,
            type,
            startX: e.clientX,
            originalLeft: position.left,
            originalWidth: position.width,
            originalStartDate: position.startDate,
            originalEndDate: position.endDate,
        });
        setDragPreview({ left: position.left, width: position.width });
    }, [editable, columnWidth]);

    const handleDragMove = useCallback((e: React.MouseEvent) => {
        if (!dragState || !dragPreview) return;

        const deltaX = e.clientX - dragState.startX;
        let newLeft = dragPreview.left;
        let newWidth = dragPreview.width;

        switch (dragState.type) {
            case 'move':
                newLeft = dragState.originalLeft + deltaX;
                // Snap to grid if enabled
                newLeft = snapToGrid(newLeft);
                break;
            case 'resize-left':
                newLeft = dragState.originalLeft + deltaX;
                newWidth = dragState.originalWidth - deltaX;
                // Minimum width constraint
                if (newWidth < columnWidth) {
                    newWidth = columnWidth;
                    newLeft = dragState.originalLeft + dragState.originalWidth - columnWidth;
                }
                // Snap to grid if enabled
                newLeft = snapToGrid(newLeft);
                break;
            case 'resize-right':
                newWidth = dragState.originalWidth + deltaX;
                // Minimum width constraint
                if (newWidth < columnWidth) {
                    newWidth = columnWidth;
                }
                break;
        }

        setDragPreview({ left: newLeft, width: newWidth });
    }, [dragState, dragPreview, columnWidth, snapToGrid]);

    const handleDragEnd = useCallback(() => {
        if (!dragState || !dragPreview || !startDateField) {
            setDragState(null);
            setDragPreview(null);
            return;
        }

        const deltaX = dragPreview.left - dragState.originalLeft;
        const widthDelta = dragPreview.width - dragState.originalWidth;

        // Calculate day changes
        const daysDelta = Math.round(deltaX * daysPerPixel);
        const durationDelta = Math.round(widthDelta * daysPerPixel);

        const updates: Partial<RecordData> = {};

        switch (dragState.type) {
            case 'move':
                // Move both start and end dates
                const newStartDate = addDays(dragState.originalStartDate, daysDelta);
                updates[startDateField.id] = newStartDate.toISOString();
                if (endDateField) {
                    const newEndDate = addDays(dragState.originalEndDate, daysDelta);
                    updates[endDateField.id] = newEndDate.toISOString();
                }
                break;
            case 'resize-left':
                // Only change start date
                const adjustedStartDate = addDays(dragState.originalStartDate, daysDelta);
                updates[startDateField.id] = adjustedStartDate.toISOString();
                break;
            case 'resize-right':
                // Only change end date
                if (endDateField) {
                    const adjustedEndDate = addDays(dragState.originalEndDate, durationDelta);
                    updates[endDateField.id] = adjustedEndDate.toISOString();
                }
                break;
        }

        if (Object.keys(updates).length > 0) {
            onUpdateRecord(dragState.recordId, updates);
        }

        setDragState(null);
        setDragPreview(null);
    }, [dragState, dragPreview, daysPerPixel, startDateField, endDateField, onUpdateRecord]);

    // If no date fields available, show prompt
    if (dateFields.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <p className="text-lg font-medium mb-2">暂无可用日期字段</p>
                <p className="text-sm">请先添加一个日期类型的字段来使用甘特图视图</p>
            </div>
        );
    }

    // If start date field not configured, show configuration prompt
    if (!config.startDateField || !startDateField) {
        return (
            <div className="flex flex-col items-center justify-center p-8 space-y-4 text-center">
                <div className="text-muted-foreground">
                    <p className="text-lg font-medium mb-2">配置甘特图视图</p>
                    <p className="text-sm">请选择开始日期字段来显示甘特图</p>
                </div>
                <div className="w-full max-w-xs space-y-4">
                    <div className="space-y-2">
                        <Label>开始日期字段 *</Label>
                        <Select
                            value={config.startDateField || ''}
                            onValueChange={(value) => handleConfigChange('startDateField', value)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="选择日期字段" />
                            </SelectTrigger>
                            <SelectContent>
                                {dateFields.map(field => (
                                    <SelectItem key={field.id} value={field.id}>
                                        {field.title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="space-y-4"
            onMouseMove={dragState ? handleDragMove : undefined}
            onMouseUp={dragState ? handleDragEnd : undefined}
            onMouseLeave={dragState ? handleDragEnd : undefined}
        >
            {/* 设置面板 */}
            {showSettings && editable && (
                <div className="p-4 border rounded-lg bg-muted/50 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-medium">甘特图视图设置</h3>
                        <Button variant="ghost" size="sm" onClick={() => setShowSettings(false)}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>开始日期字段 *</Label>
                            <Select
                                value={config.startDateField || ''}
                                onValueChange={(value) => handleConfigChange('startDateField', value)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="选择开始日期字段" />
                                </SelectTrigger>
                                <SelectContent>
                                    {dateFields.map(field => (
                                        <SelectItem key={field.id} value={field.id}>
                                            {field.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>结束日期字段</Label>
                            <Select
                                value={config.endDateField || ''}
                                onValueChange={(value) => handleConfigChange('endDateField', value)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="选择结束日期字段（可选）" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="null">无</SelectItem>
                                    {dateFields.map(field => {
                                        console.log('field', dateFields);

                                        return (
                                            <SelectItem key={field.id} value={field.id}>
                                                {field.title}
                                            </SelectItem>
                                        )
                                    })}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>显示内容字段</Label>
                            <Select
                                value={config.titleField || ''}
                                onValueChange={(value) => handleConfigChange('titleField', value)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="选择标题字段（可选）" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="auto">自动</SelectItem>
                                    {textFields.map(field => (
                                        <SelectItem key={field.id} value={field.id}>
                                            {field.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>进度字段</Label>
                            <Select
                                value={config.progressField || ''}
                                onValueChange={(value) => handleConfigChange('progressField', value)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="选择进度字段（可选）" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="null">无</SelectItem>
                                    {progressFields.map(field => (
                                        <SelectItem key={field.id} value={field.id}>
                                            {field.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>分组字段</Label>
                            <Select
                                value={config.groupByField || ''}
                                onValueChange={(value) => handleConfigChange('groupByField', value)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="选择分组字段（可选）" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="null">无</SelectItem>
                                    {selectFields.map(field => (
                                        <SelectItem key={field.id} value={field.id}>
                                            {field.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>里程碑字段</Label>
                            <Select
                                value={config.milestoneField || ''}
                                onValueChange={(value) => handleConfigChange('milestoneField', value)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="选择里程碑字段（可选）" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="null">无</SelectItem>
                                    {selectFields.map(field => (
                                        <SelectItem key={field.id} value={field.id}>
                                            {field.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>依赖字段</Label>
                            <Select
                                value={config.dependencyField || ''}
                                onValueChange={(value) => handleConfigChange('dependencyField', value)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="选择依赖字段（可选）" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="null">无</SelectItem>
                                    {textFields.map(field => (
                                        <SelectItem key={field.id} value={field.id}>
                                            {field.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>启用关键路径</Label>
                            <Select
                                value={config.criticalPathEnabled ? 'true' : 'false'}
                                onValueChange={(value) => handleConfigChange('criticalPathEnabled', value === 'true')}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="是否启用关键路径" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="false">否</SelectItem>
                                    <SelectItem value="true">是</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>启用自定义颜色</Label>
                            <Select
                                value={config.customColorsEnabled ? 'true' : 'false'}
                                onValueChange={(value) => handleConfigChange('customColorsEnabled', value === 'true')}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="是否启用自定义颜色" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="false">否</SelectItem>
                                    <SelectItem value="true">是</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        💡 提示：甘特图会自动识别字段类型并进行适配，您也可以手动选择。
                    </p>
                </div>
            )}

            {/* 工具栏 */}
            <div className="flex items-center justify-between px-2 py-2">
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={goToPrevious}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={goToToday}>
                        今天
                    </Button>
                    <Button size="sm" variant="outline" onClick={goToNext}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-medium ml-2">
                        {format(currentDate, 'yyyy年 M月', { locale: zhCN })}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant={scaleUnit === 'day' ? 'default' : 'outline'}
                        onClick={() => setScaleUnit('day')}
                    >
                        日
                    </Button>
                    <Button
                        size="sm"
                        variant={scaleUnit === 'week' ? 'default' : 'outline'}
                        onClick={() => setScaleUnit('week')}
                    >
                        周
                    </Button>
                    <Button
                        size="sm"
                        variant={scaleUnit === 'month' ? 'default' : 'outline'}
                        onClick={() => setScaleUnit('month')}
                    >
                        月
                    </Button>
                    {editable && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowSettings(!showSettings)}
                        >
                            <Settings className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* 甘特图主体 */}
            <div className="border rounded-lg overflow-hidden bg-background">
                <div className="flex">
                    {/* 左侧任务列表 */}
                    <div className="w-64 flex-shrink-0 border-r bg-muted/30">
                        <div className="h-12 border-b flex items-center px-4 font-semibold bg-muted/50">
                            任务名称
                        </div>
                        <div className="overflow-y-auto" style={{ maxHeight: '600px' }}>
                            {Object.entries(groupedRecords).map(([groupId, records]) => (
                                <div key={groupId}>
                                    {groupByField && (
                                        <div className="h-10 flex items-center px-4 bg-muted/30 border-b font-medium text-sm">
                                            <Badge variant="outline" style={{ borderColor: getGroupColor(groupId) }}>
                                                {getGroupLabel(groupId)}
                                            </Badge>
                                            <span className="ml-2 text-muted-foreground">({records.length})</span>
                                        </div>
                                    )}
                                    {records.map((record) => (
                                        <div
                                            key={record.id}
                                            className="h-12 flex items-center px-4 py-2 border-b hover:bg-muted/50 transition-colors"
                                        >
                                            <div className="truncate text-sm">
                                                {titleField ? record[titleField.id] : record.name || record.id}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 右侧时间轴 */}
                    <div className="flex-1 overflow-x-auto" ref={scrollRef}>
                        <div style={{ minWidth: `${timeScale.length * columnWidth}px` }}>
                            {/* 时间刻度头部 */}
                            <div className="h-12 border-b flex bg-muted/50">
                                {timeScale.map((date, index) => (
                                    <div
                                        key={index}
                                        className="border-r flex items-center justify-center text-xs font-medium"
                                        style={{ width: columnWidth, minWidth: columnWidth }}
                                    >
                                        {formatScaleLabel(date)}
                                    </div>
                                ))}
                            </div>

                            {/* 任务条 */}
                            <div className="relative" style={{ minHeight: '400px' }}>
                                {/* 背景网格 */}
                                <div className="absolute inset-0 flex">
                                    {timeScale.map((date, index) => (
                                        <div
                                            key={index}
                                            className="border-r"
                                            style={{ width: columnWidth, minWidth: columnWidth }}
                                        />
                                    ))}
                                </div>

                                {/* Snap grid overlay (visible during drag) */}
                                {dragState && (
                                    <div className="absolute inset-0 flex pointer-events-none">
                                        {timeScale.map((date, index) => (
                                            <div
                                                key={`snap-${index}`}
                                                className="border-r border-dashed border-blue-300/30"
                                                style={{ width: columnWidth, minWidth: columnWidth }}
                                            />
                                        ))}
                                    </div>
                                )}

                                {/* Dependency lines */}
                                {config.dependencyField && (
                                    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5 }}>
                                        {getDependencies().map((dep, idx) => {
                                            const path = calculateDependencyPath(dep.from, dep.to);
                                            if (!path) return null;

                                            return (
                                                <path
                                                    key={idx}
                                                    d={path}
                                                    stroke="#94a3b8"
                                                    strokeWidth="2"
                                                    fill="none"
                                                    strokeDasharray="5,5"
                                                />
                                            );
                                        })}
                                    </svg>
                                )}

                                {/* 今天标记线 */}
                                {isWithinInterval(new Date(), { start: timeRange.start, end: timeRange.end }) && (
                                    <div
                                        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                                        style={{
                                            left: differenceInDays(new Date(), timeRange.start) * columnWidth
                                        }}
                                    />
                                )}

                                {/* 任务条 */}
                                <div className="relative">
                                    {Object.entries(groupedRecords).map(([groupId, records]) => (
                                        <div key={groupId}>
                                            {groupByField && (
                                                <div className="h-10 border-b" />
                                            )}
                                            {records.map((record) => {
                                                const position = calculateBarPosition(record);
                                                if (!position) return null;

                                                const progress = progressField ? (record[progressField.id] || 0) : 0;

                                                // Check if this is a milestone
                                                const isMilestone = milestoneField && record[milestoneField.id];

                                                return (
                                                    <div key={record.id} className="h-12 border-b relative py-1">
                                                        {isMilestone ? (
                                                            // Render milestone as diamond shape
                                                            <div
                                                                className={cn(
                                                                    "absolute top-1/2 transform -translate-y-1/2 w-6 h-6 rotate-45 shadow-sm transition-shadow group cursor-pointer",
                                                                    isCriticalPathTask(record.id) && "ring-2 ring-red-500"
                                                                )}
                                                                style={{
                                                                    left: `${position.left}px`,
                                                                    backgroundColor: getTaskColor(record, groupId),
                                                                    opacity: isCriticalPathTask(record.id) ? 1.0 : 0.8,
                                                                }}
                                                            >
                                                                <div className="absolute inset-0 flex items-center justify-center text-xs text-white font-bold transform -rotate-45">
                                                                    ◊
                                                                </div>

                                                                {/* Hover显示详细信息 */}
                                                                <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 p-3 bg-popover border rounded-md shadow-lg z-20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                                                                    <div className="text-xs space-y-1">
                                                                        <div className="font-semibold">
                                                                            {titleField ? record[titleField.id] : record.name}
                                                                        </div>
                                                                        <div className="text-muted-foreground">
                                                                            里程碑: {format(position.startDate, 'yyyy-MM-dd')}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            // Task bar
                                                            <div
                                                                className={cn(
                                                                    "absolute top-2 h-8 rounded-md shadow-sm transition-shadow group",
                                                                    editable && "hover:shadow-md",
                                                                    dragState?.recordId === record.id && "shadow-lg z-30",
                                                                    isCriticalPathTask(record.id) && "ring-2 ring-red-500"
                                                                )}
                                                                style={{
                                                                    left: `${dragState?.recordId === record.id && dragPreview ? dragPreview.left : position.left}px`,
                                                                    width: `${dragState?.recordId === record.id && dragPreview ? dragPreview.width : position.width}px`,
                                                                    backgroundColor: getTaskColor(record, groupId),
                                                                    opacity: dragState?.recordId === record.id ? 0.9 : (isCriticalPathTask(record.id) ? 1.0 : 0.8),
                                                                    cursor: editable ? (dragState ? 'grabbing' : 'grab') : 'default',
                                                                }}
                                                                onMouseDown={(e) => editable && handleDragStart(e, record, 'move', position)}
                                                            >
                                                                {/* Left resize handle */}
                                                                {editable && (
                                                                    <div
                                                                        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-l-md transition-colors"
                                                                        onMouseDown={(e) => {
                                                                            e.stopPropagation();
                                                                            handleDragStart(e, record, 'resize-left', position);
                                                                        }}
                                                                    />
                                                                )}

                                                                {/* Right resize handle */}
                                                                {editable && (
                                                                    <div
                                                                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-r-md transition-colors"
                                                                        onMouseDown={(e) => {
                                                                            e.stopPropagation();
                                                                            handleDragStart(e, record, 'resize-right', position);
                                                                        }}
                                                                    />
                                                                )}

                                                                {/* 进度条 */}
                                                                {progressField && progress > 0 && (
                                                                    <div
                                                                        className="absolute inset-0 rounded-md bg-black/20 pointer-events-none"
                                                                        style={{ width: `${progress}%` }}
                                                                    />
                                                                )}

                                                                {/* 任务信息提示 */}
                                                                <div className="absolute inset-0 flex items-center px-3 pointer-events-none">
                                                                    <span className="text-xs text-white font-medium truncate">
                                                                        {titleField ? record[titleField.id] : record.name}
                                                                    </span>
                                                                </div>

                                                                {/* Hover显示详细信息 */}
                                                                {!dragState && (
                                                                    <div className="absolute top-full left-0 mt-1 p-3 bg-popover border rounded-md shadow-lg z-20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                                                                        <div className="text-xs space-y-1">
                                                                            <div className="font-semibold">
                                                                                {titleField ? record[titleField.id] : record.name}
                                                                            </div>
                                                                            <div className="text-muted-foreground">
                                                                                开始: {format(position.startDate, 'yyyy-MM-dd')}
                                                                            </div>
                                                                            {endDateField && (
                                                                                <div className="text-muted-foreground">
                                                                                    结束: {format(position.endDate, 'yyyy-MM-dd')}
                                                                                </div>
                                                                            )}
                                                                            {progressField && (
                                                                                <div className="text-muted-foreground">
                                                                                    进度: {progress}%
                                                                                </div>
                                                                            )}
                                                                            {editable && (
                                                                                <div className="text-muted-foreground/70 pt-1 border-t">
                                                                                    拖动调整时间 | 边缘调整日期
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 底部说明 */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                    共 {validRecords.length} 个任务
                    {data.length > validRecords.length && (
                        <span className="ml-2">
                            ({data.length - validRecords.length} 个任务未设置日期)
                        </span>
                    )}
                </span>
                {editable && (
                    <span className="text-muted-foreground/70">
                        💡 拖动任务条调整时间，拖动边缘调整开始/结束日期
                    </span>
                )}
            </div>
        </div>
    );
};
