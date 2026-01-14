import React, { useMemo, useState, useRef, useEffect } from "react";
import { Button, Badge } from "@kn/ui";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "@kn/icon";
import { FieldConfig, RecordData, ViewConfig, SelectOption } from "../../types";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, addMonths, subMonths, differenceInDays, isWithinInterval, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "@kn/ui";

interface TimelineViewProps {
    view: ViewConfig;
    fields: FieldConfig[];
    data: RecordData[];
    onUpdateRecord: (recordId: string, updates: Partial<RecordData>) => void;
    editable: boolean;
}

export const TimelineView: React.FC<TimelineViewProps> = (props) => {
    const { view, fields, data, onUpdateRecord, editable } = props;

    const config = view.timelineConfig || {
        startDateField: 'dueDate',
        scaleUnit: 'day' as const
    };

    const [currentDate, setCurrentDate] = useState(new Date());
    const [scaleUnit, setScaleUnit] = useState<'day' | 'week' | 'month'>(config.scaleUnit || 'day');
    const scrollRef = useRef<HTMLDivElement>(null);

    // 获取配置的字段
    const startDateField = fields.find(f => f.id === config.startDateField);
    const endDateField = config.endDateField ? fields.find(f => f.id === config.endDateField) : null;
    const titleField = config.titleField ? fields.find(f => f.id === config.titleField) : fields.find(f => f.type === 'text');
    const progressField = config.progressField ? fields.find(f => f.id === config.progressField) : fields.find(f => f.type === 'progress');
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

    // 获取分组标签
    const getGroupLabel = (groupId: string) => {
        if (groupId === 'default') return '所有任务';
        if (groupId === 'unassigned') return '未分组';
        const option = (groupByField?.options || []).find((o: SelectOption) => o.id === groupId);
        return option?.label || groupId;
    };

    // 获取分组颜色
    const getGroupColor = (groupId: string) => {
        if (groupId === 'default' || groupId === 'unassigned') return '#gray';
        const option = (groupByField?.options || []).find((o: SelectOption) => o.id === groupId);
        return option?.color || '#gray';
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

    return (
        <div className="space-y-4">
            {/* 工具栏 */}
            <div className="flex items-center justify-between">
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
                                            className="h-12 flex items-center px-4 border-b hover:bg-muted/50 transition-colors"
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

                                                return (
                                                    <div key={record.id} className="h-12 border-b relative">
                                                        <div
                                                            className="absolute top-2 h-8 rounded-md shadow-sm cursor-pointer transition-all hover:shadow-md group"
                                                            style={{
                                                                left: `${position.left}px`,
                                                                width: `${position.width}px`,
                                                                backgroundColor: getGroupColor(record[groupByField?.id || 'default']),
                                                                opacity: 0.8
                                                            }}
                                                        >
                                                            {/* 进度条 */}
                                                            {progressField && progress > 0 && (
                                                                <div
                                                                    className="absolute inset-0 rounded-md bg-black/20"
                                                                    style={{ width: `${progress}%` }}
                                                                />
                                                            )}

                                                            {/* 任务信息提示 */}
                                                            <div className="absolute inset-0 flex items-center px-2">
                                                                <span className="text-xs text-white font-medium truncate">
                                                                    {titleField ? record[titleField.id] : record.name}
                                                                </span>
                                                            </div>

                                                            {/* Hover显示详细信息 */}
                                                            <div className="absolute top-full left-0 mt-1 p-2 bg-popover border rounded-md shadow-lg z-20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
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
                                                                </div>
                                                            </div>
                                                        </div>
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
            <div className="text-xs text-muted-foreground">
                共 {validRecords.length} 个任务
                {data.length > validRecords.length && (
                    <span className="ml-2">
                        ({data.length - validRecords.length} 个任务未设置日期)
                    </span>
                )}
            </div>
        </div>
    );
};
