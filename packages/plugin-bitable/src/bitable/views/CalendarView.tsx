import React, { useMemo, useState, useRef, useEffect } from "react";
import { FieldConfig, RecordData, ViewConfig, SelectOption } from "../../types";
import { CalendarProvider } from "../components/calendar/contexts/calendar-context";
import { ClientContainer } from "../components/calendar/components/client-container";
import { IEvent, IUser } from "../components/calendar/interfaces";
import { TEventColor } from "../components/calendar/types";
import { TEventFormData } from "../components/calendar/schemas";
import { parseISO, format } from "date-fns";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Label } from "@kn/ui";
import { Settings, X } from "@kn/icon";
import { Editor } from "@kn/editor";

interface CalendarViewProps {
    view: ViewConfig;
    fields: FieldConfig[];
    data: RecordData[];
    onAddRecord: () => void;
    onUpdateRecord: (recordId: string, updates: Partial<RecordData>) => void;
    onDeleteRecord: (recordIds: string[]) => void;
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
    editable: boolean;
    editor: Editor;
}

// 预定义的颜色数组，用于给事件分配颜色
const EVENT_COLORS: TEventColor[] = ["blue", "green", "red", "yellow", "purple", "orange", "gray"];

// 默认用户
const DEFAULT_USER: IUser = {
    id: "default",
    name: "System",
    picturePath: null
};

export const CalendarView: React.FC<CalendarViewProps> = (props) => {
    const {
        view,
        fields,
        data,
        onAddRecord,
        onUpdateRecord,
        onDeleteRecord,
        onUpdateView,
        editable,
        editor
    } = props;

    const [showSettings, setShowSettings] = useState(false);

    // 用于跟踪待处理的事件数据
    const pendingEventRef = useRef<{
        startDateTime: Date;
        endDateTime: Date;
        title?: string;
        prevDataLength: number;
    } | null>(null);

    // 获取日历配置
    const config = view.calendarConfig || {
        dateField: '',
        endDateField: undefined,
        titleField: undefined
    };

    // 获取日期字段列表
    const dateFields = useMemo(() => {
        return fields.filter(f => f.type === 'date');
    }, [fields]);

    // 获取文本字段列表（用于标题）
    const textFields = useMemo(() => {
        return fields.filter(f => f.type === 'text');
    }, [fields]);

    // 获取配置的字段
    const dateField = fields.find(f => f.id === config.dateField);
    const endDateField = config.endDateField ? fields.find(f => f.id === config.endDateField) : null;
    const titleField = config.titleField ? fields.find(f => f.id === config.titleField) : textFields[0];

    // 当 data 变化时，检查是否有待处理的事件需要更新
    useEffect(() => {
        if (pendingEventRef.current && data.length > pendingEventRef.current.prevDataLength) {
            const pending = pendingEventRef.current;
            const lastRecord = data[data.length - 1];

            if (lastRecord && dateField) {
                const updates: Partial<RecordData> = {
                    [dateField.id]: pending.startDateTime.toISOString(),
                };
                if (titleField && pending.title) {
                    updates[titleField.id] = pending.title;
                }
                if (endDateField) {
                    updates[endDateField.id] = pending.endDateTime.toISOString();
                }
                onUpdateRecord(lastRecord.id, updates);
            }

            pendingEventRef.current = null;
        }
    }, [data.length, dateField, endDateField, titleField, onUpdateRecord]);

    // 将 bitable 数据转换为日历事件格式
    const events: IEvent[] = useMemo(() => {
        if (!dateField) return [];

        return data
            .filter(record => record[dateField.id]) // 只处理有日期的记录
            .map((record, index) => {
                const startDateValue = record[dateField.id];
                let startDate: string;
                let endDate: string;

                try {
                    // 解析开始日期
                    if (typeof startDateValue === 'string') {
                        const parsedStart = parseISO(startDateValue);
                        startDate = parsedStart.toISOString();
                    } else if (startDateValue instanceof Date) {
                        startDate = startDateValue.toISOString();
                    } else {
                        return null;
                    }

                    // 解析结束日期
                    if (endDateField && record[endDateField.id]) {
                        const endDateValue = record[endDateField.id];
                        if (typeof endDateValue === 'string') {
                            const parsedEnd = parseISO(endDateValue);
                            endDate = parsedEnd.toISOString();
                        } else if (endDateValue instanceof Date) {
                            endDate = endDateValue.toISOString();
                        } else {
                            endDate = startDate;
                        }
                    } else {
                        // 如果没有结束日期，使用开始日期作为结束日期
                        endDate = startDate;
                    }

                    // 获取标题
                    const title = titleField && record[titleField.id]
                        ? String(record[titleField.id])
                        : `Record ${index + 1}`;

                    // 分配颜色（根据记录索引循环使用颜色）
                    const color = EVENT_COLORS[index % EVENT_COLORS.length]!;

                    return {
                        id: parseInt(record.id) || index + 1,
                        startDate,
                        endDate,
                        title,
                        color,
                        description: '',
                        user: DEFAULT_USER,
                        recordId: record.id // Store the record ID for mapping
                    } as IEvent;
                } catch (error) {
                    console.error('Error parsing date for record:', record.id, error);
                    return null;
                }
            })
            .filter((event): event is IEvent => event !== null);
    }, [data, dateField, endDateField, titleField]);

    // 处理添加事件
    const handleEventAdd = (formData: TEventFormData) => {
        if (!dateField) return;

        // 构建开始和结束日期时间
        const startDateTime = new Date(formData.startDate);
        if (formData.startTime) {
            startDateTime.setHours(formData.startTime.hour, formData.startTime.minute);
        }

        const endDateTime = new Date(formData.endDate);
        if (formData.endTime) {
            endDateTime.setHours(formData.endTime.hour, formData.endTime.minute);
        }

        // 保存待处理的事件数据
        pendingEventRef.current = {
            startDateTime,
            endDateTime,
            title: formData.title,
            prevDataLength: data.length
        };

        // 调用外部的添加记录回调
        onAddRecord();
    };

    // 处理更新事件
    const handleEventUpdate = (eventId: number, formData: any) => {
        if (!dateField) return;

        // 找到对应的事件来获取 recordId
        const event = events.find(e => e.id === eventId);
        if (!event || !event.recordId) {
            console.error('Event not found or missing recordId:', eventId);
            return;
        }

        const recordId = event.recordId;

        // 构建更新数据
        const updates: Partial<RecordData> = {};

        // 更新开始日期
        if (formData.startDateTime) {
            updates[dateField.id] = formData.startDateTime.toISOString();
        }

        // 更新结束日期
        if (endDateField && formData.endDateTime) {
            updates[endDateField.id] = formData.endDateTime.toISOString();
        }

        // 更新标题
        if (titleField && formData.title) {
            updates[titleField.id] = formData.title;
        }

        onUpdateRecord(recordId, updates);
    };

    // 处理配置变更
    const handleConfigChange = (key: keyof typeof config, value: string) => {
        const newConfig = {
            ...config,
            [key]: value || undefined
        };
        onUpdateView(view.id, { calendarConfig: newConfig });
    };

    // 如果没有配置日期字段，显示配置提示
    if (!config.dateField && dateFields.length > 0) {
        return (
            <div className="flex flex-col items-center justify-center p-8 space-y-4 text-center">
                <div className="text-muted-foreground">
                    <p className="text-lg font-medium mb-2">配置日历视图</p>
                    <p className="text-sm">请选择一个日期字段来显示日历视图</p>
                </div>
                <div className="w-full max-w-xs space-y-4">
                    <div className="space-y-2">
                        <Label>日期字段 *</Label>
                        <Select
                            value={config.dateField}
                            onValueChange={(value) => handleConfigChange('dateField', value)}
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

    // 如果没有日期字段，显示提示
    if (dateFields.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <p className="text-lg font-medium mb-2">暂无可用日期字段</p>
                <p className="text-sm">请先添加一个日期类型的字段来使用日历视图</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* 设置面板 */}
            {showSettings && editable && (
                <div className="p-4 border rounded-lg bg-muted/50 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-medium">日历视图设置</h3>
                        <Button variant="ghost" size="sm" onClick={() => setShowSettings(false)}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>开始日期字段 *</Label>
                            <Select
                                value={config.dateField}
                                onValueChange={(value) => handleConfigChange('dateField', value)}
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
                                    <SelectItem value="">无</SelectItem>
                                    {dateFields.map(field => (
                                        <SelectItem key={field.id} value={field.id}>
                                            {field.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>标题字段</Label>
                            <Select
                                value={config.titleField || ''}
                                onValueChange={(value) => handleConfigChange('titleField', value)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="选择标题字段（可选）" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="">自动</SelectItem>
                                    {textFields.map(field => (
                                        <SelectItem key={field.id} value={field.id}>
                                            {field.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
            )}

            {/* 日历组件 */}
            <CalendarProvider
                users={[DEFAULT_USER]}
                events={events}
                onEventAdd={handleEventAdd}
                onEventUpdate={handleEventUpdate}
                editor={editor}
                toggleSettings={() => setShowSettings(!showSettings)}
            >
                <ClientContainer />
            </CalendarProvider>
        </div>
    );
};
